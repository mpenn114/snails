/** Remaining time under which the timer shows a warning. */
export const WARNING_MS = 5000;

/** Local countdown model synced by server `turnStart` and `turnTimer`. */
export interface TimerModel {
  remainingMs: number;
  syncedAt: number;
}

/** Starts a model from a `turnStart` duration. */
export function startTimer(durationMs: number, now: number): TimerModel {
  return { remainingMs: durationMs, syncedAt: now };
}

/** Applies a server `turnTimer` correction. */
export function syncTimer(remainingMs: number, now: number): TimerModel {
  return { remainingMs, syncedAt: now };
}

/** Remaining milliseconds at `now` (never negative). */
export function remainingAt(m: TimerModel, now: number): number {
  return Math.max(0, m.remainingMs - (now - m.syncedAt));
}

/** Formats remaining ms as whole seconds rounded up (e.g. `12`), or `m:ss` from one minute. */
export function formatTimer(ms: number): string {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  if (s < 60) return String(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** True when the warning colour applies. */
export function isWarning(ms: number): boolean {
  return ms < WARNING_MS;
}

/** Human label for whose turn it is. */
export function turnLabel(
  teamName: string | null,
  snailName: string | null,
  mine: boolean,
): string {
  if (mine) return 'Your turn';
  if (!teamName) return 'Waiting...';
  return snailName ? `${teamName}: ${snailName}` : teamName;
}
