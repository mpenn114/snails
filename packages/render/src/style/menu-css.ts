/**
 * Shared look of the menu screens (join, lobby, TV lobby, help): a garden-at-dusk backdrop,
 * frosted cards, chunky buttons, team chips and the snail logo. Everything is CSS plus one tiny
 * inline SVG; colours come from the `--snl-*` theme tokens.
 */

/** Inline SVG logo mark: an orange spiral-shell snail. */
export const LOGO_SVG =
  '<svg class="m-mark" viewBox="0 0 72 52" aria-hidden="true" focusable="false">' +
  '<path d="M4 44c0-7 5-10 12-10h34c9 0 15 4 16 10z" fill="#bfe07a"/>' +
  '<path d="M52 36c-2-9 1-16 6-19" stroke="#bfe07a" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
  '<path d="M60 36c0-8 4-14 9-15" stroke="#bfe07a" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
  '<circle cx="58" cy="15.5" r="3.6" fill="#fff6e4"/><circle cx="59" cy="15.5" r="1.6" fill="#2b2438"/>' +
  '<circle cx="69" cy="19.5" r="3.2" fill="#fff6e4"/><circle cx="69.8" cy="19.5" r="1.4" fill="#2b2438"/>' +
  '<circle cx="28" cy="26" r="19" fill="#ff8a3d"/><circle cx="28" cy="26" r="19" fill="none" stroke="#c9561b" stroke-width="2"/>' +
  '<path d="M28 26m-12 0a12 12 0 1 1 12 12a7.5 7.5 0 1 1-7.5-7.5a3.5 3.5 0 1 1 3.5 3.5" stroke="#fff6e4" stroke-width="2.8" fill="none" stroke-linecap="round" opacity=".9"/>' +
  '</svg>';

/**
 * Logo block: mark plus the wordmark.
 * @param tagline optional line under the wordmark (plain text, escaped by the caller)
 */
export function logoHtml(tagline = ''): string {
  const sub = tagline ? `<span class="m-tag">${tagline}</span>` : '';
  return `<div class="m-logo">${LOGO_SVG}<span class="m-word">Snails</span>${sub}</div>`;
}

/** The shared menu stylesheet. */
export function menuCss(): string {
  return `
.m-bg{background:radial-gradient(120% 70% at 12% -10%,rgba(134,176,74,.38),transparent 60%),radial-gradient(90% 60% at 100% 110%,rgba(42,127,158,.45),transparent 60%),linear-gradient(165deg,#3a2f52 0%,#2b2438 45%,#1e3a30 100%);color:var(--snl-paper);font-family:var(--snl-font)}
.m-bg::after{content:"";position:fixed;left:0;right:0;bottom:0;height:16px;pointer-events:none;z-index:0;
  background:radial-gradient(circle at 12px 16px,var(--snl-grass) 11px,transparent 12px) 0 100%/24px 16px repeat-x,linear-gradient(var(--snl-grass-edge,#5c8a34),var(--snl-grass-edge,#5c8a34)) 0 100%/100% 5px no-repeat}
.m-logo{display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center}
.m-mark{width:84px;height:auto;filter:drop-shadow(0 4px 6px rgba(0,0,0,.35));animation:m-bob 3.6s ease-in-out infinite}
.m-word{font-weight:900;font-size:clamp(2.4rem,9vw,3.6rem);line-height:1;letter-spacing:.02em;background:linear-gradient(180deg,#ffd27a,var(--snl-accent) 80%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 0 rgba(0,0,0,.35))}
.m-tag{font-weight:700;font-size:var(--snl-text-s);opacity:.75;letter-spacing:.04em}
@keyframes m-bob{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-4px) rotate(2deg)}}
.m-card{background:linear-gradient(180deg,rgba(var(--snl-paper-rgb),.11),rgba(var(--snl-paper-rgb),.05));border:1.5px solid rgba(var(--snl-paper-rgb),.16);border-radius:18px;padding:14px 16px;box-shadow:0 6px 18px rgba(0,0,0,.28);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.m-card>h2,.m-card>legend,.m-h{margin:0 0 10px;padding:0;font-size:var(--snl-text-s);font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--snl-foam);opacity:.85}
.m-btn{font-family:inherit;font-weight:800;font-size:var(--snl-text-m);min-height:48px;padding:10px 20px;border:0;border-radius:999px;color:var(--snl-paper);cursor:pointer;
  background:linear-gradient(180deg,rgba(var(--snl-paper-rgb),.2),rgba(var(--snl-paper-rgb),.1));box-shadow:0 3px 0 rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.18);transition:transform .08s,filter .15s,box-shadow .08s}
.m-btn:hover{filter:brightness(1.12)}
.m-btn:active{transform:translateY(3px);box-shadow:0 0 0 rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.1)}
.m-btn:focus-visible,.m-input:focus-visible{outline:3px solid var(--snl-foam);outline-offset:2px}
.m-btn:disabled{opacity:.4;cursor:default;filter:none;transform:none}
.m-btn.primary{background:linear-gradient(180deg,#ffb066,var(--snl-accent));color:var(--snl-ink);box-shadow:0 4px 0 #b4561a,0 8px 16px rgba(255,138,61,.3),inset 0 1px 0 rgba(255,255,255,.5)}
.m-btn.primary:active{box-shadow:0 0 0 #b4561a,inset 0 1px 0 rgba(255,255,255,.4)}
.m-btn.green{background:linear-gradient(180deg,#a9d36b,var(--snl-grass-edge,#5c8a34));color:#14230a;box-shadow:0 4px 0 #3c5f1f,inset 0 1px 0 rgba(255,255,255,.4)}
.m-input{font-family:inherit;font-weight:700;font-size:var(--snl-text-m);min-height:48px;width:100%;box-sizing:border-box;padding:0 14px;border-radius:14px;border:2px solid rgba(var(--snl-paper-rgb),.22);background:rgba(0,0,0,.22);color:var(--snl-paper);transition:border-color .15s,background .15s}
.m-input::placeholder{color:rgba(var(--snl-paper-rgb),.4)}
.m-input:focus{border-color:var(--snl-accent);background:rgba(0,0,0,.32)}
.m-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 12px 3px 4px;border-radius:999px;background:rgba(var(--snl-paper-rgb),.1);font-weight:800;font-size:var(--snl-text-s)}
.m-dot{display:inline-grid;place-items:center;width:1.9em;height:1.9em;border-radius:50%;color:#1a1424;font-weight:900;font-size:.85em;box-shadow:inset 0 -3px 0 rgba(0,0,0,.2),0 1px 3px rgba(0,0,0,.4);border:2px solid rgba(255,255,255,.7)}
.m-badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:.72em;font-weight:900;letter-spacing:.06em;text-transform:uppercase;background:rgba(var(--snl-paper-rgb),.16);margin-left:4px;vertical-align:middle}
.m-badge.host{background:var(--snl-accent);color:var(--snl-ink)}
.m-badge.is-ready{background:#7bd88f;color:#10321a}
.m-badge.off{background:rgba(255,255,255,.08);opacity:.7}
.m-badge.cpu{background:var(--snl-water)}
@media (prefers-reduced-motion:reduce){.m-mark{animation:none}.m-btn{transition:none}}
`;
}

/**
 * Adds the shared menu stylesheet to `doc` once (idempotent).
 * @param doc the document to style
 */
export function injectMenuStyles(doc: Document): void {
  if (doc.getElementById('snails-menu')) return;
  const style = doc.createElement('style');
  style.id = 'snails-menu';
  style.textContent = menuCss();
  doc.head.append(style);
}
