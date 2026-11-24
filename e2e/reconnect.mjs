// End-to-end reconnect test: a phone drops mid-turn and rejoins; a waiting phone reloads.
// Usage: pnpm build && pnpm e2e:reconnect   (needs `playwright`, see smoke.mjs)
import { chromium, devices, fail, has, startServer, step, teamOf, until, watch } from './lib.mjs';

const errors = [];
let browser;
let server;

/** Records every WebSocket the page opens so the test can sever the connection from outside. */
const trackSockets = () => {
  const Native = window.WebSocket;
  window.__sockets = [];
  window.WebSocket = function (...a) {
    const ws = new Native(...a);
    window.__sockets.push(ws);
    return ws;
  };
  window.WebSocket.prototype = Native.prototype;
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
};

try {
  const started = await startServer();
  server = started.server;
  const base = started.base;
  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const dctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
  const display = await dctx.newPage();
  const dFrames = watch(display, 'display', errors);
  await display.goto(`${base}/display/?tier=low`);
  const code = (
    await until('room code', () =>
      display
        .locator('.lobby .code')
        .first()
        .textContent({ timeout: 500 })
        .catch(() => ''),
    )
  ).trim();

  const phones = [];
  for (const [i, team, name] of [
    [0, 'A', 'Ann'],
    [1, 'B', 'Bob'],
  ]) {
    const ctx = await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1 });
    await ctx.addInitScript(trackSockets);
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
    phones.push({ ctx, page, frames, name });
  }
  await until('start enabled', () =>
    phones[0].page.locator('.lobby .start:not([disabled])').count(),
  );
  await phones[0].page.click('.lobby .start');
  await until('turnStart on display', () => has(dFrames, 'turnStart'));
  const firstTurn = dFrames.find((m) => m.type === 'turnStart');
  const active = await until('active phone has controls', async () => {
    for (const p of phones) if (await p.page.locator('.ctl.mine').count()) return p;
    return null;
  });
  const idle = phones.find((p) => p !== active);
  step(`active phone: ${active.name} (team ${teamOf(firstTurn)})`);
  const playerId = active.frames.find((m) => m.type === 'welcome').playerId;

  // 1. Drop the active phone's connection mid-turn.
  const mark = active.frames.length;
  const dMark = dFrames.length;
  await active.ctx.setOffline(true);
  await active.page.evaluate(() => window.__sockets.forEach((w) => w.close()));
  await display.waitForTimeout(1500);
  await active.ctx.setOffline(false);
  const back = Date.now();
  const fresh = () => active.frames.slice(mark);
  const needed = ['welcome', 'matchStarted', 'snapshot', 'turnStart', 'turnTimer'];
  await until('phone rejoined with full state', () => needed.every((t) => has(fresh(), t)), 25000);
  const lateOf = (types) =>
    Math.max(...types.map((t) => fresh().find((m) => m.type === t)._at)) - back;
  const stateMs = lateOf(['welcome', 'matchStarted', 'snapshot']);
  const turnMs = lateOf(['turnStart', 'turnTimer']);
  step(`welcome/matchStarted/snapshot after ${stateMs} ms, turnStart/turnTimer after ${turnMs} ms`);
  if (stateMs > 3000) fail(`state catch-up took ${stateMs} ms (> 3000)`);
  // The phone's main thread rebuilds the match view on rejoin (software GL is slow), which
  // delays reading the later frames; the server itself sends all five in one burst.
  if (turnMs > 6000) fail(`turn catch-up took ${turnMs} ms (> 6000)`);
  const welcome = fresh().find((m) => m.type === 'welcome');
  if (welcome.playerId !== playerId) fail(`playerId changed: ${playerId} -> ${welcome.playerId}`);
  const roster = (m) => m.type === 'lobbyState' && m.players.find((p) => p.id === playerId);
  const states = () =>
    dFrames
      .slice(dMark)
      .filter(roster)
      .map((m) => roster(m).connected);
  // The display (busy rendering on software GL) may report the reconnect lobbyState late.
  await until('display sees the phone drop and come back', () => {
    const st = states();
    return st.includes(false) && st.at(-1) === true;
  }).catch(() => fail(`lobbyState connected sequence wrong: ${JSON.stringify(states())}`));
  if (dFrames.slice(dMark).some((m) => m.type === 'lobbyState' && m.phase === 'lobby'))
    fail('display was sent back to the lobby');
  if (
    await display
      .locator('.lobby .code')
      .first()
      .isVisible()
      .catch(() => false)
  )
    fail('display shows the lobby after the drop');
  await active.page.locator('.ctl.mine:visible').last().waitFor({ timeout: 10000 });
  const fireMark = dFrames.length;
  await active.page.locator('.ctl-fire:visible').last().dispatchEvent('click');
  await until(
    'projectileFired after reconnect',
    () =>
      dFrames
        .slice(fireMark)
        .some((m) => m.type === 'eventBatch' && m.events.some((e) => e.type === 'projectileFired')),
    10000,
  );
  step('reconnected phone kept its controls and fired');

  // 2. Reload the waiting phone completely; the session token must restore the match view.
  const idleId = idle.frames.find((m) => m.type === 'welcome').playerId;
  const reloadMark = idle.frames.length;
  await idle.page.reload();
  await until(
    'reloaded phone rejoined',
    () => idle.frames.slice(reloadMark).some((m) => m.type === 'welcome' && m.playerId === idleId),
    5000,
  );
  await until(
    'reloaded phone in match view',
    async () =>
      (await idle.page.locator('form.join').count()) === 0 &&
      (await idle.page.locator('.spec-banner, .ctl').first().isVisible()),
    5000,
  );
  step('reloaded phone is back in the match view, not the join screen');

  if (errors.length) fail(`uncaught page errors:\n${errors.join('\n')}`);
  step('PASS');
} catch (e) {
  console.error(`[e2e] FAIL: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill();
}
