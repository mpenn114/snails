import { describe, expect, it } from 'vitest';
import {
  dataPositions,
  encodeQr,
  formatBits,
  maskApplies,
  qrSize,
  qrToSvg,
  reedSolomon,
} from './qr';

const HELLO_DATA = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];

describe('qr encoder', () => {
  it('matches the reference Reed-Solomon vector', () => {
    expect(reedSolomon(HELLO_DATA, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('produces known format bits', () => {
    expect(formatBits(0)).toBe(0x5412);
    expect(formatBits(2)).toBe(0b101111001111100);
  });

  it('has finder patterns, timing and dark module', () => {
    const m = encodeQr('http://192.168.1.20:3000/?room=ABCD');
    const n = m.length;
    expect(n).toBe(qrSize(3));
    for (const [r0, c0] of [
      [0, 0],
      [0, n - 7],
      [n - 7, 0],
    ] as const) {
      expect(m[r0]![c0]).toBe(true);
      expect(m[r0 + 3]![c0 + 3]).toBe(true);
      expect(m[r0 + 1]![c0 + 1]).toBe(false);
      expect(m[r0 + 6]![c0 + 6]).toBe(true);
    }
    for (let i = 8; i < n - 8; i++) expect(m[6]![i]).toBe(i % 2 === 0);
    expect(m[n - 8]![8]).toBe(true);
  });

  it('round-trips the payload through format info, unmasking and RS', () => {
    const text = 'http://10.0.0.5:3000/?room=WXYZ';
    const m = encodeQr(text);
    const n = m.length;
    const version = (n - 17) / 4;
    let fmt = 0;
    for (let i = 0; i < 8; i++) if (m[8]![n - 1 - i]) fmt |= 1 << i;
    for (let i = 8; i < 15; i++) if (m[n - 15 + i]![8]) fmt |= 1 << i;
    const mask = [0, 1, 2, 3, 4, 5, 6, 7].find((k) => formatBits(k) === fmt);
    expect(mask).toBeDefined();
    const bits = dataPositions(version).map(([r, c]) => m[r]![c]! !== maskApplies(mask!, r, c));
    const words: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      words.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | (b ? 1 : 0), 0));
    }
    expect(words[0]! >> 4).toBe(4);
    const len = ((words[0]! & 15) << 4) | (words[1]! >> 4);
    const payload: number[] = [];
    for (let i = 0; i < len; i++) {
      payload.push((((words[1 + i]! << 4) | (words[2 + i]! >> 4)) & 255) >>> 0);
    }
    expect(new TextDecoder().decode(new Uint8Array(payload))).toBe(text);
    expect(words.slice(44, 70)).toEqual(reedSolomon(words.slice(0, 44), 26));
  });

  it('rejects oversized payloads and renders svg', () => {
    expect(() => encodeQr('x'.repeat(200))).toThrow();
    expect(qrToSvg(encodeQr('hi'))).toContain('<svg');
  });
});
