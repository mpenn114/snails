import { describe, expect, it } from 'vitest';
import { MatchSettings, type LobbyPlayer } from '@snails/protocol';
import { lobbyHtml } from './lobby-view';

const player = (over: Partial<LobbyPlayer>): LobbyPlayer => ({
  id: 'p1',
  name: 'Ann',
  role: 'controller',
  teamId: 'A',
  teamIds: ['A'],
  colour: '#e5283f',
  teamName: 'Slime Squad',
  snailNames: ['Gary', 'Turbo', 'Moss', 'Dot'],
  ready: true,
  connected: true,
  ...over,
});

describe('display lobby markup', () => {
  const settings = MatchSettings.parse({ snailsPerTeam: 3 });
  const model = (players: LobbyPlayer[]) => ({
    roomCode: 'ABCD',
    joinUrl: undefined,
    players,
    settings,
  });

  it('shows the team name, player and as many snail names as the match uses', () => {
    const html = lobbyHtml(model([player({})]));
    expect(html).toContain('Slime Squad');
    expect(html).toContain('<li>Moss</li>');
    expect(html).not.toContain('<li>Dot</li>');
    expect(html).toContain('1/1 ready');
  });

  it('escapes team, player and snail names', () => {
    const html = lobbyHtml(
      model([player({ teamName: '<script>x</script>', name: '<b>', snailNames: ['<i>'] })]),
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<li><i>');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('&lt;script&gt;');
  });
});
