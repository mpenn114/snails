import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';
import { startServer } from '@snails/server';
import { resolveAssetDirs, resolveDisplayUrl, type PathInputs } from './paths.js';
import { pickFreePort } from './port.js';

const PREFERRED_PORT = 3000;

/** Gathers environment facts used for path resolution. */
function pathInputs(): PathInputs {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    displayUrlEnv: process.env['SNAILS_DISPLAY_URL'],
    devDisplayBuilt: existsSync(path.resolve(here, '../../display/dist/index.html')),
  };
}

/** Starts the in-process server on a free port and opens the display window. */
async function boot(): Promise<void> {
  const inputs = pathInputs();
  const dirs = resolveAssetDirs(inputs);
  const port = await pickFreePort(PREFERRED_PORT);
  const server = await startServer(port, dirs.staticDir, dirs.displayDir);
  console.log(`Snails join URL: ${server.url}\nTV view: ${server.displayUrl}`);
  const win = new BrowserWindow({ width: 1280, height: 720, fullscreenable: true });
  await win.loadURL(resolveDisplayUrl(inputs, server.displayUrl, server.roomCode));
  app.on('before-quit', () => void server.close());
}

app
  .whenReady()
  .then(boot)
  .catch((err) => {
    console.error(err);
    app.quit();
  });
app.on('window-all-closed', () => app.quit());
