import { describe, expect, it } from 'vitest';
import {
  PASS_PHONE_LABEL_STYLE,
  PASS_PHONE_STYLE,
  passPhoneText,
  shouldPassPhone,
} from './pass-phone';

describe('pass-phone', () => {
  it('shows only for hot-seat phones holding several teams including the active one', () => {
    expect(shouldPassPhone('hotSeat', ['A', 'B'], 'B')).toBe(true);
    expect(shouldPassPhone('hotSeat', ['A', 'B'], 'C')).toBe(false);
    expect(shouldPassPhone('hotSeat', ['A'], 'A')).toBe(false);
    expect(shouldPassPhone('perPlayer', ['A', 'B'], 'A')).toBe(false);
  });

  it('words the prompt', () => {
    expect(passPhoneText('Reds')).toBe('Pass the phone to Reds');
  });

  it('accepts taps despite living in a click-through shell layer', () => {
    expect(PASS_PHONE_STYLE).toContain('pointer-events:auto');
    expect(PASS_PHONE_LABEL_STYLE).toContain('pointer-events:auto');
  });
});
