/** Phone text size choices. */
export type PrefTextSize = 'small' | 'normal' | 'large';

/** All user-facing phone preferences except audio (which uses the shared `snails.audio` record). */
export interface Prefs {
  textSize: PrefTextSize;
  reducedMotion: boolean;
  /** Tutorial finished or skipped. */
  tutorialSeen: boolean;
  /** The Aim button has been used once (stops its attention pulse). */
  aimButtonUsed: boolean;
}

/** Storage subset the helper needs; writers are optional so read-only stubs still type-check. */
export interface PrefsStorage {
  getItem(key: string): string | null;
  setItem?(key: string, value: string): void;
  removeItem?(key: string): void;
}

/** Defaults used for anything missing or invalid. */
export const DEFAULT_PREFS: Readonly<Prefs> = {
  textSize: 'normal',
  reducedMotion: false,
  tutorialSeen: false,
  aimButtonUsed: false,
};

/** Versioned storage key; bump the suffix when the shape changes incompatibly. */
export const PREFS_KEY = 'snails.prefs.v1';

/** Pre-v1 keys, migrated on first load and removed after the first save. */
export const LEGACY_KEYS = {
  a11y: 'snails.a11y',
  tutorialSeen: 'snails.tutorialSeen',
  aimButtonUsed: 'snails.aimButtonUsed',
} as const;

const SIZES: readonly PrefTextSize[] = ['small', 'normal', 'large'];

/**
 * Parses stored prefs JSON, validating field by field; invalid or missing fields use defaults.
 * @param raw stored string or null
 */
export function parsePrefs(raw: string | null | undefined): Prefs {
  const out: Prefs = { ...DEFAULT_PREFS };
  if (!raw) return out;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return out;
    const o = v as Record<string, unknown>;
    out.textSize = SIZES.find((s) => s === o.textSize) ?? out.textSize;
    out.reducedMotion = o.reducedMotion === true;
    out.tutorialSeen = o.tutorialSeen === true;
    out.aimButtonUsed = o.aimButtonUsed === true;
  } catch {
    // Corrupt JSON: defaults.
  }
  return out;
}

function fromLegacy(storage: PrefsStorage): Prefs {
  const a = parsePrefs(storage.getItem(LEGACY_KEYS.a11y));
  return {
    ...DEFAULT_PREFS,
    textSize: a.textSize,
    reducedMotion: a.reducedMotion,
    tutorialSeen: storage.getItem(LEGACY_KEYS.tutorialSeen) === '1',
    aimButtonUsed: storage.getItem(LEGACY_KEYS.aimButtonUsed) === '1',
  };
}

/**
 * Loads prefs, migrating legacy keys when the versioned record is absent. Throws when storage
 * itself throws (the tutorial flag reacts to that); use {@link loadPrefs} for the forgiving form.
 * @param storage storage or undefined
 */
export function loadPrefsStrict(storage: PrefsStorage | undefined): Prefs {
  if (!storage) return { ...DEFAULT_PREFS };
  const raw = storage.getItem(PREFS_KEY);
  return raw === null ? fromLegacy(storage) : parsePrefs(raw);
}

/**
 * Loads prefs; storage failures yield the defaults.
 * @param storage storage or undefined
 */
export function loadPrefs(storage: PrefsStorage | undefined): Prefs {
  try {
    return loadPrefsStrict(storage);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/**
 * Merges a patch into the stored prefs and writes the versioned record; legacy keys are removed
 * afterwards. Failures (private mode, quota) are ignored.
 * @param storage storage or undefined
 * @param patch fields to change
 */
export function updatePrefs(storage: PrefsStorage | undefined, patch: Partial<Prefs>): Prefs {
  const next: Prefs = { ...loadPrefs(storage), ...patch };
  try {
    storage?.setItem?.(PREFS_KEY, JSON.stringify(next));
    for (const k of Object.values(LEGACY_KEYS)) storage?.removeItem?.(k);
  } catch {
    // Storage is a convenience only.
  }
  return next;
}
