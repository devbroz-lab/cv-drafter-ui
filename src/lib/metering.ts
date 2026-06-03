import { authorizedFetch } from "./api";

export type MeterRates = {
  credit_usd: number;
  pipeline_run_usd: number;
  revision_usd: number;
  initial_grant_credits: number;
  pipeline_run_credits: string;
  revision_credits: string;
};

export type MeterBalance = {
  available_credits: string;
  reserved_credits: string;
  total_credits: string;
  rates: MeterRates;
};

export type MeterLedgerEntry = {
  id: string;
  session_id: string | null;
  event_type: string;
  amount_credits: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export function formatCredits(value: string | number): string {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(n)) return String(value);
  const abs = Math.abs(n);
  if (abs === 0) return "0";
  if (abs < 1) return n.toFixed(2).replace(/\.?0+$/, "");
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

export function parseCredits(value: string | number | undefined): number {
  if (value === undefined) return 0;
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isFinite(n) ? n : 0;
}

export function isInsufficientCreditsError(detail: unknown): detail is {
  message: string;
  required_credits: string;
  available_credits: string;
  event: string;
} {
  return (
    typeof detail === "object" &&
    detail !== null &&
    "required_credits" in detail &&
    "available_credits" in detail &&
    "event" in detail
  );
}

export async function fetchMeterBalance(token: string): Promise<MeterBalance> {
  const res = await authorizedFetch("/metering/balance", { method: "GET" }, token);
  return res.json() as Promise<MeterBalance>;
}

export async function fetchMeterLedger(
  token: string,
  limit = 50,
): Promise<{ entries: MeterLedgerEntry[] }> {
  const res = await authorizedFetch(`/metering/ledger?limit=${limit}`, { method: "GET" }, token);
  return res.json() as Promise<{ entries: MeterLedgerEntry[] }>;
}
