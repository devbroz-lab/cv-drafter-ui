export type SessionStatus =
  | "queued"
  | "processing"
  | "checkpoint_1_pending"
  | "checkpoint_2_pending"
  | "reviewer_blocked"
  /** @deprecated No longer entered by new sessions. Retained for back-compat with existing DB rows. */
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

export interface WarningEntry {
  stage: string;
  kind: string;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface ManifestStep {
  name: string;
  status: string;
  started_at?: string | null;
  completed_at: string | null;
}

export interface ManifestResponse {
  session_id: string;
  db_status: SessionStatus;
  steps: ManifestStep[];
  checkpoint_pending: string | null;
  reviewer_blocked: boolean;
  /** 0–100 from backend step weights; omit on older API builds. */
  progress?: number;
  current_step?: string | null;
  warnings?: WarningEntry[];
}

export interface SessionSummary {
  session_id: string;
  status: SessionStatus;
  target_format: TargetFormat;
  round: number;
  source_filename: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface SessionListResponse {
  sessions: SessionSummary[];
}

export interface SessionCreateResponse {
  session_id: string;
  status: SessionStatus;
}

// ── Review findings ───────────────────────────────────────────────────────────

/** "pipeline" = field_editor can fix by rewriting; "human" = recruiter must act */
export type Solvability = "pipeline" | "human";

export interface HighSeverityIssue {
  /** Machine-readable dot-path into CVData for the flagged field */
  path?: string;
  /** Human-readable label for UI display */
  field?: string;
  issue?: string;
  recommendation?: string;
  /** Added by the content_reviewer migration — may be absent on older sessions */
  solvability?: Solvability;
  _injected_by_postprocessing?: boolean;
}

export interface LowSeverityIssue {
  path?: string;
  field?: string;
  issue?: string;
  original?: string;
  fixed?: string;
  solvability?: Solvability;
}

export interface ReviewResponse {
  session_id: string;
  high_severity: HighSeverityIssue[];
  low_severity: LowSeverityIssue[];
  passed: boolean;
  generation_warnings: string[];
}

export interface ReviewData {
  high_severity: HighSeverityIssue[];
  low_severity: LowSeverityIssue[];
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

// ── Generated fields (format-specific bullets) ───────────────────────────────

export interface GeneratedField {
  field_key: string;
  content: string;
  source?: "tor" | "generated" | string;
  [k: string]: unknown;
}

/** Narrow view of cv_data that exposes generated_fields typed. */
export interface CVDataLite {
  generated_fields?: GeneratedField[];
  [k: string]: unknown;
}

// ── Field editor ──────────────────────────────────────────────────────────────

export interface FieldEditItem {
  field_path: string;
  instruction: string;
  /** Clicked text from DocxViewer — backend resolves placeholder paths like paragraph_<n>. */
  anchor_text?: string;
}

export interface SkippedEditItem {
  path: string;
  reason?: string;
}

export interface FieldEditResponse {
  session_id: string;
  status: SessionStatus;
  /** Round number after increment — present in the backend response */
  round: number;
  applied: string[];
  /** Backend may return plain strings or {path, reason} objects */
  skipped: Array<string | SkippedEditItem>;
  message: string;
}

// ── Composite cell types (used by DocxViewer / FieldSelectorTooltip) ─────────

export interface CompositeCellOption {
  label: string;
  dotPath: string;
}

// ── Output response ───────────────────────────────────────────────────────────

export interface OutputResponse {
  session_id: string;
  cv_data: CVDataLite;
  generation_warnings: string[];
  review: ReviewData | null;
  compression: Record<string, unknown> | null;
}
