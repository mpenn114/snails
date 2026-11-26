import type { LobbyPlayer, ServerMessage } from '@snails/protocol';
import { teamGlyphForColour } from '@snails/render';
import { playerTeams } from './lobby-logic';
import { cpuSummary } from './cpu-controls';

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

/** Round team chip: colour fill, team slot letter and the colour-blind shape glyph. */
function chipHtml(p: LobbyPlayer): string {
  const slot = esc(p.teamId ?? '?');
  return `<span class="m-dot" style="background:${safeColour(p.colour)}">${slot}</span>`;
}

/**
 * Roster list items for controllers (team chip, team name, player name, status badges).
 * @param players lobby roster
 * @param hostId host player id
 * @param canRemoveCpu whether to show a remove button on CPU teams (host only)
 */
export function rosterHtml(
  players: readonly LobbyPlayer[],
  hostId: string | null,
  canRemoveCpu = false,
): string {
  return players
    .filter((p) => p.role === 'controller')
    .map((p) => {
      const glyph = `<span class="team-glyph" aria-hidden="true">${teamGlyphForColour(p.colour)}</span>`;
      if (p.cpu) {
        const rm = canRemoveCpu
          ? ` <button type="button" class="cpu-remove" data-team="${esc(p.teamId ?? p.id)}" aria-label="Remove ${esc(p.name)}">&#10005;</button>`
          : '';
        return `<li>${chipHtml(p)}${glyph}<span class="who"><b>${esc(p.name)}</b><small>${esc(cpuSummary(p.cpu))}</small></span><span class="badge m-badge cpu">CPU</span>${rm}</li>`;
      }
      const badges = [
        p.id === hostId ? '<span class="m-badge host">host</span>' : '',
        p.ready ? '<span class="m-badge is-ready">ready</span>' : '',
        p.connected ? '' : '<span class="m-badge off">offline</span>',
      ].join('');
      const extra = playerTeams(p).length > 1 ? ` +${playerTeams(p).length - 1}` : '';
      return `<li>${chipHtml(p)}${glyph}<span class="who"><b>${esc(p.teamName || p.name)}${extra}</b><small>${esc(p.name)}</small></span>${badges}</li>`;
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
      const label = kind === 'team' ? esc(v) : esc(teamGlyphForColour(v));
      return `<button type="button" class="pick${on}" data-v="${esc(v)}"${style}${off}>${label}</button>`;
    })
    .join('');
}
