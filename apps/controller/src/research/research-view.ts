import { createInfoButton, showInfoPopover } from '../controls/info-popover';
import { techInfo } from '../controls/weapon-info';
import type { ResearchModel, TechCard } from './research-model';

/** Stylesheet of the research screen (injected once by `mountResearch`). */
export const RESEARCH_CSS = `
.rs{position:fixed;inset:0;display:none;flex-direction:column;pointer-events:auto;background:var(--snl-ink);color:var(--snl-paper);font-family:var(--snl-font);
  padding:calc(8px + env(safe-area-inset-top)) calc(8px + env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) calc(8px + env(safe-area-inset-left));touch-action:pan-y}
.rs.open{display:flex}
.rs-head{display:flex;align-items:center;gap:10px;min-height:48px}
.rs-calc{flex:1;font-size:var(--snl-text-l);font-weight:800}
.rs-btn{min-height:48px;min-width:48px;padding:6px 14px;border:0;border-radius:var(--snl-radius);font:inherit;font-weight:700;background:rgba(var(--snl-paper-rgb),.16);color:var(--snl-paper);touch-action:manipulation}
.rs-queue{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0;font-size:var(--snl-text-s)}
.rs-slot{display:flex;align-items:center;gap:6px;padding:4px 4px 4px 10px;border-radius:var(--snl-radius);background:rgba(var(--snl-paper-rgb),.1)}
.rs-slot.active{border:var(--snl-outline) solid var(--snl-accent)}
.rs-slot button{min-height:44px;min-width:44px;border:0;border-radius:var(--snl-radius);font:inherit;font-weight:800;background:rgba(var(--snl-paper-rgb),.16);color:inherit}
.rs-tree{flex:1;overflow:auto;display:grid;grid-template-columns:repeat(4,minmax(78px,1fr));gap:6px;align-content:start}
.rs-col{font-size:var(--snl-text-s);font-weight:800;text-align:center;opacity:.8}
.rs-card{min-height:76px;padding:6px 4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;text-align:center;font:inherit;font-size:var(--snl-text-s);font-weight:700;
  color:var(--snl-paper);background:rgba(var(--snl-paper-rgb),.1);border:var(--snl-outline) solid transparent;border-radius:var(--snl-radius);touch-action:manipulation}
.rs-cardwrap{position:relative;display:flex}
.rs-cardwrap>.rs-card{flex:1}
.rs-card small{font-weight:600;opacity:.8}
.rs-card.available{border-color:var(--snl-foam)}
.rs-card.queued,.rs-card.active{border-color:var(--snl-accent)}
.rs-card.researched{background:var(--snl-water)}
.rs-card.locked{opacity:.45}
.rs-card.capstone{font-weight:800}
.rs-hold{min-height:72px;margin-top:8px;font-size:var(--snl-text-m);background:var(--snl-accent);color:var(--snl-ink);user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none}
.rs-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);max-width:90vw;padding:10px 16px;border-radius:var(--snl-radius);
  background:rgba(var(--snl-ink-rgb),.92);color:var(--snl-paper);font:700 var(--snl-text-m) var(--snl-font);box-shadow:var(--snl-shadow);pointer-events:none;z-index:50}
`;

/** Callbacks of the rendered screen. */
export interface ViewActions {
  queue(techId: string): void;
  cancel(techId: string): void;
  /** A locked card was tapped; shows why. */
  explain(card: TechCard): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function slot(
  s: { techId: string; name: string; turns: number },
  active: boolean,
  a: ViewActions,
): HTMLElement {
  const wrap = el('div', active ? 'rs-slot active' : 'rs-slot');
  const turns = `${s.turns} turn${s.turns === 1 ? '' : 's'}`;
  wrap.append(
    el('span', '', `${active ? 'Researching ' : ''}${s.name} (${turns}${active ? ' left' : ''})`),
  );
  const x = el('button', '', '✕');
  x.type = 'button';
  x.setAttribute('aria-label', `Cancel ${s.name}`);
  x.addEventListener('click', () => a.cancel(s.techId));
  wrap.append(x);
  return wrap;
}

function card(c: TechCard, a: ViewActions): HTMLElement {
  const wrap = el('div', 'rs-cardwrap');
  wrap.append(
    cardButton(c, a),
    createInfoButton(c.name, () => showInfoPopover(techInfo(c))),
  );
  return wrap;
}

function cardButton(c: TechCard, a: ViewActions): HTMLElement {
  const b = el('button', `rs-card ${c.state}${c.capstone ? ' capstone' : ''}`);
  b.type = 'button';
  b.dataset.tech = c.id;
  b.append(el('span', '', c.name));
  const status = c.state === 'available' || c.state === 'locked' ? `${c.cost} Ca` : c.state;
  b.append(el('small', '', `${status} · ${c.turns}t`));
  b.addEventListener('click', () => {
    if (c.state === 'available') a.queue(c.id);
    else if (c.state === 'locked') a.explain(c);
  });
  return b;
}

/** Re-renders the header and tree of the screen body from the model. */
export function renderResearch(body: HTMLElement, m: ResearchModel, a: ViewActions): void {
  const queue = el('div', 'rs-queue');
  if (m.active) queue.append(slot(m.active, true, a));
  for (const q of m.queue) queue.append(slot(q, false, a));
  if (!m.active && m.queue.length === 0) queue.append(el('span', '', 'Nothing queued: tap a tech'));
  const tree = el('div', 'rs-tree');
  for (const col of m.columns) tree.append(el('div', 'rs-col', col.label));
  const maxTier = Math.max(0, ...m.columns.flatMap((c) => c.cards.map((x) => x.tier)));
  for (let tier = 0; tier <= maxTier; tier++) {
    const perCol = m.columns.map((c) => c.cards.filter((x) => x.tier === tier));
    const rows = Math.max(...perCol.map((c) => c.length));
    for (let r = 0; r < rows; r++) {
      for (const cards of perCol) {
        const c = cards[r];
        tree.append(c ? card(c, a) : el('div', ''));
      }
    }
  }
  const calc = body.querySelector('.rs-calc');
  if (calc) calc.textContent = `Calcium ${m.calcium}`;
  body.querySelector('.rs-queue')?.remove();
  body.querySelector('.rs-tree')?.remove();
  body.querySelector('.rs-head')?.after(queue, tree);
}
