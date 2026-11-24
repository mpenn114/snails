// Quality tier budget check (M7-15): `pnpm build && NODE_PATH=$(npm root -g) pnpm perf`.
// Reads WebGL renderer.info (draw calls, triangles, textures, programs) per tier in the display
// harness, plus the real phone view (`?perf=1`) on a mobile-emulated device. Counts are the real
// check; fps under headless software WebGL is indicative only. Exit code 1 when a budget is blown.
// Options: PERF_SECS (default 14) sampling duration per tier.
import { chromium, devices, fail, startServer, step, until, watch } from './lib.mjs';

const SECS = Number(process.env.PERF_SECS ?? 8);
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
/** Upper bounds per tier (draw calls, triangles), with the programs/textures ceiling shared. */
const BUDGETS = {
  high: { calls: 800, triangles: 1_500_000 },
  medium: { calls: 700, triangles: 1_000_000 },
  low: { calls: 600, triangles: 800_000 },
  mobile: { calls: 250, triangles: 250_000 },
};
const MAX_PROGRAMS = 64; // shader compile is load-time only; High carries the post chain
const MAX_TEXTURES = 64; // High includes the post-processing render targets

const avg = (xs, f) => xs.reduce((a, s) => a + f(s), 0) / xs.length;

/** Waits (up to 90 s) until the terrain mesh backlog has drained, so counts are steady state. */
async function settle(page) {
  for (let i = 0, quiet = 0; i < 90 && quiet < 3; i++) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => window.__perf ?? null);
    quiet = s && s.chunks && s.chunks.backlog === 0 ? quiet + 1 : 0;
  }
}

async function sample(page, secs) {
  const samples = [];
  for (let i = 0; i < secs; i++) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => window.__perf ?? null);
    if (s) samples.push(s);
  }
  if (!samples.length) fail('no __perf samples');
  const last = samples.at(-1);
  return {
    calls: Math.round(avg(samples, (s) => s.calls)),
    triangles: Math.round(avg(samples, (s) => s.triangles)),
    textures: last.textures,
    programs: last.programs,
    geometries: last.geometries,
  };
}

async function harnessRow(browser, base, tier, errors) {
  const mobile = tier === 'mobile';
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
    deviceScaleFactor: mobile ? 2 : 1,
  });
  const page = await ctx.newPage();
  watch(page, `harness-${tier}`, errors);
  await page.goto(`${base}/display/harness.html?tier=${tier}&seed=2&speed=2`);
  await settle(page);
  const row = { name: `harness ${tier}`, tier, ...(await sample(page, SECS)) };
  await ctx.close();
  return row;
}

async function phoneRow(browser, base, errors) {
  const mk = () =>
    browser.newContext({
      ...devices['Pixel 7'],
      viewport: { width: 390, height: 844 },
      screenSize: { width: 390, height: 844 },
    });
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const display = await dctx.newPage();
  watch(display, 'display', errors);
  await display.goto(`${base}/display/`);
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
    const page = await (await mk()).newPage();
    watch(page, name, errors);
    await page.goto(`${base}/?room=${code}&perf=1`);
    await page.fill('#name', name);
    await page.fill('#room', code);
    await page.click('form.join button[type=submit]');
    await page.waitForSelector('.lobby .teams');
    await page.click(`.lobby .teams button[data-v="${team}"]`);
    await page.click(`.lobby .colours button.pick:not([disabled]) >> nth=${i}`);
    await page.click('.lobby button.ready');
    phones.push(page);
  }
  await until('start enabled', () => phones[0].locator('.lobby .start:not([disabled])').count());
  await phones[0].click('.lobby .start');
  await until('own turn', () => phones[0].locator('.ctl.mine').count(), 60000);
  await phones[0].waitForTimeout(20000);
  const row = { name: 'phone view', tier: 'mobile', ...(await sample(phones[0], SECS)) };
  await dctx.close();
  return row;
}

const { server, base } = await startServer();
let browser;
const errors = [];
try {
  browser = await chromium.launch({ args: GL_ARGS });
  const rows = [];
  for (const tier of ['high', 'medium', 'low', 'mobile']) {
    rows.push(await harnessRow(browser, base, tier, errors));
  }
  rows.push(await phoneRow(browser, base, errors));
  let over = 0;
  console.log('| view | draw calls | triangles | textures | programs | geometries |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const r of rows) {
    const b = BUDGETS[r.tier];
    const bad =
      r.calls > b.calls ||
      r.triangles > b.triangles ||
      r.programs > MAX_PROGRAMS ||
      r.textures > MAX_TEXTURES;
    if (bad) over++;
    console.log(
      `| ${r.name}${bad ? ' (OVER BUDGET)' : ''} | ${r.calls} / ${b.calls} | ${r.triangles} / ${b.triangles} | ${r.textures} | ${r.programs} | ${r.geometries} |`,
    );
  }
  if (errors.length) fail(`uncaught page errors:\n${errors.join('\n')}`);
  step(over ? `${over} view(s) over budget` : 'all views within budget');
  if (over) process.exitCode = 1;
} catch (e) {
  console.error(`[perf] FAIL: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
