// End-to-end smoke test: real server + display + two Pixel 7 phones play one turn.
// Usage: pnpm build && pnpm e2e   (set E2E_SHOTS=<dir> to save screenshots)
// Needs `playwright` resolvable (global install: NODE_PATH=$(npm root -g), or a local one).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.env.E2E_SHOTS ? resolve(process.env.E2E_SHOTS) : null;
if (shots) mkdirSync(shots, { recursive: true });

const freePort = () =>
  new Promise((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });

const step = (m) => console.log(`[e2e] ${m}`);
const fail = (m) => {
  throw new Error(m);
};
const teamOf = (m) => m.teamId ?? m.team;

/** Collects parsed websocket frames and page errors for one page. */
function watch(page, label, errors) {
  const frames = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => {
      try {
        const m = JSON.parse(String(f.payload));
        if (m && typeof m.type === 'string') frames.push(m);
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

async function until(label, fn, ms = 20000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) fail(`timeout: ${label}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const has = (frames, type) => frames.some((m) => m.type === type);
const port = await freePort();
const server = spawn('node', ['dist/main.js'], {
  cwd: join(root, 'apps/server'),
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
let browser;
const errors = [];
try {
  const base = `http://127.0.0.1:${port}`;
  await until('server ready', () =>
    fetch(`${base}/display/`).then(
      (r) => r.ok,
      () => false,
    ),
  );
  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  const dctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const display = await dctx.newPage();
  const dFrames = watch(display, 'display', errors);
  await display.goto(`${base}/display/`);
  const code = (
    await until('room code on display', () =>
      display
        .locator('.lobby .code')
        .first()
        .textContent({ timeout: 500 })
        .catch(() => ''),
    )
  ).trim();
  step(`room ${code}`);

  const phones = [];
  for (const [i, team, name] of [
    [0, 'A', 'Ann'],
    [1, 'B', 'Bob'],
  ]) {
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await ctx.newPage();
    const frames = watch(page, `phone${i + 1}`, errors);
    await page.goto(`${base}/?room=${code}`);
    await page.fill('#name', name);
    await page.fill('#room', code);
    await page.click('form.join button[type=submit]');
    await page.waitForSelector('.lobby .teams');
    await page.click(`.lobby .teams button[data-v="${team}"]`);
    await page.click(`.lobby .colours button.pick:not([disabled]) >> nth=${i}`);
    await page.click('.lobby button.ready');
    phones.push({ page, frames, name });
    step(`${name} joined team ${team} and readied`);
  }

  await until('start enabled', () =>
    phones[0].page.locator('.lobby .start:not([disabled])').count(),
  );
  await phones[0].page.click('.lobby .start');
  step('host started match');

  await until('snapshots on display and both phones', () =>
    [dFrames, phones[0].frames, phones[1].frames].every((f) => has(f, 'snapshot')),
  );
  await until('turnStart on display', () => has(dFrames, 'turnStart'));
  const firstTurn = dFrames.find((m) => m.type === 'turnStart');
  step(`first turnStart: ${JSON.stringify(firstTurn).slice(0, 160)}`);

  const active = await until('a phone gets my-turn controls', async () => {
    for (const p of phones) if (await p.page.locator('.ctl.mine').count()) return p;
    return null;
  });
  const idle = phones.find((p) => p !== active);
  step(`active phone: ${active.name}`);
  await display.waitForTimeout(1500);
  if (shots) {
    await display.screenshot({ path: join(shots, 'display-match.png') });
    await active.page.screenshot({ path: join(shots, 'phone-my-turn.png') });
    await idle.page.screenshot({ path: join(shots, 'phone-waiting.png') });
  }

  const startTeam = teamOf(firstTurn);
  const mark = dFrames.length;
  const pg = active.page;

  // Pointer events dispatched on the real controls (software GL makes mouse-driven drags slow).
  const drag = (sel, dx, dy) =>
    pg.evaluate(
      async ([s, x, y]) => {
        const el = document.querySelector(s);
        el.setPointerCapture = () => {}; // synthetic pointers cannot be captured
        const r = el.getBoundingClientRect();
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        const ev = (type, px, py) =>
          el.dispatchEvent(
            new PointerEvent(type, { pointerId: 7, bubbles: true, clientX: px, clientY: py }),
          );
        ev('pointerdown', cx, cy);
        ev('pointermove', cx + x, cy + y);
        await new Promise((res) => setTimeout(res, 300));
        ev('pointermove', cx + x, cy + y + 1);
        await new Promise((res) => setTimeout(res, 100));
        ev('pointerup', cx + x, cy + y);
      },
      [sel, dx, dy],
    );
  await drag('.ctl-stick', 40, 0);
  await drag('.ctl-aim', -90, -20);
  await pg.evaluate(() => document.querySelector('.ctl-fire').click());
  step('moved, aimed, fired');

  const sawEvent = (type) =>
    dFrames
      .slice(mark)
      .some((m) => m.type === 'eventBatch' && m.events.some((e) => e.type === type));
  await until('projectileFired in an eventBatch on display', () => sawEvent('projectileFired'));
  await until('explosion in an eventBatch on display', () => sawEvent('explosion'), 30000);
  step('projectileFired and explosion events reached the display');
  await until(
    'turn passes to other team',
    () => dFrames.slice(mark).some((m) => m.type === 'turnStart' && teamOf(m) !== startTeam),
    30000,
  );
  step('turn passed to the other team');
  await idle.page.waitForSelector('.ctl.mine', { timeout: 10000 });
  step('other phone now has controls');
  if (shots) await display.screenshot({ path: join(shots, 'display-after-turn.png') });

  if (errors.length) fail(`uncaught page errors:\n${errors.join('\n')}`);
  step('PASS');
} catch (e) {
  console.error(`[e2e] FAIL: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
