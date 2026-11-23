import { describe, expect, it } from 'vitest';
import { passPhoneText, shouldPassPhone } from './pass-phone';

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
});
