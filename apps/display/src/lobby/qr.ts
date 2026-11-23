/** Minimal QR Code encoder: byte mode, error correction level M, versions 1-6. */

/** Square boolean matrix; `true` is a dark module. */
export type QrMatrix = boolean[][];

/** Per-version block layout for level M. */
interface Layout {
  ecPerBlock: number;
  blocks: number;
  dataPerBlock: number;
  align: number[];
}

const LAYOUTS: Layout[] = [
  { ecPerBlock: 10, blocks: 1, dataPerBlock: 16, align: [] },
  { ecPerBlock: 16, blocks: 1, dataPerBlock: 28, align: [6, 18] },
  { ecPerBlock: 26, blocks: 1, dataPerBlock: 44, align: [6, 22] },
  { ecPerBlock: 18, blocks: 2, dataPerBlock: 32, align: [6, 26] },
  { ecPerBlock: 24, blocks: 2, dataPerBlock: 43, align: [6, 30] },
  { ecPerBlock: 16, blocks: 4, dataPerBlock: 27, align: [6, 34] },
];

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!;
}

/**
 * Reed-Solomon error-correction codewords for `data`.
 * @param data data codewords
 * @param ecLen number of EC codewords
 */
export function reedSolomon(data: readonly number[], ecLen: number): number[] {
  // Generator polynomial, highest-degree coefficient first (leading 1 omitted).
  let gen = [1];
  for (let i = 0; i < ecLen; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    gen.forEach((c, j) => {
      next[j] = (next[j] ?? 0) ^ c;
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMul(c, EXP[i]!);
    });
    gen = next;
  }
  const rem = new Array<number>(ecLen).fill(0);
  for (const d of data) {
    const factor = d ^ rem[0]!;
    rem.shift();
    rem.push(0);
    for (let i = 0; i < ecLen; i++) rem[i] = rem[i]! ^ gfMul(gen[i + 1]!, factor);
  }
  return rem;
}

function dataCapacity(l: Layout): number {
  return l.blocks * l.dataPerBlock;
}

/** Byte-mode data codewords (mode, length, payload, terminator, padding). */
function buildData(bytes: Uint8Array, l: Layout): number[] {
  const bits: number[] = [];
  const push = (v: number, n: number): void => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1);
  };
  push(4, 4);
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, dataCapacity(l) * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  }
  for (let pad = 0xec; out.length < dataCapacity(l); pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

/** Splits data into blocks, adds EC, and interleaves into the final codeword sequence. */
function interleave(data: number[], l: Layout): number[] {
  const dBlocks: number[][] = [];
  for (let i = 0; i < l.blocks; i++) {
    dBlocks.push(data.slice(i * l.dataPerBlock, (i + 1) * l.dataPerBlock));
  }
  const eBlocks = dBlocks.map((b) => reedSolomon(b, l.ecPerBlock));
  const out: number[] = [];
  for (let i = 0; i < l.dataPerBlock; i++) for (const b of dBlocks) out.push(b[i]!);
  for (let i = 0; i < l.ecPerBlock; i++) for (const b of eBlocks) out.push(b[i]!);
  return out;
}

/**
 * Side length in modules of a version.
 * @param version 1-6
 */
export function qrSize(version: number): number {
  return 17 + 4 * version;
}

function isFinderCorner(r: number, c: number, n: number): boolean {
  return (r === 6 && c === 6) || (r === 6 && c === n - 7) || (r === n - 7 && c === 6);
}

/** Builds the function-module mask (finders, timing, alignment, format areas, dark module). */
function functionMask(version: number): boolean[][] {
  const n = qrSize(version);
  const m = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const fill = (r0: number, c0: number, h: number, w: number): void => {
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) m[r]![c] = true;
  };
  fill(0, 0, 9, 9);
  fill(0, n - 8, 9, 8);
  fill(n - 8, 0, 8, 9);
  fill(6, 0, 1, n);
  fill(0, 6, n, 1);
  const align = LAYOUTS[version - 1]!.align;
  for (const r of align) {
    for (const c of align) if (!isFinderCorner(r, c, n)) fill(r - 2, c - 2, 5, 5);
  }
  return m;
}

/**
 * Data-module coordinates in placement order (zigzag from bottom-right, skipping function
 * modules). Exposed so tests can read a matrix back.
 * @param version 1-6
 */
export function dataPositions(version: number): [number, number][] {
  const n = qrSize(version);
  const fn = functionMask(version);
  const out: [number, number][] = [];
  let up = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let i = 0; i < n; i++) {
      const r = up ? n - 1 - i : i;
      for (const c of [col, col - 1]) if (!fn[r]![c]) out.push([r, c]);
    }
    up = !up;
  }
  return out;
}

function drawFinder(m: QrMatrix, r0: number, c0: number): void {
  const n = m.length;
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const r = r0 + dr;
      const c = c0 + dc;
      if (r < 0 || c < 0 || r >= n || c >= n) continue;
      const ring = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
      m[r]![c] = ring === 3 || ring <= 1;
    }
  }
}

function drawFunctionPatterns(m: QrMatrix, version: number): void {
  const n = m.length;
  drawFinder(m, 0, 0);
  drawFinder(m, 0, n - 7);
  drawFinder(m, n - 7, 0);
  for (let i = 8; i < n - 8; i++) {
    m[6]![i] = i % 2 === 0;
    m[i]![6] = i % 2 === 0;
  }
  const align = LAYOUTS[version - 1]!.align;
  for (const r of align) {
    for (const c of align) {
      if (isFinderCorner(r, c, n)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          m[r + dr]![c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
        }
      }
    }
  }
}

/**
 * 15-bit format information (level M) for a mask pattern.
 * @param mask mask pattern 0-7
 */
export function formatBits(mask: number): number {
  const data = mask; // level M is 00 in the top two bits
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  return ((data << 10) | rem) ^ 0x5412;
}

function drawFormat(m: QrMatrix, mask: number): void {
  const n = m.length;
  const bits = formatBits(mask);
  const bit = (i: number): boolean => ((bits >> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) m[i]![8] = bit(i);
  m[7]![8] = bit(6);
  m[8]![8] = bit(7);
  m[8]![7] = bit(8);
  for (let i = 9; i < 15; i++) m[8]![14 - i] = bit(i);
  for (let i = 0; i < 8; i++) m[8]![n - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) m[n - 15 + i]![8] = bit(i);
  m[n - 8]![8] = true;
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/**
 * Applies a mask pattern to a data position.
 * @param mask mask 0-7
 * @param r row
 * @param c column
 */
export function maskApplies(mask: number, r: number, c: number): boolean {
  return MASKS[mask]!(r, c);
}

function penaltyRuns(line: boolean[]): number {
  let score = 0;
  let run = 1;
  for (let i = 1; i <= line.length; i++) {
    if (i < line.length && line[i] === line[i - 1]) run++;
    else {
      if (run >= 5) score += run - 2;
      run = 1;
    }
  }
  return score;
}

const FINDER_LIKE = [true, false, true, true, true, false, true, false, false, false, false];

function penaltyFinderLike(m: QrMatrix): number {
  const n = m.length;
  let score = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c <= n - 11; c++) {
      for (const rev of [false, true]) {
        const want = (k: number): boolean => FINDER_LIKE[rev ? 10 - k : k]!;
        if (FINDER_LIKE.every((_, k) => m[r]![c + k] === want(k))) score += 40;
        if (FINDER_LIKE.every((_, k) => m[c + k]![r] === want(k))) score += 40;
      }
    }
  }
  return score;
}

/** Standard QR mask penalty (rules 1-4). */
function penalty(m: QrMatrix): number {
  const n = m.length;
  let score = penaltyFinderLike(m);
  let dark = 0;
  for (let i = 0; i < n; i++) {
    score += penaltyRuns(m[i]!) + penaltyRuns(m.map((row) => row[i]!));
    for (let c = 0; c < n; c++) {
      if (m[i]![c]) dark++;
      if (i < n - 1 && c < n - 1) {
        const v = m[i]![c];
        if (v === m[i + 1]![c] && v === m[i]![c + 1] && v === m[i + 1]![c + 1]) score += 3;
      }
    }
  }
  return score + Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
}

function build(codewords: number[], version: number, mask: number): QrMatrix {
  const n = qrSize(version);
  const m: QrMatrix = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  drawFunctionPatterns(m, version);
  const bits: boolean[] = codewords.flatMap((w) =>
    Array.from({ length: 8 }, (_, i) => ((w >> (7 - i)) & 1) === 1),
  );
  dataPositions(version).forEach(([r, c], i) => {
    m[r]![c] = (bits[i] ?? false) !== maskApplies(mask, r, c);
  });
  drawFormat(m, mask);
  m[n - 8]![8] = true;
  return m;
}

/**
 * Encodes text (UTF-8, byte mode, level M) into a QR matrix.
 * @param text payload; must fit in version 6 (106 bytes)
 * @throws when the payload is too long
 */
export function encodeQr(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  const version = LAYOUTS.findIndex((l) => dataCapacity(l) >= bytes.length + 2) + 1;
  if (version === 0) throw new Error('QR payload too long');
  const layout = LAYOUTS[version - 1]!;
  const codewords = interleave(buildData(bytes, layout), layout);
  let best: QrMatrix | undefined;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = build(codewords, version, mask);
    const score = penalty(candidate);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best!;
}

/**
 * Renders a matrix to an SVG string with a quiet zone.
 * @param m the matrix
 * @param quiet quiet-zone width in modules
 */
export function qrToSvg(m: QrMatrix, quiet = 4): string {
  const size = m.length + quiet * 2;
  let path = '';
  m.forEach((row, r) =>
    row.forEach((on, c) => {
      if (on) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }),
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
  );
}
