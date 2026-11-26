import type { InfoContent } from './weapon-info';

const CSS = `
.info-btn{position:absolute;top:2px;right:2px;width:28px;height:28px;min-width:28px;min-height:28px;padding:0;border:0;border-radius:50%;
  font:800 14px/1 var(--snl-font);font-style:italic;background:rgba(var(--snl-paper-rgb),.22);color:var(--snl-paper);touch-action:manipulation;pointer-events:auto}
.info-btn::after{content:'';position:absolute;inset:-8px}
.info-pop{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:100;width:min(86vw,320px);padding:14px 16px;border-radius:var(--snl-radius);
  background:var(--snl-ink);color:var(--snl-paper);font-family:var(--snl-font);font-size:var(--snl-text-m);box-shadow:var(--snl-shadow);
  border:var(--snl-outline) solid var(--snl-accent);touch-action:manipulation;pointer-events:auto}
.info-pop h2{margin:0 0 6px;font-size:var(--snl-text-l)}
.info-pop ul{margin:0 0 10px;padding-left:18px}
.info-pop button{min-height:44px;width:100%;border:0;border-radius:var(--snl-radius);font:inherit;font-weight:700;background:rgba(var(--snl-paper-rgb),.16);color:inherit}
.info-scrim{position:fixed;inset:0;z-index:99;background:rgba(0,0,0,.45);pointer-events:auto}`;

/** Creates the small (i) button for a tile; tapping it never reaches the tile's own handler. */
export function createInfoButton(label: string, onOpen: () => void): HTMLElement {
  const b = document.createElement('span');
  b.className = 'info-btn';
  b.setAttribute('role', 'button');
  b.tabIndex = 0;
  b.setAttribute('aria-label', `Info: ${label}`);
  b.textContent = 'i';
  const open = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    onOpen();
  };
  b.addEventListener('click', open);
  b.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') open(e);
  });
  // A disabled tile swallows clicks on its children in some browsers: handle the press too.
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  return b;
}

/** Opens a dismissable popover with a title and bullet lines; returns a close function. */
export function showInfoPopover(content: InfoContent): () => void {
  const style = document.createElement('style');
  style.textContent = CSS;
  const scrim = document.createElement('div');
  scrim.className = 'info-scrim';
  const pop = document.createElement('div');
  pop.className = 'info-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', content.title);
  const h = document.createElement('h2');
  h.textContent = content.title;
  const ul = document.createElement('ul');
  for (const l of content.lines) {
    const li = document.createElement('li');
    li.textContent = l;
    ul.append(li);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Got it';
  pop.append(h, ul, close);
  const done = (): void => {
    for (const e of [style, scrim, pop]) e.remove();
  };
  close.addEventListener('click', done);
  scrim.addEventListener('click', done);
  document.body.append(style, scrim, pop);
  close.focus();
  return done;
}
