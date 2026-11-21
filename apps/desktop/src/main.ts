import { app, BrowserWindow } from 'electron';
import { startServer } from '@snails/server';

const PORT = 3000;

/** Starts the in-process server and opens the display window. */
async function boot(): Promise<void> {
  const server = await startServer(PORT);
  console.log(`Snails join URL: ${server.url}`);
  const win = new BrowserWindow({ width: 1280, height: 720, fullscreenable: true });
  // Display build is served by the server in packaged releases; in dev use the Vite server.
  const displayUrl = process.env['SNAILS_DISPLAY_URL'] ?? `http://localhost:5173`;
  await win.loadURL(`${displayUrl}/?room=${server.roomCode}`);
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
