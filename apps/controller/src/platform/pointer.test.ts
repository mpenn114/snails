import { describe, expect, it, vi } from 'vitest';
import { tryCapture } from './pointer';

describe('tryCapture', () => {
  it('returns true when capture succeeds', () => {
    const setPointerCapture = vi.fn();
    expect(tryCapture({ setPointerCapture }, 7)).toBe(true);
    expect(setPointerCapture).toHaveBeenCalledWith(7);
  });
  it('returns false instead of throwing (Safari InvalidStateError / NotFoundError)', () => {
    const el = {
      setPointerCapture: () => {
        throw new Error('NotFoundError');
      },
    };
    expect(tryCapture(el, 1)).toBe(false);
  });
  it('returns false when the API is missing', () => {
    expect(tryCapture({} as Pick<HTMLElement, 'setPointerCapture'>, 1)).toBe(false);
  });
});
