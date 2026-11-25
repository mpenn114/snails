import { describe, expect, it } from 'vitest';
import { hudHtml } from './hud-view';
import { EMPTY_HUD } from './hud-model';

describe('hudHtml', () => {
  it('renders turn, bars and escapes names', () => {
    const html = hudHtml({
      ...EMPTY_HUD,
      turnTeam: '<b>R</b>',
      turnColour: '#f00',
      turnSnail: 'Sid',
      timerSeconds: 9,
      bars: [
        {
          teamId: 'a',
          name: 'R',
          colour: 'bad',
          health: 1,
          maxHealth: 2,
          fraction: 0.5,
          active: true,
          score: null,
          target: null,
        },
      ],
      winner: { name: null, colour: null },
    });
    expect(html).toContain('&lt;b&gt;R');
    expect(html).toContain('width:50%');
    expect(html).toContain('#888');
    expect(html).toContain('Draw!');
  });
  it('has no turn banner without a match', () => {
    expect(hudHtml(EMPTY_HUD)).not.toContain('class="turn"');
    expect(hudHtml(EMPTY_HUD)).not.toContain('class="notice"');
    expect(hudHtml({ ...EMPTY_HUD, notice: 'Sudden death! <b>' })).toContain(
      '<div class="notice">Sudden death! &lt;b&gt;</div>',
    );
  });
  it('shows King of the Hill scores and the hill win line', () => {
    const bar = {
      teamId: 'a',
      name: 'Red',
      colour: '#f00',
      health: 1,
      maxHealth: 1,
      fraction: 1,
      active: false,
      score: 12,
      target: 30,
    };
    const html = hudHtml({
      ...EMPTY_HUD,
      bars: [bar],
      winner: { name: 'Red', colour: '#f00', reason: 'hill' },
    });
    expect(html).toContain('<b class="score">12/30</b>');
    expect(html).toContain('Red wins the hill!');
  });
});
