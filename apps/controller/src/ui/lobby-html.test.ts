import { describe, expect, it } from 'vitest';
import type { LobbyPlayer } from '@snails/protocol';
import { choiceHtml, esc, rosterHtml, safeColour } from './lobby-html';

const player = (over: Partial<LobbyPlayer>): LobbyPlayer => ({
  id: 'a',
  name: '<b>Ann</b>',
  role: 'controller',
  teamId: 'A',
  colour: '#e53935',
  ready: true,
  connected: false,
  ...over,
});

describe('lobby html', () => {
  it('escapes and sanitises', () => {
    expect(esc('<&">')).toBe('&lt;&amp;&quot;&gt;');
    expect(safeColour('red;x')).toBe('#888');
    expect(safeColour('#abc')).toBe('#abc');
  });

  it('renders roster badges and skips displays', () => {
    const html = rosterHtml([player({}), player({ id: 'd', role: 'display' })], 'a');
    expect(html).toContain('&lt;b&gt;Ann');
    expect(html).toContain('(host, ready, offline)');
    expect(html.match(/<li>/g)).toHaveLength(1);
  });

  it('marks active and disabled choices', () => {
    const html = choiceHtml(['#AA0000', '#00aa00'], '#aa0000', new Set(['#00aa00']), 'colour');
    expect(html).toContain('pick on');
    expect(html).toContain('disabled');
  });
});
