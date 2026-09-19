-- ============================================================================
-- Smart Farming AI -- Phase 2 schema
-- Tables: devices, dosing_config, inference_events, review_queue, hardware_logs
-- Plus the leaf-images storage bucket.
--
-- Source-of-truth alignment: disease_class_enum and severity ordering below
-- must exactly match model_config.json's disease_names / severity_names
-- (Healthy, Miner, Rust, Phoma, Cercospora / index 0-4 severity). If the
-- model's class list ever changes, this migration's enum must change with it
-- in the same PR -- that coupling is deliberate, not an oversight.
-- ============================================================================

create extension if not exists pgcrypto;  -- provides gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type disease_class_enum as enum (
  'Healthy', 'Miner', 'Rust', 'Phoma', 'Cercospora'
);

create type actuation_status_enum as enum (
  'sprayed', 'skipped_low_confidence', 'skipped_healthy', 'pending_review', 'error'
);

create type review_status_enum as enum (
  'pending', 'reviewed', 'dismissed'
);

create type hardware_event_enum as enum (
  'startup', 'shutdown', 'pump_fault', 'camera_fault',
  'connectivity_lost', 'connectivity_restored', 'manual_override'
);

-- ----------------------------------------------------------------------------
-- devices: registry of each Pi node (supports multiple farm nodes later)
-- ----------------------------------------------------------------------------
create table devices (
  id uuid primary key default gen_random_uuid(),
  device_name text not null unique,
  location text,
  onnx_model_version text,           -- ties telemetry back to the exact checkpoint running
  firmware_version text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

comment on column devices.onnx_model_version is
  'Free-text tag (e.g. a git SHA or export date) identifying which coffee_leaf_model.onnx this device is running -- needed to explain accuracy drift across a fleet running different model versions.';

-- ----------------------------------------------------------------------------
-- dosing_config: severity -> pump duration lookup, editable without redeploy
-- ----------------------------------------------------------------------------
create table dosing_config (
  severity_score smallint primary key check (severity_score between 0 and 4),
  severity_label text not null,
  pump_duration_seconds real not null check (pump_duration_seconds >= 0)
);

-- ----------------------------------------------------------------------------
-- inference_events: one row per captured leaf image -> prediction -> action
-- ----------------------------------------------------------------------------
create table inference_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references devices(id) on delete set null,
  captured_at timestamptz not null default now(),

  -- image_path is populated ONLY for low-confidence / review-queued events,
  -- to avoid storing every single frame -- matches the flow diagram's
  -- "Telegram alert: low confidence -> human review" branch, now via Storage
  -- + the app instead of Telegram.
  image_path text,

  disease_class disease_class_enum not null,
  disease_confidence real not null check (disease_confidence between 0 and 1),

  severity_score smallint not null check (severity_score between 0 and 4),
  -- Denormalized on purpose: this is a high-read telemetry/log table, and
  -- avoiding a join to dosing_config for every dashboard query is worth the
  -- (small, append-only) duplication. severity_score remains the source of
  -- truth for any ordinal math (sorting, MAE-style aggregates).
  severity_label text generated always as (
    case severity_score
      when 0 then 'Healthy'
      when 1 then 'Very Low'
      when 2 then 'Low'
      when 3 then 'High'
      when 4 then 'Very High'
    end
  ) stored,
  severity_confidence real not null check (severity_confidence between 0 and 1),

  auto_actuate boolean not null,
  dosing_duration_seconds real check (dosing_duration_seconds >= 0),
  actuation_status actuation_status_enum not null,
  error_message text,

  created_at timestamptz not null default now()
);

create index idx_inference_events_device_time on inference_events (device_id, captured_at desc);
create index idx_inference_events_disease on inference_events (disease_class);
create index idx_inference_events_needs_review on inference_events (actuation_status)
  where actuation_status = 'pending_review';

-- ----------------------------------------------------------------------------
-- review_queue: human-in-the-loop corrections, feeds active learning later
-- ----------------------------------------------------------------------------
create table review_queue (
  id uuid primary key default gen_random_uuid(),
  inference_event_id uuid not null references inference_events(id) on delete cascade,
  image_path text not null,

  status review_status_enum not null default 'pending',
  reviewed_by text,
  reviewed_at timestamptz,

  corrected_disease_class disease_class_enum,
  corrected_severity_score smallint check (corrected_severity_score between 0 and 4),
  reviewer_notes text,

  -- Flips to true once an export job pulls this correction into a retraining
  -- dataset, so the same correction isn't reused/double-counted across runs.
  used_for_retraining boolean not null default false,

  created_at timestamptz not null default now(),

  constraint review_requires_correction_when_reviewed check (
    status <> 'reviewed'
    or (corrected_disease_class is not null and corrected_severity_score is not null)
  )
);

create index idx_review_queue_status on review_queue (status);
create index idx_review_queue_retraining on review_queue (used_for_retraining) where status = 'reviewed';

-- ----------------------------------------------------------------------------
-- hardware_logs: events not tied to a specific prediction (faults, restarts)
-- ----------------------------------------------------------------------------
create table hardware_logs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references devices(id) on delete set null,
  event_type hardware_event_enum not null,
  message text,
  metadata jsonb,
  occurred_at timestamptz not null default now()
);

create index idx_hardware_logs_device_time on hardware_logs (device_id, occurred_at desc);

-- ----------------------------------------------------------------------------
-- Storage: bucket for review-queue / low-confidence images
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('leaf-images', 'leaf-images', false)
on conflict (id) do nothing;

-- Storage object-level RLS policies are intentionally NOT defined in this
-- migration -- they depend on the Phase 4 app auth model (not yet decided),
-- and are simpler to get right via Studio's Storage policy editor than as
-- raw SQL against storage.objects. Configure them once auth is decided;
-- until then this bucket is private (public=false) and only the service
-- role (used by the Pi's upload code) can write to it.

-- ----------------------------------------------------------------------------
-- Row Level Security
-- Conservative placeholder policies -- Phase 4 hasn't decided the app's auth
-- model yet. These allow any AUTHENTICATED Supabase user full dashboard
-- read access and review-queue read/update access, and deny anonymous
-- access entirely. The service role (used by edge_pi/sync/supabase_client.py)
-- bypasses RLS by default, so device writes are unaffected by these policies.
-- Revisit before Phase 4 ships if the app needs per-user/per-farm scoping.
-- ----------------------------------------------------------------------------
alter table devices enable row level security;
alter table dosing_config enable row level security;
alter table inference_events enable row level security;
alter table review_queue enable row level security;
alter table hardware_logs enable row level security;

create policy "authenticated read devices" on devices
  for select to authenticated using (true);

create policy "authenticated read dosing_config" on dosing_config
  for select to authenticated using (true);

create policy "authenticated read inference_events" on inference_events
  for select to authenticated using (true);

create policy "authenticated read hardware_logs" on hardware_logs
  for select to authenticated using (true);

create policy "authenticated read review_queue" on review_queue
  for select to authenticated using (true);

create policy "authenticated update review_queue" on review_queue
  for update to authenticated using (true) with check (true);
