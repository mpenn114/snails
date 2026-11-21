// Loads the built harness in headless Chromium (software GL), logs console errors and the
// overlay text, and saves screenshots.
// Usage (after `pnpm --filter @snails/display build`):
//   node apps/display/scripts/harness-screenshot.mjs [outDir] [seconds] [query]
// e.g. node apps/display/scripts/harness-screenshot.mjs /tmp/shots 15 "seed=2&speed=2&tier=low"
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const displayDir = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? 'harness-shots');
const seconds = Number(process.argv[3] ?? 15);
const query = process.argv[4] ?? 'tier=low';
mkdirSync(outDir, { recursive: true });

const port = 4173;
const server = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(port), '--strictPort'], {
  cwd: displayDir,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 3000));

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({
    viewport: { width: 960, height: 540 },
    deviceScaleFactor: 1,
  });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text());
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${port}/harness.html?${query}`);
  const shots = [Math.min(5, seconds), seconds];
  let elapsed = 0;
  for (const t of shots) {
    await page.waitForTimeout((t - elapsed) * 1000);
    elapsed = t;
    const file = join(outDir, `harness-${t}s.png`);
    await page.screenshot({ path: file });
    const text = await page
      .locator('#overlay')
      .innerText()
      .catch(() => '(no overlay)');
    console.log(`--- ${file}\n${text}`);
  }
} finally {
  await browser.close();
  server.kill();
}
