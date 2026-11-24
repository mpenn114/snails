/** Press-and-hold reveal for hot-seat phones: research shows only while the finger is down. */
export interface HoldReveal {
  /** True while the secret screen should be visible. */
  readonly revealed: boolean;
  /** Finger down (or key down). */
  press(): void;
  /** Finger up / leave / cancel: hides again. */
  release(): void;
  /** Hides at once (turn change, screen closed); same as release. */
  reset(): void;
  /** Subscribes to changes of `revealed`. */
  onChange(fn: (revealed: boolean) => void): () => void;
}

/** Creates the hold-to-reveal state machine (idempotent press/release). */
export function createHoldReveal(): HoldReveal {
  let revealed = false;
  const listeners = new Set<(r: boolean) => void>();
  const set = (v: boolean): void => {
    if (v === revealed) return;
    revealed = v;
    listeners.forEach((fn) => fn(v));
  };
  return {
    get revealed() {
      return revealed;
    },
    press: () => set(true),
    release: () => set(false),
    reset: () => set(false),
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** Picks the team the screen acts for: the active team in hot-seat (if ours), else our team. */
export function actingTeam(
  hotSeat: boolean,
  myTeamIds: readonly string[],
  activeTeamId: string | null,
  myTeamId: string | null,
): string | null {
  if (hotSeat) {
    return activeTeamId !== null && myTeamIds.includes(activeTeamId) ? activeTeamId : null;
  }
  return myTeamId ?? myTeamIds[0] ?? null;
}
