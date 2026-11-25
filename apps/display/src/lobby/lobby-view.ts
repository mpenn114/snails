import type { LobbyPlayer, MatchSettings } from '@snails/protocol';
import { groupByTeam, readyCount, settingsChips } from './lobby-logic';
import { teamMarkerHtml } from '@snails/render';
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

function playerRow(p: LobbyPlayer): string {
  const dot = `<span class="dot" style="background:${safeColour(p.colour)}"></span>${teamMarkerHtml(p.colour)}`;
  const state = p.connected ? (p.ready ? 'ready' : 'waiting') : 'offline';
  const badge = p.cpu ? ' <span class="badge cpu">CPU</span>' : '';
  return `<li>${dot}${esc(p.name)}${badge} <em>${state}</em></li>`;
}

function chipsHtml(s: MatchSettings): string {
  const chips = settingsChips(s)
    .map(([k, v]) => `<li><span>${esc(k)}</span> <b>${esc(v)}</b></li>`)
    .join('');
  return `<ul class="chips" aria-label="Match settings">${chips}</ul>`;
}

function render(m: LobbyModel): string {
  const groups = groupByTeam(m.players)
    .map((g) => {
      const title = g.teamId ? `Team ${esc(g.teamId)}` : 'No team yet';
      return `<section><h3>${title}</h3><ul>${g.players.map(playerRow).join('')}</ul></section>`;
    })
    .join('');
  const { ready, total } = readyCount(m.players);
  const join = m.joinUrl ? `<p class="url">${esc(m.joinUrl)}</p>` : '';
  return `<div class="lobby-card"><div class="join-side"><p>Room</p>
    <div class="code">${esc(m.roomCode)}</div>${join}
    <div class="qr">${qrSvg(m.joinUrl)}</div></div>
    <div class="roster-side"><h2>Players ${ready}/${total} ready</h2>
    <div class="teams">${groups || '<p>Scan the code to join.</p>'}</div>
    ${chipsHtml(m.settings)}</div></div>`;
}

/** Thin DOM lobby screen on the TV; re-renders from a model. */
export function mountLobbyScreen(root: HTMLElement): {
  update: (m: LobbyModel) => void;
  hide: () => void;
} {
  const el = document.createElement('div');
  el.className = 'lobby';
  root.appendChild(el);
  return {
    update: (m) => {
      el.hidden = false;
      el.innerHTML = render(m);
    },
    hide: () => {
      el.hidden = true;
    },
  };
}
