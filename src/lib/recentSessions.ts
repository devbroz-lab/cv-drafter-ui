const KEY = "cvref_recent_sessions";

export interface RecentSession {
  id: string;
  label: string;
  targetFormat: string;
  updatedAt: string;
}

export function loadRecentSessions(): RecentSession[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function upsertRecentSession(entry: RecentSession): void {
  const list = loadRecentSessions().filter((s) => s.id !== entry.id);
  list.unshift(entry);
  const trimmed = list.slice(0, 20);
  localStorage.setItem(KEY, JSON.stringify(trimmed));
}

export function removeRecentSession(id: string): void {
  const list = loadRecentSessions().filter((s) => s.id !== id);
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** Human label saved at session create (CV filename), when status API has not populated yet. */
export function recentSessionLabel(sessionId: string): string | undefined {
  const label = loadRecentSessions().find((s) => s.id === sessionId)?.label?.trim();
  return label || undefined;
}
