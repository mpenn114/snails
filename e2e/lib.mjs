// Shared helpers for the e2e scripts (copied from smoke.mjs).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const { chromium, devices } = require('playwright');
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const freePort = () =>
  new Promise((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });

export const step = (m) => console.log(`[e2e] ${m}`);
export const fail = (m) => {
  throw new Error(m);
};
export const teamOf = (m) => m.teamId ?? m.team;

/** Collects parsed websocket frames and page errors for one page. */
export function watch(page, label, errors) {
  const frames = [];
  /** Intents this page sent (everything except keep-alives), for failure diagnostics. */
  const sent = [];
  Object.defineProperty(frames, 'sent', { value: sent });
  page.on('websocket', (ws) => {
    ws.on('framesent', (f) => {
      try {
        const m = JSON.parse(String(f.payload));
        if (m && typeof m.type === 'string' && m.type !== 'ping')
          sent.push({ ...m, _at: Date.now() });
      } catch {
        /* binary or non-JSON */
      }
    });
    ws.on('framereceived', (f) => {
      try {
        const m = JSON.parse(String(f.payload));
        if (m && typeof m.type === 'string')
          frames.push(Object.defineProperty(m, '_at', { value: Date.now() }));
      } catch {
        /* binary or non-JSON */
      }
    });
  });
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`[e2e] ${label} console.error: ${m.text()}`);
  });
  return frames;
}

export async function until(label, fn, ms = 20000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) fail(`timeout: ${label}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

export const has = (frames, type) => frames.some((m) => m.type === type);

/** Spawns the built server on a free port and waits until it serves the display. */
export async function startServer() {
  const port = await freePort();
  const server = spawn('node', ['dist/main.js'], {
    cwd: join(root, 'apps/server'),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const base = `http://127.0.0.1:${port}`;
  await until('server ready', () =>
    fetch(`${base}/display/`).then(
      (r) => r.ok,
      () => false,
    ),
  );
  return { server, base };
}
