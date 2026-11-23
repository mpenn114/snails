/** Subset of the Web Storage API used for persistence. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Persisted identity of this controller. */
export interface StoredSession {
  name: string;
  roomCode: string;
  sessionToken?: string;
}

const KEY = 'snails.session';

/** Loads the stored session, or undefined when absent or corrupt. */
export function loadSession(storage: StorageLike | undefined): StoredSession | undefined {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return undefined;
    const v = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof v.name !== 'string' || typeof v.roomCode !== 'string') return undefined;
    const s: StoredSession = { name: v.name, roomCode: v.roomCode };
    if (typeof v.sessionToken === 'string') s.sessionToken = v.sessionToken;
    return s;
  } catch {
    return undefined;
  }
}

/**
 * True when a full page reload should rejoin straight away: a session token is stored and the
 * join screen holds the same name and room as that session.
 */
export function canAutoResume(
  stored: StoredSession | undefined,
  values: { name: string; room: string },
): boolean {
  return (
    stored?.sessionToken !== undefined &&
    stored.roomCode === values.room &&
    stored.name === values.name.trim() &&
    values.room !== ''
  );
}

/**
 * Saves the session; storage failures are ignored. A save without a token keeps the token of an
 * already stored session for the same room, so re-submitting the join form still rejoins.
 */
export function saveSession(storage: StorageLike | undefined, s: StoredSession): void {
  try {
    const prev = s.sessionToken === undefined ? loadSession(storage) : undefined;
    const next: StoredSession =
      prev?.sessionToken !== undefined && prev.roomCode === s.roomCode
        ? { ...s, sessionToken: prev.sessionToken }
        : s;
    storage?.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}

/** Removes the stored session. */
export function clearSession(storage: StorageLike | undefined): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
