import { describe, expect, it } from 'vitest';
import { declutterLabels, type LabelBox } from './label-declutter.js';

const box = (id: string, x: number, y: number, distance: number): LabelBox => ({
  id,
  x,
  y,
  width: 0.2,
  height: 0.05,
  distance,
});

describe('declutterLabels', () => {
  it('leaves separated labels untouched', () => {
    const r = declutterLabels([box('a', 0, 0, 5), box('b', 0.5, 0, 6)]);
    expect(r.every((p) => !p.hidden && p.offsetY === 0)).toBe(true);
  });

  it('shifts the farther of two overlapping labels up', () => {
    const r = declutterLabels([box('far', 0, 0, 20), box('near', 0.05, 0, 5)]);
    expect(r[0]).toEqual({ id: 'far', hidden: false, offsetY: 0.05 });
    expect(r[1]).toEqual({ id: 'near', hidden: false, offsetY: 0 });
  });

  it('hides labels when no slot is free', () => {
    const boxes = [0, 1, 2, 3, 4].map((i) => box(`s${i}`, 0, 0, i + 1));
    const r = declutterLabels(boxes, 3);
    expect(r.map((p) => p.hidden)).toEqual([false, false, false, false, true]);
  });
});
