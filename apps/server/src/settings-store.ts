import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { MatchSettings } from '@snails/protocol';

/** File name of the remembered lobby settings inside the data directory. */
export const SETTINGS_FILE = 'lobby-settings.json';

/**
 * Where host data lives: `SNAILS_DATA_DIR` when set, else the OS app-data location
 * (`%APPDATA%\Snails`, `~/Library/Application Support/Snails`, `$XDG_CONFIG_HOME/snails`).
 * @param env environment variables
 * @param platform `process.platform`
 * @param home home directory
 */
export function defaultDataDir(
  env: Record<string, string | undefined> = process.env,
  platform: string = process.platform,
  home: string = homedir(),
): string {
  const override = env['SNAILS_DATA_DIR'];
  if (override) return override;
  if (platform === 'win32') {
    return join(env['APPDATA'] ?? join(home, 'AppData', 'Roaming'), 'Snails');
  }
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'Snails');
  return join(env['XDG_CONFIG_HOME'] ?? join(home, '.config'), 'snails');
}

/**
 * Reads the remembered settings; a missing, corrupt or no-longer-valid file yields undefined.
 * @param dir data directory
 */
export function loadLobbySettings(dir: string): MatchSettings | undefined {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(dir, SETTINGS_FILE), 'utf8'));
    const parsed = MatchSettings.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Writes the settings atomically (temp file + rename); failures are ignored.
 * @param dir data directory (created when missing)
 * @param settings settings to remember
 */
export function saveLobbySettings(dir: string, settings: MatchSettings): void {
  try {
    mkdirSync(dir, { recursive: true });
    const tmp = join(dir, `${SETTINGS_FILE}.tmp`);
    writeFileSync(tmp, JSON.stringify(settings, null, 2));
    renameSync(tmp, join(dir, SETTINGS_FILE));
  } catch {
    // Remembering settings is a convenience only.
  }
}
