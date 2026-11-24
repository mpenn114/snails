// End-to-end Weapons demo: the host ticks "Weapons demo map" in the lobby settings, then three
// turns fire three different weapons (two ballistic, one melee) and each must resolve cleanly.
// Usage: pnpm build && node e2e/demo.mjs   (needs `playwright`, see smoke.mjs)
import { chromium, devices, fail, startServer, step, teamOf, until, watch } from './lib.mjs';

const WEAPON_TURNS = ['Pebble Toss', 'Salt Shaker', 'Shell Bash'];
const { server, base } = await startServer();
let browser;
const errors = [];
try {
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
  }

  const host = phones[0].page;
  await host.check('.lobby .settings [data-key="demo"]');
  await host.check('.lobby .settings [data-key="lazyStart"]'); // slow GL must not expire turns
  step('host ticked the Weapons demo map');
  await until('start enabled', () => host.locator('.lobby .start:not([disabled])').count());
  await host.click('.lobby .start');
  await until('matchStarted with demo on both phones and the display', () =>
    [dFrames, phones[0].frames, phones[1].frames].every((f) =>
      f.some((m) => m.type === 'matchStarted' && m.settings.demo === true),
    ),
  );
  await until('inventory with 99 of every weapon', () =>
    phones[0].frames.some(
      (m) =>
        m.type === 'inventory' &&
        m.teams.every((t) => t.stock['base:shell-bash'] === 99 && !Object.keys(t.locked).length),
    ),
  );
  step('demo match started with every weapon stocked and unlocked');

  // Pick the active phone from the server's turnStart (activePlayerId), not from whichever page
  // shows `.ctl.mine` first: on slow CI the previous player's page can still show stale controls.
  const playerOf = (p) => p.frames.find((m) => m.type === 'welcome')?.playerId;
  let turnsSeen = 0;
  for (const weapon of WEAPON_TURNS) {
    const turnStarts = () => dFrames.filter((m) => m.type === 'turnStart');
    await until(`turn start for ${weapon}`, () => turnStarts().length > turnsSeen, 60000);
    const turn = turnStarts().at(-1);
    turnsSeen = turnStarts().length;
    const active = phones.find((p) => playerOf(p) === turn.activePlayerId);
    if (!active) fail(`no phone for active player ${turn.activePlayerId}`);
    // Software GL can take a while to repaint the controls on CI.
    await until(
      `${active.name} gets my-turn controls for ${weapon}`,
      () => active.page.locator('.ctl.mine').count(),
      60000,
    );
    const mark = dFrames.length;
    const turnTeam = teamOf(turn);
    await active.page.evaluate((name) => {
      const tile = [...document.querySelectorAll('.ctl-tile')].find((t) =>
        t.textContent.includes(name),
      );
      if (!tile) throw new Error(`no weapon tile ${name}`);
      tile.click();
    }, weapon);
    // A tap can be lost while a software-GL page is busy (and lazy start never expires the turn),
    // so tap Fire again until the shot shows up on the display.
    const shotSeen = () =>
      dFrames
        .slice(mark)
        .some(
          (m) =>
            m.type === 'eventBatch' &&
            m.events.some((e) => ['projectileFired', 'meleeStruck'].includes(e.type)),
        );
    const turnPassed = () =>
      dFrames.slice(mark).some((m) => m.type === 'turnStart' && teamOf(m) !== turnTeam);
    const done = () => shotSeen() || turnPassed();
    for (let tries = 0; tries < 4 && !done(); tries++) {
      await active.page.waitForTimeout(300);
      if (done()) break;
      await active.page.evaluate(() => document.querySelector('.ctl-fire')?.click());
      const until10 = Date.now() + 10000;
      while (!done() && Date.now() < until10) await active.page.waitForTimeout(250);
    }
    step(`${active.name} fired ${weapon}`);
    const t0 = dFrames[mark - 1]?._at ?? 0;
    await until(
      `${weapon} resolved and the turn passed`,
      () => dFrames.slice(mark).some((m) => m.type === 'turnStart' && teamOf(m) !== turnTeam),
      45000,
    ).catch((e) => {
      // Diagnostics for CI-only failures: what the phone sent and what came back.
      const sent = active.frames.sent.filter((m) => m._at >= t0 && m.type !== 'aim');
      const back = active.frames.filter(
        (m) => m._at >= t0 && !['snapshot', 'eventBatch', 'turnTimer', 'pong'].includes(m.type),
      );
      const evs = dFrames
        .slice(mark)
        .filter((m) => m.type === 'eventBatch')
        .flatMap((m) => m.events.map((x) => x.type).filter((t) => t !== 'tick'));
      console.log(`[e2e] ${active.name} sent: ${JSON.stringify(sent)}`);
      console.log(`[e2e] ${active.name} got: ${JSON.stringify(back).slice(0, 2000)}`);
      console.log(`[e2e] display events: ${evs.join(',')}`);
      throw e;
    });
    const batches = dFrames.slice(mark).filter((m) => m.type === 'eventBatch');
    if (
      weapon !== 'Shell Bash' &&
      !batches.some((b) => b.events.some((e) => e.type === 'projectileFired'))
    )
      fail(`${weapon}: no projectileFired event`);
    step(`${weapon} resolved`);
  }

  const lists = [['display', dFrames], ...phones.map((p) => [p.name, p.frames])];
  for (const [who, f] of lists) {
    const err = f.find((m) => m.type === 'error');
    if (!err) continue;
    for (const [name, g] of lists) {
      const recent = g.sent.filter((m) => m._at <= err._at).slice(-6);
      console.log(`[e2e] ${name} sent before the error: ${JSON.stringify(recent)}`);
    }
    fail(`server error to ${who} at ${err._at}: ${JSON.stringify(err)}`);
  }
  if (errors.length) fail(`uncaught page errors:\n${errors.join('\n')}`);
  step('PASS');
} catch (e) {
  console.error(`[e2e] FAIL: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
