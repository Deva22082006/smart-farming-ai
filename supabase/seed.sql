-- ============================================================================
-- Sample data for local/preview-branch testing.
-- Run automatically by `supabase start` / Preview Branches after migrations.
-- ============================================================================

-- dosing_config: exact values from the project's flow diagram (Step 7)
insert into dosing_config (severity_score, severity_label, pump_duration_seconds) values
  (0, 'Healthy',   0),
  (1, 'Very Low',  1),
  (2, 'Low',       2),
  (3, 'High',      3),
  (4, 'Very High', 5);

-- devices: two fictional farm nodes
insert into devices (id, device_name, location, onnx_model_version, firmware_version, last_seen_at) values
  ('11111111-1111-1111-1111-111111111111', 'pi-node-01', 'North Plot, Row 3', 'coffee_leaf_model_v1', '0.1.0', now() - interval '2 minutes'),
  ('22222222-2222-2222-2222-222222222222', 'pi-node-02', 'South Plot, Row 1', 'coffee_leaf_model_v1', '0.1.0', now() - interval '1 day');

-- inference_events: a mix of auto-actuated, skipped-healthy, and low-confidence cases
insert into inference_events
  (id, device_id, captured_at, image_path, disease_class, disease_confidence,
   severity_score, severity_confidence, auto_actuate, dosing_duration_seconds, actuation_status)
values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   now() - interval '3 hours', null, 'Healthy', 0.99, 0, 0.98, true, 0, 'skipped_healthy'),

  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   now() - interval '2 hours 50 minutes', null, 'Rust', 0.94, 2, 0.87, true, 2, 'sprayed'),

  ('a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   now() - interval '2 hours 40 minutes', 'leaf-images/pi-node-01/20250101_1.jpg',
   'Cercospora', 0.61, 3, 0.42, false, null, 'pending_review'),

  ('a1000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222',
   now() - interval '1 hour', null, 'Phoma', 0.91, 3, 0.88, true, 3, 'sprayed'),

  ('a1000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222',
   now() - interval '30 minutes', 'leaf-images/pi-node-02/20250101_2.jpg',
   'Miner', 0.55, 4, 0.39, false, null, 'pending_review');

-- review_queue: one pending, one already reviewed-with-correction
insert into review_queue
  (id, inference_event_id, image_path, status, reviewed_by, reviewed_at,
   corrected_disease_class, corrected_severity_score, reviewer_notes, used_for_retraining)
values
  ('b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003',
   'leaf-images/pi-node-01/20250101_1.jpg', 'pending', null, null, null, null, null, false),

  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000005',
   'leaf-images/pi-node-02/20250101_2.jpg', 'reviewed', 'agronomist@example.com', now() - interval '10 minutes',
   'Miner', 3, 'Model called Very High, actual lesion coverage was closer to High.', false);

-- hardware_logs: a startup and a resolved pump fault
insert into hardware_logs (device_id, event_type, message, metadata, occurred_at) values
  ('11111111-1111-1111-1111-111111111111', 'startup', 'Pi booted, model loaded successfully',
   jsonb_build_object('onnx_opset', 17, 'boot_seconds', 42.3), now() - interval '3 hours 5 minutes'),
  ('22222222-2222-2222-2222-222222222222', 'pump_fault', 'Pump did not reach target PSI within timeout',
   jsonb_build_object('target_psi', 40, 'observed_psi', 12), now() - interval '5 hours'),
  ('22222222-2222-2222-2222-222222222222', 'connectivity_restored', 'Reconnected to Supabase after outage',
   jsonb_build_object('offline_duration_seconds', 340), now() - interval '4 hours 50 minutes');
