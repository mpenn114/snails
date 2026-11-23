import type { HudModel } from './hud-model';

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const safeColour = (c: string | null): string => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : '#888');

/** Renders the HUD model to HTML (pure; unit tested). */
export function hudHtml(m: HudModel): string {
  const turn = m.turnTeam
    ? `<div class="turn" style="border-color:${safeColour(m.turnColour)}">${esc(m.turnTeam)}` +
      `${m.turnSnail ? ` - ${esc(m.turnSnail)}` : ''}<span class="timer">${m.timerSeconds}</span></div>`
    : '';
  const bars = m.bars
    .map(
      (b) =>
        `<div class="bar${b.active ? ' active' : ''}"><span>${esc(b.name)}</span>` +
        `<i style="width:${Math.round(b.fraction * 100)}%;background:${safeColour(b.colour)}"></i></div>`,
    )
    .join('');
  const win = m.winner
    ? `<div class="winner">${m.winner.name ? `${esc(m.winner.name)} wins!` : 'Draw!'}</div>`
    : '';
  return `${turn}<div class="bars">${bars}</div>${win}`;
}

/** Thin DOM HUD overlay on top of the canvas. */
export function mountHud(root: HTMLElement): {
  update: (m: HudModel) => void;
  setVisible: (v: boolean) => void;
} {
  const el = document.createElement('div');
  el.className = 'hud';
  el.hidden = true;
  root.appendChild(el);
  return {
    update: (m) => {
      el.innerHTML = hudHtml(m);
    },
    setVisible: (v) => {
      el.hidden = !v;
    },
  };
}
