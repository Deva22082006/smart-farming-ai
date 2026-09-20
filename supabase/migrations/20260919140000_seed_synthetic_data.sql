-- ============================================================================
-- Seed realistic synthetic data for development/demo
-- Spans Today, 7 Days, and 30 Days across all tables.
-- Uses existing schema, tables, columns, and enums strictly.
-- ============================================================================

-- 1. Ensure Devices exist with realistic active and stale statuses
insert into devices (id, device_name, location, onnx_model_version, firmware_version, last_seen_at)
values
  ('11111111-1111-1111-1111-111111111111', 'pi-node-01', 'North Plot, Row 3', 'coffee_leaf_model_v1', '0.1.0', now() - interval '3 minutes'),
  ('22222222-2222-2222-2222-222222222222', 'pi-node-02', 'South Plot, Row 1', 'coffee_leaf_model_v1', '0.1.0', now() - interval '14 minutes'),
  ('33333333-3333-3333-3333-333333333333', 'pi-node-03', 'East Hill Nursery', 'coffee_leaf_model_v1', '0.1.0', now() - interval '2 days 4 hours')
on conflict (id) do update set
  device_name = excluded.device_name,
  location = excluded.location,
  onnx_model_version = excluded.onnx_model_version,
  firmware_version = excluded.firmware_version,
  last_seen_at = excluded.last_seen_at;

-- 2. Clear old demo rows to avoid ID conflict
delete from review_queue;
delete from inference_events;
delete from hardware_logs;

-- 3. Realistic Inference Events (Spread across Today, 7 Days, and 30 Days)
insert into inference_events
  (id, device_id, captured_at, image_path, disease_class, disease_confidence, severity_score, severity_confidence, auto_actuate, dosing_duration_seconds, actuation_status, error_message)
values
  -- === TODAY (< 24 hours) ===
  -- Event 1: Today, 15m ago - Miner (Low confidence -> Pending review)
  ('a1000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   now() - interval '15 minutes', 'leaf-images/pi-node-02/20250101_2.jpg',
   'Miner', 0.56, 4, 0.42, false, null, 'pending_review', null),

  -- Event 2: Today, 45m ago - Cercospora (Low confidence -> Pending review)
  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   now() - interval '45 minutes', 'leaf-images/pi-node-01/cercospora_sample.jpg',
   'Cercospora', 0.58, 2, 0.48, false, null, 'pending_review', null),

  -- Event 3: Today, 2h ago - Rust (High confidence -> Sprayed 3s)
  ('a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   now() - interval '2 hours', 'leaf-images/pi-node-01/20250101_1.jpg',
   'Rust', 0.95, 3, 0.91, true, 3.0, 'sprayed', null),

  -- Event 4: Today, 3h ago - Healthy (High confidence -> Skipped healthy)
  ('a1000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222',
   now() - interval '3 hours', null,
   'Healthy', 0.98, 0, 0.96, false, 0, 'skipped_healthy', null),

  -- Event 5: Today, 5h ago - Phoma (Sprayed 2s)
  ('a1000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222',
   now() - interval '5 hours', 'leaf-images/pi-node-02/phoma_sample.jpg',
   'Phoma', 0.92, 2, 0.88, true, 2.0, 'sprayed', null),

  -- Event 6: Today, 7h ago - Healthy (Skipped healthy)
  ('a1000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
   now() - interval '7 hours', null,
   'Healthy', 0.97, 0, 0.95, false, 0, 'skipped_healthy', null),

  -- Event 7: Today, 9h ago - Rust (Actuation error)
  ('a1000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111',
   now() - interval '9 hours', 'leaf-images/pi-node-01/20250101_1.jpg',
   'Rust', 0.89, 3, 0.85, false, null, 'error', 'Pump pressure line below target threshold (12 PSI observed)'),

  -- === PAST 7 DAYS (2 - 7 days ago) ===
  -- Event 8: 2 days ago - Healthy
  ('a1000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111',
   now() - interval '2 days 3 hours', null,
   'Healthy', 0.99, 0, 0.98, false, 0, 'skipped_healthy', null),

  -- Event 9: 3 days ago - Miner (Sprayed 5s - Very High)
  ('a1000000-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222',
   now() - interval '3 days 6 hours', 'leaf-images/pi-node-02/20250101_2.jpg',
   'Miner', 0.94, 4, 0.92, true, 5.0, 'sprayed', null),

  -- Event 10: 4 days ago - Phoma (Skipped low confidence)
  ('a1000000-0000-0000-0000-000000000010', '33333333-3333-3333-3333-333333333333',
   now() - interval '4 days 2 hours', 'leaf-images/pi-node-02/phoma_sample.jpg',
   'Phoma', 0.52, 1, 0.44, false, null, 'skipped_low_confidence', null),

  -- Event 11: 5 days ago - Cercospora (Sprayed 2s)
  ('a1000000-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111',
   now() - interval '5 days 4 hours', 'leaf-images/pi-node-01/cercospora_sample.jpg',
   'Cercospora', 0.91, 2, 0.86, true, 2.0, 'sprayed', null),

  -- Event 12: 6 days ago - Healthy
  ('a1000000-0000-0000-0000-000000000012', '22222222-2222-2222-2222-222222222222',
   now() - interval '6 days 1 hour', null,
   'Healthy', 0.98, 0, 0.96, false, 0, 'skipped_healthy', null),

  -- === PAST 30 DAYS (8 - 30 days ago) ===
  -- Event 13: 10 days ago - Rust (Sprayed 3s)
  ('a1000000-0000-0000-0000-000000000013', '11111111-1111-1111-1111-111111111111',
   now() - interval '10 days', 'leaf-images/pi-node-01/20250101_1.jpg',
   'Rust', 0.93, 3, 0.89, true, 3.0, 'sprayed', null),

  -- Event 14: 15 days ago - Miner (Sprayed 1s - Very Low)
  ('a1000000-0000-0000-0000-000000000014', '22222222-2222-2222-2222-222222222222',
   now() - interval '15 days', 'leaf-images/pi-node-02/20250101_2.jpg',
   'Miner', 0.90, 1, 0.85, true, 1.0, 'sprayed', null),

  -- Event 15: 22 days ago - Healthy
  ('a1000000-0000-0000-0000-000000000015', '33333333-3333-3333-3333-333333333333',
   now() - interval '22 days', null,
   'Healthy', 0.99, 0, 0.97, false, 0, 'skipped_healthy', null);

-- 4. Review Queue records (matching pending, reviewed, and dismissed items)
insert into review_queue
  (id, inference_event_id, image_path, status, reviewed_by, reviewed_at, corrected_disease_class, corrected_severity_score, reviewer_notes, used_for_retraining)
values
  -- Item 1: Pending review (Miner on pi-node-02)
  ('b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   'leaf-images/pi-node-02/20250101_2.jpg', 'pending', null, null, null, null, null, false),

  -- Item 2: Pending review (Cercospora on pi-node-01)
  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002',
   'leaf-images/pi-node-01/cercospora_sample.jpg', 'pending', null, null, null, null, null, false),

  -- Item 3: Reviewed item with agronomist correction (Rust on pi-node-01)
  ('b2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003',
   'leaf-images/pi-node-01/20250101_1.jpg', 'reviewed', 'lead.agronomist@terratrace.farm',
   now() - interval '1 hour', 'Rust', 3, 'Confirmed active urediniospores with moderate leaf yellowing.', true),

  -- Item 4: Dismissed item (Phoma on pi-node-02)
  ('b2000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000005',
   'leaf-images/pi-node-02/phoma_sample.jpg', 'dismissed', 'lead.agronomist@terratrace.farm',
   now() - interval '4 hours', null, null, 'Marginal necrosis within acceptable threshold; non-spreading.', false);

-- 5. Hardware Logs
insert into hardware_logs (id, device_id, event_type, message, metadata, occurred_at)
values
  ('c3000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'startup', 'Node initial boot: ONNX Runtime opset 17 initialized in 1.4s',
   '{"onnx_opset": 17, "boot_seconds": 1.4, "power_v": 5.12}'::jsonb, now() - interval '10 hours'),

  ('c3000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'pump_fault', 'Dosing actuator timeout: target 40 PSI not achieved in 3.0s',
   '{"target_psi": 40, "observed_psi": 12, "flow_lpm": 0.05}'::jsonb, now() - interval '9 hours'),

  ('c3000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'connectivity_restored', 'Cellular MQTT uplink re-established, synced 4 events',
   '{"signal_csq": 24, "latency_ms": 78}'::jsonb, now() - interval '8 hours 30 minutes'),

  ('c3000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222',
   'manual_override', 'Manual nozzle flush test completed by field technician',
   '{"duration_s": 5.0, "volume_ml": 85}'::jsonb, now() - interval '6 hours'),

  ('c3000000-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333',
   'camera_fault', 'MIPI-CSI image sensor read timeout; auto-recovery attempted',
   '{"retries": 3, "status_code": 110}'::jsonb, now() - interval '2 days 4 hours');
