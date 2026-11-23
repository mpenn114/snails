import type { LobbyPlayer, ServerMessage } from '@snails/protocol';
import { playerTeams } from './lobby-logic';

/** The `lobbyState` server message. */
export type LobbyStateMsg = Extract<ServerMessage, { type: 'lobbyState' }>;

/** Escapes text for safe insertion into HTML. */
export function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );
}

/** Returns the colour when it is a hex colour, else a neutral grey. */
export function safeColour(c: string | null): string {
  return c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : '#888';
}

/**
 * Roster list items for controllers (name, team, colour, ready, connected, host badge).
 * @param players lobby roster
 * @param hostId host player id
 */
export function rosterHtml(players: readonly LobbyPlayer[], hostId: string | null): string {
  return players
    .filter((p) => p.role === 'controller')
    .map((p) => {
      const badges = [
        p.id === hostId ? 'host' : '',
        p.ready ? 'ready' : '',
        p.connected ? '' : 'offline',
      ].filter(Boolean);
      const dot = `<span style="color:${safeColour(p.colour)}">&#9679;</span>`;
      const tag = badges.length ? ` (${badges.join(', ')})` : '';
      return `<li>${dot} ${esc(p.name)} [${esc(playerTeams(p).join('+') || '-')}]${tag}</li>`;
    })
    .join('');
}

function isActive(v: string, active: string | readonly string[] | null): boolean {
  const list = active === null ? [] : typeof active === 'string' ? [active] : active;
  return list.some((a) => a.toLowerCase() === v.toLowerCase());
}

/**
 * Picker buttons for team or colour choices.
 * @param items option values
 * @param active currently selected value
 * @param disabled lower-cased values that cannot be chosen
 * @param kind `team` shows the label; `colour` paints the button
 */
export function choiceHtml(
  items: readonly string[],
  active: string | readonly string[] | null,
  disabled: ReadonlySet<string>,
  kind: 'team' | 'colour',
): string {
  return items
    .map((v) => {
      const style = kind === 'colour' ? ` style="background:${safeColour(v)}"` : '';
      const on = isActive(v, active) ? ' on' : '';
      const off = disabled.has(v.toLowerCase()) ? ' disabled' : '';
      const label = kind === 'team' ? esc(v) : '';
      return `<button type="button" class="pick${on}" data-v="${esc(v)}"${style}${off}>${label}</button>`;
    })
    .join('');
}
