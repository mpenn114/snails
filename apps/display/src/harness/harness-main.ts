/**
 * Harness entry. `?shot=1` runs the deterministic screenshot mode (see shot-mode.ts), anything
 * else the live bot-match harness (live-main.ts).
 */
const params = new URLSearchParams(location.search);
const canvas = document.getElementById('view') as HTMLCanvasElement;
if (params.has('shot')) {
  const { runShot } = await import('./shot-mode');
  await runShot(canvas, params);
} else {
  await import('./live-main');
}

export {};
