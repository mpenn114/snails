import type { LobbyPlayer, MatchSettings } from '@snails/protocol';
import { readyCount, settingsChips } from './lobby-logic';
import { logoHtml, teamMarkerHtml } from '@snails/render';
import { injectDisplayMenuStyles } from './lobby-css';
import { encodeQr, qrToSvg } from './qr';

/** Data the lobby screen renders. */
export interface LobbyModel {
  roomCode: string;
  joinUrl: string | undefined;
  players: LobbyPlayer[];
  settings: MatchSettings;
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function qrSvg(url: string | undefined): string {
  if (!url) return '';
  try {
    return qrToSvg(encodeQr(url));
  } catch {
    return '';
  }
}

function safeColour(c: string | null): string {
  return c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : '#555';
}

function stateBadge(p: LobbyPlayer): string {
  const state = p.connected ? (p.ready ? 'ready' : 'waiting') : 'offline';
  return `<span class="state ${state}">${p.cpu ? 'CPU' : state}</span>`;
}

/** One team card: slot chip, team name, player, state and the snail names that will play. */
function teamCard(p: LobbyPlayer, snails: number): string {
  const colour = safeColour(p.colour);
  const label = p.teamName || p.name;
  const names = (p.snailNames ?? []).slice(0, snails);
  const roll = names.length
    ? `<ul class="snails">${names.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`
    : '';
  const who = p.cpu ? '' : `<div class="who">${esc(p.name)}</div>`;
  return `<section class="team m-card" style="--tc:${colour}"><div class="team-head">
    <span class="m-dot" style="background:${colour}">${esc(p.teamId ?? '?')}</span>${teamMarkerHtml(p.colour)}
    <span class="team-name">${esc(label)}</span>${stateBadge(p)}</div>${who}${roll}</section>`;
}

function chipsHtml(s: MatchSettings): string {
  const chips = settingsChips(s)
    .map(([k, v]) => `<li><span>${esc(k)}</span> <b>${esc(v)}</b></li>`)
    .join('');
  return `<ul class="chips" aria-label="Match settings">${chips}</ul>`;
}

/** The lobby markup for a model. */
export function lobbyHtml(m: LobbyModel): string {
  const ctl = m.players.filter((p) => p.role === 'controller');
  const cards = ctl.map((p) => teamCard(p, m.settings.snailsPerTeam)).join('');
  const { ready, total } = readyCount(m.players);
  const join = m.joinUrl ? `<p class="url">${esc(m.joinUrl)}</p>` : '';
  return `<div class="lobby-card"><div class="join-side">${logoHtml('Slow, slimy, explosive')}
    <p class="label">Room code</p><div class="code">${esc(m.roomCode)}</div>
    ${m.joinUrl ? `<div class="qr">${qrSvg(m.joinUrl)}</div>` : ''}${join}</div>
    <div class="roster-side"><h2>Teams <span class="count">${ready}/${total} ready</span></h2>
    <div class="teams">${cards || '<p class="empty">Scan the code with your phone to join.</p>'}</div>
    ${chipsHtml(m.settings)}
    <p class="howto"><strong>How to play:</strong> take turns to aim and fire from your phone; last team standing wins.</p></div></div>`;
}

/** Thin DOM lobby screen on the TV; re-renders from a model. */
export function mountLobbyScreen(root: HTMLElement): {
  update: (m: LobbyModel) => void;
  hide: () => void;
} {
  injectDisplayMenuStyles(document);
  const el = document.createElement('div');
  el.className = 'lobby m-bg';
  root.appendChild(el);
  return {
    update: (m) => {
      el.hidden = false;
      el.innerHTML = lobbyHtml(m);
    },
    hide: () => {
      el.hidden = true;
    },
  };
}
