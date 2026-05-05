export type SessionStatus =
  | "queued"
  | "processing"
  | "checkpoint_1_pending"
  | "checkpoint_2_pending"
  | "reviewer_blocked"
  | "field_editor_pending"
  | "checkpoint_3_pending"
  | "completed"
  | "failed";

export type TargetFormat = "giz" | "world_bank";

export interface SessionStatusResponse {
  session_id: string;
  user_id: string | null;
  status: SessionStatus;
  target_format: TargetFormat;
  round: number;
  source_filename: string;
  tor_filename: string | null;
  source_storage_key: string | null;
  tor_storage_key: string | null;
  output_storage_key: string | null;
  output_file_path: string | null;
  download_url: string | null;
  error_message: string | null;
  page_limit: number | null;
  job_description: string | null;
  recruiter_comments: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ManifestStep {
  name: string;
  status: string;
  completed_at: string | null;
}

export interface ManifestResponse {
  session_id: string;
  db_status: SessionStatus;
  steps: ManifestStep[];
  checkpoint_pending: string | null;
  reviewer_blocked: boolean;
}

export interface SessionCreateResponse {
  session_id: string;
  status: SessionStatus;
}

export interface HighSeverityIssue {
  field?: string;
  issue?: string;
  recommendation?: string;
}

export interface ReviewResponse {
  session_id: string;
  high_severity: HighSeverityIssue[];
  low_severity: Array<{ field?: string; issue?: string; original?: string; fixed?: string }>;
  passed: boolean;
  generation_warnings: string[];
}

export interface ReviewData {
  high_severity: HighSeverityIssue[];
  low_severity: Array<{ field?: string; issue?: string; original?: string; fixed?: string }>;
  passed: boolean;
}

// ── ToR pool selection ────────────────────────────────────────────────────────

export interface TorPoolsResponse {
  session_id: string;
  pools: Record<string, unknown>[];
  selected_pool_index: number | null;
}

export interface TorPoolSelectionResponse {
  session_id: string;
  selected_pool_index: number;
  pool_count: number;
  position_title: string | null;
  message: string;
}

// ── Field editor ──────────────────────────────────────────────────────────────

export interface FieldEditItem {
  field_path: string;
  instruction: string;
}

export interface FieldEditResponse {
  session_id: string;
  status: SessionStatus;
  applied: string[];
  skipped: string[];
  message: string;
}

export interface OutputResponse {
  session_id: string;
  cv_data: Record<string, unknown>;
  generation_warnings: string[];
  review: ReviewData | null;
  compression: Record<string, unknown> | null;
}
