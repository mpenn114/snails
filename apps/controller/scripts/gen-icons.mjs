// Generates the controller PWA icons (a simple snail glyph) as PNG files.
// No dependencies: pixels are rasterised here and PNG chunks are encoded with node:zlib.
// Run with: node apps/controller/scripts/gen-icons.mjs   (or `pnpm --filter @snails/controller gen:icons`)
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BG = [16, 24, 32, 255];
const SHELL = [244, 162, 89, 255];
const SPIRAL = [196, 104, 48, 255];
const BODY = [207, 232, 160, 255];
const INK = [16, 24, 32, 255];
const SAMPLES = 3; // supersampling grid per axis (anti-aliasing)
const MASKABLE_SAFE = 0.8; // maskable icons keep art inside the central 80% safe zone

/** Distance from point (px,py) to segment (ax,ay)-(bx,by). */
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Whether (x,y) lies inside an axis-aligned ellipse. */
function inEllipse(x, y, cx, cy, rx, ry) {
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}

/** Colour of the glyph at unit-square point (x,y), or null for transparent. Top layers first. */
function glyphColour(x, y) {
  if (Math.hypot(x - 0.72, y - 0.42) <= 0.035 || Math.hypot(x - 0.82, y - 0.44) <= 0.035) {
    return INK;
  }
  if (
    distToSegment(x, y, 0.66, 0.66, 0.72, 0.42) <= 0.025 ||
    distToSegment(x, y, 0.74, 0.66, 0.82, 0.44) <= 0.025
  ) {
    return BODY;
  }
  const d = Math.hypot(x - 0.42, y - 0.46);
  if (d <= 0.04 || (d >= 0.12 && d <= 0.15)) return SPIRAL;
  if (d <= 0.22) return SHELL;
  if (inEllipse(x, y, 0.46, 0.68, 0.34, 0.07)) return BODY;
  return null;
}

/** Colour at pixel-space sample (u,v) of an icon, honouring the maskable safe zone. */
function sampleColour(u, v, scale) {
  const gx = 0.5 + (u - 0.5) / scale;
  const gy = 0.5 + (v - 0.5) / scale;
  return glyphColour(gx, gy) ?? BG;
}

/**
 * Rasterises the snail icon into an RGBA buffer.
 *
 * @param {number} size - Edge length in pixels.
 * @param {boolean} maskable - Shrink the art into the maskable safe zone.
 * @returns {Buffer} Row-major RGBA pixels.
 */
function rasterise(size, maskable) {
  const scale = maskable ? MASKABLE_SAFE : 1;
  const out = Buffer.alloc(size * size * 4);
  const n = SAMPLES * SAMPLES;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const u = (x + (sx + 0.5) / SAMPLES) / size;
          const v = (y + (sy + 0.5) / SAMPLES) / size;
          const c = sampleColour(u, v, scale);
          for (let k = 0; k < 4; k++) acc[k] += c[k];
        }
      }
      const o = (y * size + x) * 4;
      for (let k = 0; k < 4; k++) out[o + k] = Math.round(acc[k] / n);
    }
  }
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** CRC-32 (ISO-HDLC) as required by PNG chunks. */
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Builds one PNG chunk: length, type, data, CRC over type+data. */
function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * Encodes RGBA pixels as an 8-bit RGBA PNG (filter type 0 on every scanline).
 *
 * @param {number} width - Image width in pixels.
 * @param {number} height - Image height in pixels.
 * @param {Buffer} rgba - Row-major RGBA pixel data.
 * @returns {Buffer} PNG file bytes.
 */
export function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit depth, RGBA, deflate, adaptive filter method, no interlace
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon-180.png', size: 180, maskable: false },
];

const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(outDir, { recursive: true });
for (const { file, size, maskable } of TARGETS) {
  writeFileSync(join(outDir, file), encodePng(size, size, rasterise(size, maskable)));
  console.log(`wrote ${outDir}${file} (${size}x${size}${maskable ? ', maskable' : ''})`);
}
