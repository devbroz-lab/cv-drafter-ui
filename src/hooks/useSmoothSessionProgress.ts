import { useEffect, useRef, useState } from "react";

/**
 * Progress shown in the live strip — monotonic within a session so brief poll gaps
 * cannot make the bar jump backward.
 */
export function useSmoothSessionProgress(sessionId: string, targetPct: number): number {
  const maxRef = useRef(0);
  const [displayPct, setDisplayPct] = useState(() => clampPct(targetPct));

  useEffect(() => {
    maxRef.current = 0;
    setDisplayPct(clampPct(targetPct));
  }, [sessionId]);

  useEffect(() => {
    const capped = clampPct(targetPct);
    const next =
      capped >= 100 ? 100 : Math.max(maxRef.current, capped);
    maxRef.current = next;
    setDisplayPct(next);
  }, [targetPct]);

  return displayPct;
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
