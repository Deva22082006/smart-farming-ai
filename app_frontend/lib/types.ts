// ============================================================================
// TypeScript interfaces matching the Supabase database schema exactly.
// Do not add, rename, or remove any fields — these mirror the DB 1:1.
// ============================================================================

// ----- Enum / union types -----

export type DiseaseClass =
  | 'Healthy'
  | 'Miner'
  | 'Rust'
  | 'Phoma'
  | 'Cercospora';

export type ActuationStatus =
  | 'sprayed'
  | 'skipped_low_confidence'
  | 'skipped_healthy'
  | 'pending_review'
  | 'error';

export type ReviewStatus = 'pending' | 'reviewed' | 'dismissed';

export type HardwareEventType =
  | 'startup'
  | 'shutdown'
  | 'pump_fault'
  | 'camera_fault'
  | 'connectivity_lost'
  | 'connectivity_restored'
  | 'manual_override';

// ----- Table row interfaces -----

export interface Device {
  id: string;
  device_name: string;
  location: string | null;
  onnx_model_version: string | null;
  firmware_version: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface DosingConfig {
  severity_score: number; // 0-4
  severity_label: string;
  pump_duration_seconds: number;
}

export interface InferenceEvent {
  id: string;
  device_id: string | null;
  captured_at: string;
  image_path: string | null;
  disease_class: DiseaseClass;
  disease_confidence: number;
  severity_score: number; // 0-4
  severity_label: string; // generated column
  severity_confidence: number;
  auto_actuate: boolean;
  dosing_duration_seconds: number | null;
  actuation_status: ActuationStatus;
  error_message: string | null;
  created_at: string;
}

export interface ReviewQueueItem {
  id: string;
  inference_event_id: string;
  image_path: string;
  status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  corrected_disease_class: DiseaseClass | null;
  corrected_severity_score: number | null;
  reviewer_notes: string | null;
  used_for_retraining: boolean;
  created_at: string;
}

export interface HardwareLog {
  id: string;
  device_id: string | null;
  event_type: HardwareEventType;
  message: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

// ----- Joined/extended types used by the UI -----

/** ReviewQueueItem with the linked inference event data for context. */
export interface ReviewQueueItemWithEvent extends ReviewQueueItem {
  inference_events: Pick<
    InferenceEvent,
    | 'disease_class'
    | 'disease_confidence'
    | 'severity_label'
    | 'severity_score'
    | 'severity_confidence'
    | 'captured_at'
    | 'device_id'
  > | null;
}

// ----- Severity helpers -----

export const SEVERITY_LABELS: Record<number, string> = {
  0: 'Healthy',
  1: 'Very Low',
  2: 'Low',
  3: 'High',
  4: 'Very High',
};

export const DISEASE_CLASSES: DiseaseClass[] = [
  'Healthy',
  'Miner',
  'Rust',
  'Phoma',
  'Cercospora',
];
