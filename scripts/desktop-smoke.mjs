#!/usr/bin/env node
// Launches the packaged desktop app, waits for the in-process server and checks it serves content.
// Linux: run under `xvfb-run -a` (CI does). Usage: node scripts/desktop-smoke.mjs
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const release = path.resolve('apps/desktop/release');
const TIMEOUT_MS = 60_000;

/** Finds the packaged executable and launch args for this platform. */
function locate() {
  if (process.platform === 'linux') {
    const f = readdirSync(release).find((n) => n.endsWith('.AppImage'));
    return {
      cmd: path.join(release, f ?? 'missing.AppImage'),
      args: ['--appimage-extract-and-run', '--no-sandbox'],
    };
  }
  if (process.platform === 'win32') {
    const dir = path.join(release, 'win-unpacked');
    const f = readdirSync(dir).find((n) => n.endsWith('.exe') && !/uninstall/i.test(n));
    return { cmd: path.join(dir, f ?? 'missing.exe'), args: [] };
  }
  const dir = readdirSync(release).find((n) => n.startsWith('mac'));
  return { cmd: path.join(release, dir ?? 'mac', 'Snails.app/Contents/MacOS/Snails'), args: [] };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { cmd, args } = locate();
  if (!existsSync(cmd)) throw new Error(`packaged app not found: ${cmd}`);
  console.log(`launching ${cmd}`);
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let joinUrl = null;
  const onData = (b) => {
    out += b.toString();
    const m = /Snails join URL: (\S+)/.exec(out);
    if (m) joinUrl = m[1];
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  let exited = null;
  child.on('exit', (code) => (exited = code ?? -1));
  try {
    const deadline = Date.now() + TIMEOUT_MS;
    while (!joinUrl) {
      if (exited !== null) throw new Error(`app exited early (${exited})\n${out}`);
      if (Date.now() > deadline) throw new Error(`no join URL within timeout\n${out}`);
      await sleep(250);
    }
    const base = new URL(joinUrl);
    console.log(`join URL: ${joinUrl}`);
    let ok = false;
    while (!ok && Date.now() < deadline) {
      try {
        ok = (await fetch(new URL('/api/info', base))).status === 200;
      } catch {
        /* not up yet */
      }
      if (!ok) await sleep(500);
    }
    if (!ok) throw new Error('/api/info did not return 200 in time');
    console.log('/api/info 200');
    for (const p of ['/display/', '/']) {
      const res = await fetch(new URL(p, base));
      const body = await res.text();
      if (res.status !== 200 || !/<html/i.test(body)) {
        throw new Error(`${p} did not return HTML (${res.status})`);
      }
      console.log(`${p} returns HTML`);
    }
  } finally {
    if (exited === null) child.kill('SIGKILL');
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  }
}

main().then(
  () => {
    console.log('desktop smoke OK');
    process.exit(0);
  },
  (e) => {
    console.error(`desktop smoke FAILED: ${e.message}`);
    process.exit(1);
  },
);
