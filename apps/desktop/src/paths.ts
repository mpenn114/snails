import path from 'node:path';

/** Inputs for resolving where the display window and server assets live. */
export interface PathInputs {
  isPackaged: boolean;
  /** `process.resourcesPath` (only meaningful when packaged). */
  resourcesPath: string;
  /** Value of the SNAILS_DISPLAY_URL env override, if any. */
  displayUrlEnv: string | undefined;
  /** Whether `apps/display/dist` exists (unpackaged dev). */
  devDisplayBuilt: boolean;
}

/** Directory overrides passed to the in-process server. */
export interface AssetDirs {
  staticDir?: string;
  displayDir?: string;
}

/**
 * Resolves asset directories for the server. Packaged builds read from `extraResources`.
 * @param i resolution inputs
 * @returns directory overrides (empty when unpackaged: server defaults apply)
 */
export function resolveAssetDirs(i: PathInputs): AssetDirs {
  if (!i.isPackaged) return {};
  return {
    staticDir: path.join(i.resourcesPath, 'controller'),
    displayDir: path.join(i.resourcesPath, 'display'),
  };
}

/**
 * Chooses the full URL the display window loads.
 * The env override wins (the room code is appended); packaged builds and dev trees with a
 * built display use the server-served display; otherwise the Vite dev server.
 * @param i resolution inputs
 * @param serverDisplayUrl display URL reported by the running server (includes room)
 * @param roomCode room code to attach to override/dev URLs
 * @returns the URL to load
 */
export function resolveDisplayUrl(
  i: PathInputs,
  serverDisplayUrl: string,
  roomCode: string,
): string {
  if (i.displayUrlEnv) return `${i.displayUrlEnv}/?room=${roomCode}`;
  if (i.isPackaged || i.devDisplayBuilt) return serverDisplayUrl;
  return `http://localhost:5173/?room=${roomCode}`;
}
