// Visual reference screenshots: `pnpm build && NODE_PATH=$(npm root -g) pnpm shots`.
// Writes PNGs plus index.html (contact sheet) into SHOTS_DIR (default ./shots-out).
// Options: --compare <oldDir>  adds before/after columns from a previous run.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { chromium, devices, fail, startServer, step, until, watch } from './lib.mjs';

/**
 * Screenshot timeout: one High-tier frame (post-processing, shadows) can take well over
 * Playwright's 30 s default on GPU-less CI runners with software GL.
 */
const SHOT_TIMEOUT = 180000;

/**
 * Display viewport. `SHOTS_SMALL=1` (set in CI) renders at 960x540: a 1080p High-tier frame takes
 * minutes on GPU-less runners, a quarter of the pixels keeps the job practical.
 */
const DISPLAY_VIEWPORT =
  process.env.SHOTS_SMALL === '1' ? { width: 960, height: 540 } : { width: 1920, height: 1080 };

const out = resolve(process.env.SHOTS_DIR ?? join(process.cwd(), 'shots-out'));
const cmpIdx = process.argv.indexOf('--compare');
const compareDir = cmpIdx > 0 ? resolve(process.argv[cmpIdx + 1] ?? '') : null;
mkdirSync(out, { recursive: true });

const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const DISPLAY_SHOTS = [
  ['display-close', 'close', 'Display 1920x1080, High: close-up of one snail'],
  ['display-wide', 'wide', 'Display 1920x1080, High: wide overview of the island'],
  ['display-crater', 'crater', 'Display 1920x1080, High: fresh explosion crater'],
  [
    'display-flight',
    'flight',
    'Display 1920x1080, High: projectile mid-flight with its puff trail',
  ],
  ['display-aim', 'aim', 'Display 1920x1080, High: dotted aim arc and landing ring'],
  [
    'display-research',
    'close',
    'Display 1920x1080, High: researched shell looks (iron spikes, shimmer)',
    '&research=shimmer',
  ],
];
// SHOTS_ONLY=display-flight,display-aim limits the run (and the phone shot unless phone-my-turn is listed) while iterating.
const only = process.env.SHOTS_ONLY?.split(',');
const captions = [];

async function displayShots(browser, base, errors) {
  const ctx = await browser.newContext({
    viewport: DISPLAY_VIEWPORT,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  for (const [name, cam, caption, extra = ''] of DISPLAY_SHOTS) {
    if (only && !only.includes(name)) continue;
    const page = await ctx.newPage();
    watch(page, name, errors);
    await page.goto(`${base}/display/harness.html?shot=1&cam=${cam}&seed=7&quality=high${extra}`);
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 900000 });
    await page.screenshot({ path: join(out, `${name}.png`), timeout: SHOT_TIMEOUT });
    captions.push({ file: `${name}.png`, caption });
    step(`saved ${name}.png`);
    await page.close();
  }
  await ctx.close();
}

/**
 * Waits until two screenshots 500 ms apart are identical, or 30 s pass. A live match keeps
 * animating (timer, water), so on slow software GL the time budget is what usually ends it.
 */
async function settled(page) {
  let prev = null;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const buf = await page.screenshot({ timeout: SHOT_TIMEOUT });
    if (prev && Buffer.compare(prev, buf) === 0) return;
    prev = buf;
    await page.waitForTimeout(500);
  }
}

/** Opens the research screen on the phone and saves its screenshot. */
async function researchShot(active) {
  await active.locator('button.shell-btn', { hasText: 'Research' }).click();
  await active.waitForSelector('.rs.open .rs-card', { timeout: 30000 });
  await active.screenshot({ path: join(out, 'phone-research.png'), timeout: SHOT_TIMEOUT });
  captions.push({
    file: 'phone-research.png',
    caption: 'Phone 390x844: research screen (Calcium, queue, four-branch tech tree)',
  });
  step('saved phone-research.png');
}

async function phoneShot(browser, base, errors) {
  const mk = () =>
    browser.newContext({
      ...devices['Pixel 7'],
      viewport: { width: 390, height: 844 },
      screenSize: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
  // The TV here only hosts the match; keep it small so it costs little GPU time on CI.
  const dctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
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
    await page.goto(`${base}/?room=${code}`);
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
  const active = await until(
    'phone with own turn',
    async () => {
      for (const p of phones) if (await p.locator('.ctl.mine').count()) return p;
      return null;
    },
    60000,
  );
  await settled(active);
  await active.screenshot({ path: join(out, 'phone-my-turn.png'), timeout: SHOT_TIMEOUT });
  captions.push({
    file: 'phone-my-turn.png',
    caption: 'Phone 390x844, Mobile tier: in-match view on own turn (live match, random seed)',
  });
  step('saved phone-my-turn.png');
  await researchShot(active);
  await dctx.close();
}

function sheet() {
  const cell = (c) => {
    const old =
      compareDir && existsSync(join(compareDir, c.file))
        ? `<figure><img src="${relative(out, join(compareDir, c.file))}" alt="before"><figcaption>before</figcaption></figure>`
        : '';
    return `<section><h2>${c.caption}</h2><div class="pair">${old}<figure><img src="${c.file}" alt="${c.file}"><figcaption>${compareDir ? 'after: ' : ''}${c.file}</figcaption></figure></div></section>`;
  };
  const body = captions.map((c) => cell(c)).join('\n');
  writeFileSync(
    join(out, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Snails reference shots</title>
<style>body{font:14px system-ui;background:#222;color:#eee;margin:16px}img{max-width:100%;border:1px solid #555}
.pair{display:flex;gap:12px;flex-wrap:wrap}figure{margin:0;flex:1 1 300px}figcaption{opacity:.7;padding:4px 0}h2{font-size:16px}</style>
<h1>Snails reference shots</h1>${body}
`,
  );
}

const { server, base } = await startServer();
let browser;
const errors = [];
try {
  browser = await chromium.launch({ args: GL_ARGS });
  await displayShots(browser, base, errors);
  if (!only || only.includes('phone-my-turn')) await phoneShot(browser, base, errors);
  sheet();
  if (errors.length) fail(`uncaught page errors:\n${errors.join('\n')}`);
  step(`done: ${out} (${readdirSync(out).length} files)`);
} catch (e) {
  console.error(`[shots] FAIL: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
