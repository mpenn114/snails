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

/** Saves the session; storage failures are ignored. */
export function saveSession(storage: StorageLike | undefined, s: StoredSession): void {
  try {
    storage?.setItem(KEY, JSON.stringify(s));
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
