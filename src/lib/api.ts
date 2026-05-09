import type {
  FieldEditItem,
  FieldEditResponse,
  ManifestResponse,
  OutputResponse,
  ReviewResponse,
  SessionCreateResponse,
  SessionStatusResponse,
  TorPoolSelectionResponse,
  TorPoolsResponse,
} from "./types";
import { refreshAccessToken } from "./authApi";
import { clearStoredSession } from "./authStorage";

const BASE = () => import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail));
    this.status = status;
    this.detail = detail;
  }
}

function parseDetail(data: unknown): string {
  if (data && typeof data === "object" && "detail" in data) {
    const d = (data as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (d !== null && typeof d === "object") return JSON.stringify(d);
  }
  return "Request failed";
}

export async function fetchHealth(): Promise<{ status: string }> {
  const res = await fetch(`${BASE()}/health`);
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  return res.json() as Promise<{ status: string }>;
}

async function authorizedFetch(
  path: string,
  init: RequestInit,
  token: string | null,
): Promise<Response> {
  let currentToken = token;

  async function doFetch(): Promise<Response> {
    const headers = new Headers(init.headers);
    if (currentToken) headers.set("Authorization", `Bearer ${currentToken}`);
    return fetch(`${BASE()}${path}`, { ...init, headers });
  }

  let res = await doFetch();
  if (res.status === 401) {
    try {
      currentToken = await refreshAccessToken();
      res = await doFetch();
    } catch {
      clearStoredSession();
      throw new ApiError(401, "Unauthorized. Please sign in again.");
    }
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new ApiError(res.status, body);
  }
  return res;
}

export async function createSession(
  token: string,
  body: {
    target_format: "giz" | "world_bank";
    source_filename: string;
    tor_filename?: string | null;
    // proposed_position is derived from the selected ToR pool at checkpoint_1;
    // it is NOT supplied at session creation.
    category?: string | null;
    employer?: string | null;
    years_with_firm?: string | null;
    page_limit?: number | null;
    job_description?: string | null;
    recruiter_comments?: string | null;
  },
): Promise<SessionCreateResponse> {
  const res = await authorizedFetch(
    "/sessions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    token,
  );
  return res.json() as Promise<SessionCreateResponse>;
}

export async function getSessionStatus(token: string, sessionId: string): Promise<SessionStatusResponse> {
  const res = await authorizedFetch(`/sessions/${sessionId}/status`, { method: "GET" }, token);
  return res.json() as Promise<SessionStatusResponse>;
}

export async function uploadSource(token: string, sessionId: string, file: File): Promise<unknown> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await authorizedFetch(
    `/sessions/${sessionId}/upload/source`,
    { method: "POST", body: fd },
    token,
  );
  return res.json();
}

export async function uploadTor(token: string, sessionId: string, file: File): Promise<unknown> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await authorizedFetch(
    `/sessions/${sessionId}/upload/tor`,
    { method: "POST", body: fd },
    token,
  );
  return res.json();
}

export async function startSession(token: string, sessionId: string): Promise<unknown> {
  const res = await authorizedFetch(`/sessions/${sessionId}/start`, { method: "POST" }, token);
  return res.json();
}

export async function getManifest(token: string, sessionId: string): Promise<ManifestResponse> {
  const res = await authorizedFetch(`/sessions/${sessionId}/manifest`, { method: "GET" }, token);
  return res.json() as Promise<ManifestResponse>;
}

export async function approveCheckpoint(
  token: string,
  sessionId: string,
  checkpoint: "checkpoint_1" | "checkpoint_2" | "checkpoint_3",
  notes = "",
): Promise<unknown> {
  const res = await authorizedFetch(
    `/sessions/${sessionId}/approve/${checkpoint}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    },
    token,
  );
  return res.json();
}

export async function getReview(token: string, sessionId: string): Promise<ReviewResponse> {
  const res = await authorizedFetch(`/sessions/${sessionId}/review`, { method: "GET" }, token);
  return res.json() as Promise<ReviewResponse>;
}

export async function resolveReview(
  token: string,
  sessionId: string,
  payload: { overrides: Record<string, string>; force_pass: boolean },
): Promise<unknown> {
  const res = await authorizedFetch(
    `/sessions/${sessionId}/resolve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    token,
  );
  return res.json();
}

export async function getOutput(token: string, sessionId: string): Promise<OutputResponse> {
  const res = await authorizedFetch(`/sessions/${sessionId}/output`, { method: "GET" }, token);
  return res.json() as Promise<OutputResponse>;
}

export async function getOutputDownloadUrl(
  token: string,
  sessionId: string,
): Promise<{ signed_url: string; expires_in: number }> {
  const res = await authorizedFetch(
    `/sessions/${sessionId}/files/output/download-url`,
    { method: "GET" },
    token,
  );
  return res.json() as Promise<{ signed_url: string; expires_in: number }>;
}

/**
 * @deprecated Use submitFieldEdits() instead. POST /comments is deprecated on
 * the backend and will be removed in a future release. The backend still accepts
 * it but returns Deprecation response headers.
 */
export async function submitComment(token: string, sessionId: string, comment: string): Promise<unknown> {
  const res = await authorizedFetch(
    `/sessions/${sessionId}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment }),
    },
    token,
  );
  return res.json();
}

export async function patchSessionStatus(
  token: string,
  sessionId: string,
  body: { status: string; output_file_path?: string | null; error_message?: string | null },
): Promise<SessionStatusResponse> {
  const res = await authorizedFetch(
    `/sessions/${sessionId}/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    token,
  );
  return res.json() as Promise<SessionStatusResponse>;
}

// ── ToR pool selection ────────────────────────────────────────────────────────

export async function getTorPools(token: string, sessionId: string): Promise<TorPoolsResponse> {
  const res = await authorizedFetch(`/sessions/${sessionId}/tor/pools`, { method: "GET" }, token);
  return res.json() as Promise<TorPoolsResponse>;
}

export async function selectTorPool(
  token: string,
  sessionId: string,
  poolIndex: number,
): Promise<TorPoolSelectionResponse> {
  const res = await authorizedFetch(
    `/sessions/${sessionId}/tor/select-pool`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selected_pool_index: poolIndex }),
    },
    token,
  );
  return res.json() as Promise<TorPoolSelectionResponse>;
}

// ── Field editor ──────────────────────────────────────────────────────────────

export async function submitFieldEdits(
  token: string,
  sessionId: string,
  edits: FieldEditItem[],
): Promise<FieldEditResponse> {
  const res = await authorizedFetch(
    `/sessions/${sessionId}/field-edit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edits }),
    },
    token,
  );
  return res.json() as Promise<FieldEditResponse>;
}

export function formatApiError(e: unknown): string {
  if (e instanceof ApiError) return parseDetail({ detail: e.detail });
  if (e instanceof Error) return e.message;
  return String(e);
}
