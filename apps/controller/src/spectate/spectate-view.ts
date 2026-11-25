import type { ServerMessage } from '@snails/protocol';
import { teamGlyphForColour } from '@snails/render';
import type { ControllerClient } from '../net/client';
import { deriveView, initialSpectate, reduceSpectate } from './spectate-model';
import { SLOT_LEFT, SLOT_TOP } from '../shell/layers';
import type { SpectateState, SpectateView } from './spectate-model';

const CSS = `
.spec{position:fixed;inset:0;pointer-events:none;font-family:var(--snl-font);color:var(--snl-paper)}
.spec-banner{position:absolute;top:calc(8px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);
  padding:4px 14px;border-radius:var(--snl-radius);pointer-events:none;color:var(--snl-paper);font-family:var(--snl-font);font-size:var(--snl-text-s);font-weight:700;background:rgba(var(--snl-ink-rgb),.9);border-left:8px solid var(--c,#888);
  font-weight:700;text-align:center;max-width:90%}
.spec-hint{display:block;font-size:.8rem;font-weight:400;opacity:.8}
.spec-hp{position:absolute;left:calc(8px + env(safe-area-inset-left));top:calc(72px + env(safe-area-inset-top));
  list-style:none;margin:0;padding:4px 8px;border-radius:var(--snl-radius);background:rgba(var(--snl-ink-rgb),.8);font-size:var(--snl-text-s);color:var(--snl-paper);font-family:var(--snl-font);order:10}
#shell-left .spec-hp{position:static}
.spec-hp li.dead{opacity:.4;text-decoration:line-through}
.spec-flash{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-size:var(--snl-text-xxl);
  font-weight:900;background:rgba(var(--snl-accent-rgb),.25);text-shadow:0 2px 12px rgba(var(--snl-ink-rgb),.9)}
.spec-flash.on{display:flex;animation:spec-fade 1.2s ease-out forwards}
@keyframes spec-fade{0%{opacity:0;transform:scale(.8)}20%{opacity:1;transform:scale(1.1)}100%{opacity:0;transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.spec-flash.on{animation:none;opacity:1}}
.spec-end{position:absolute;inset:0;display:none;flex-direction:column;gap:12px;align-items:center;justify-content:center;
  background:rgba(var(--snl-ink-rgb),.94);pointer-events:auto;font-size:var(--snl-text-xl);padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;font-weight:800;text-align:center}
.spec-end.on{display:flex}
.spec-end small{font-size:var(--snl-text-m);font-weight:400;opacity:.8}`;

const HTML = `<div class="spec-banner"><span class="spec-title"></span><span class="spec-hint"></span></div>
  <ul class="spec-hp"></ul><div class="spec-flash">YOUR TURN!</div>
  <div class="spec-end"><span class="spec-endtitle"></span><small>Waiting for the lobby to resume</small></div>`;

function paint(q: (sel: string) => HTMLElement, v: SpectateView): void {
  const banner = q('.spec-banner');
  banner.style.display = v.kind === 'waiting' || v.kind === 'myTurn' ? '' : 'none';
  banner.style.setProperty('--c', v.colour ?? '#888');
  const glyph = teamGlyphForColour(v.colour);
  const title = v.kind === 'myTurn' ? 'Your turn!' : v.title;
  q('.spec-title').textContent = glyph ? `${glyph} ${title}` : title;
  q('.spec-hint').textContent = v.hint;
  const hp = q('.spec-hp');
  hp.style.display = v.kind === 'hidden' ? 'none' : '';
  hp.replaceChildren(
    ...v.mySnails.map((s) => {
      const li = document.createElement('li');
      li.textContent = `${s.name}: ${s.hp ?? '?'}`;
      li.classList.toggle('dead', s.hp !== null && s.hp <= 0);
      return li;
    }),
  );
  q('.spec-end').classList.toggle('on', v.kind === 'ended');
  q('.spec-endtitle').textContent = v.title;
}

/**
 * Mounts the spectating banner, own-team health list, "YOUR TURN!" flash and match-end screen.
 * Returns a disposer. `onBackToLobby` fires when the lobby resumes after a finished match.
 */
export function mountSpectate(
  parent: HTMLElement,
  client: ControllerClient,
  playerId: string | null,
  onBackToLobby: () => void = () => undefined,
): () => void {
  const style = document.createElement('style');
  style.textContent = CSS;
  const root = document.createElement('div');
  root.className = 'spec';
  root.innerHTML = HTML;
  parent.append(style, root);
  // Single top bar and left column when the shell provides the slots.
  const parts = new Map<string, HTMLElement>();
  for (const sel of [
    '.spec-banner',
    '.spec-title',
    '.spec-hint',
    '.spec-hp',
    '.spec-end',
    '.spec-endtitle',
  ]) {
    parts.set(sel, root.querySelector(sel) as HTMLElement);
  }
  const q = (sel: string): HTMLElement => parts.get(sel) as HTMLElement;
  document.getElementById(SLOT_TOP)?.append(q('.spec-banner'));
  document.getElementById(SLOT_LEFT)?.append(q('.spec-hp'));
  let state: SpectateState = initialSpectate(playerId);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flash = root.querySelector('.spec-flash') as HTMLElement;
  const apply = (msg: ServerMessage): void => {
    const prev = state;
    state = reduceSpectate(state, msg);
    if (prev.phase === 'ended' && state.phase === 'lobby') onBackToLobby();
    if (state.flashSeq !== prev.flashSeq) {
      flash.classList.add('on');
      clearTimeout(timer);
      timer = setTimeout(() => flash.classList.remove('on'), 1200);
    }
    paint(q, deriveView(state));
  };
  const offs = [
    client.on('lobbyState', apply),
    client.on('matchStarted', apply),
    client.on('turnStart', apply),
    client.on('snapshot', apply),
    client.on('eventBatch', apply),
  ];
  paint(q, deriveView(state));
  return () => {
    offs.forEach((off) => off());
    clearTimeout(timer);
    q('.spec-banner').remove();
    q('.spec-hp').remove();
    root.remove();
    style.remove();
  };
}
