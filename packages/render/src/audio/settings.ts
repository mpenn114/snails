/** Persisted audio preferences. */
export interface AudioSettings {
  muted: boolean;
  /** Master volume 0..1. */
  volume: number;
}

/** Defaults when nothing valid is stored. */
export const DEFAULT_AUDIO: AudioSettings = { muted: false, volume: 0.8 };

/** localStorage key. */
export const AUDIO_KEY = 'snails.audio';

/**
 * Parses stored audio settings JSON; invalid fields fall back to defaults.
 * @param raw stored string or null
 */
export function parseAudioSettings(raw: string | null | undefined): AudioSettings {
  if (!raw) return { ...DEFAULT_AUDIO };
  try {
    const o: unknown = JSON.parse(raw);
    if (typeof o !== 'object' || o === null) return { ...DEFAULT_AUDIO };
    const r = o as Record<string, unknown>;
    const v = typeof r.volume === 'number' && Number.isFinite(r.volume) ? r.volume : undefined;
    return {
      muted: r.muted === true,
      volume: v === undefined ? DEFAULT_AUDIO.volume : Math.min(1, Math.max(0, v)),
    };
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}

/**
 * Loads settings; storage failures yield defaults.
 * @param storage a Storage or undefined
 */
export function loadAudioSettings(storage: Pick<Storage, 'getItem'> | undefined): AudioSettings {
  try {
    return parseAudioSettings(storage?.getItem(AUDIO_KEY));
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}

/**
 * Persists settings; failures are ignored.
 * @param storage a Storage or undefined
 * @param s settings
 */
export function saveAudioSettings(
  storage: Pick<Storage, 'setItem'> | undefined,
  s: AudioSettings,
): void {
  try {
    storage?.setItem(AUDIO_KEY, JSON.stringify(s));
  } catch {
    // Storage is a convenience only.
  }
}

/**
 * Whether a URL query asks for silence (`?mute=1` or `?mute=true`).
 * @param search `location.search`
 */
export function muteFromQuery(search: string): boolean {
  const v = new URLSearchParams(search).get('mute');
  return v === '1' || v === 'true';
}
