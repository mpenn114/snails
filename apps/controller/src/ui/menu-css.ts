import { injectMenuStyles } from '@snails/render';

/** Phone menu styles (join and lobby screens); builds on the shared `m-*` classes from `@snails/render`. */
export const CONTROLLER_MENU_CSS = `
.join{pointer-events:auto;position:fixed;inset:0;display:flex;flex-direction:column;gap:14px;justify-content:center;box-sizing:border-box;
  padding:max(20px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));
  background:radial-gradient(120% 70% at 12% -10%,rgba(134,176,74,.38),transparent 60%),radial-gradient(90% 60% at 100% 110%,rgba(42,127,158,.45),transparent 60%),linear-gradient(165deg,#3a2f52 0%,#2b2438 45%,#1e3a30 100%);
  touch-action:manipulation;overflow:auto;-webkit-overflow-scrolling:touch}
.join>*{width:100%;max-width:460px;margin-left:auto;margin-right:auto;box-sizing:border-box;flex-shrink:0}
.join h1{margin:0}
.join.lobby{justify-content:flex-start;padding-bottom:max(40px,env(safe-area-inset-bottom))}
.join button{font-family:inherit;font-weight:800;font-size:var(--snl-text-m);min-height:48px;padding:10px 20px;border:0;border-radius:999px;color:var(--snl-paper);cursor:pointer;
  background:linear-gradient(180deg,rgba(var(--snl-paper-rgb),.2),rgba(var(--snl-paper-rgb),.1));box-shadow:0 3px 0 rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.18);transition:transform .08s,filter .15s,box-shadow .08s}
.join button:hover{filter:brightness(1.12)}
.join button:active{transform:translateY(3px);box-shadow:0 0 0 rgba(0,0,0,.3)}
.join button:focus-visible,.join input:focus-visible,.join select:focus-visible{outline:3px solid var(--snl-foam);outline-offset:2px}
.join button:disabled{opacity:.4;cursor:default;filter:none;transform:none}
.join button.primary{background:linear-gradient(180deg,#ffb066,var(--snl-accent));color:var(--snl-ink);box-shadow:0 4px 0 #b4561a,0 8px 16px rgba(255,138,61,.3),inset 0 1px 0 rgba(255,255,255,.5)}
.join button.ready{background:linear-gradient(180deg,#a9d36b,var(--snl-grass-edge));color:#14230a;box-shadow:0 4px 0 #3c5f1f,inset 0 1px 0 rgba(255,255,255,.4);min-height:56px;font-size:var(--snl-text-l)}
.join button.ready.on{background:linear-gradient(180deg,rgba(var(--snl-paper-rgb),.2),rgba(var(--snl-paper-rgb),.1));color:var(--snl-paper);box-shadow:0 3px 0 rgba(0,0,0,.3)}
.join input:not([type=checkbox]),.join select{font-family:inherit;font-weight:700;font-size:var(--snl-text-m);min-height:48px;box-sizing:border-box;padding:0 14px;border-radius:14px;border:2px solid rgba(var(--snl-paper-rgb),.22);background:rgba(0,0,0,.24);color:var(--snl-paper);transition:border-color .15s,background .15s}
.join input:focus,.join select:focus{border-color:var(--snl-accent);background:rgba(0,0,0,.34)}
.join input::placeholder{color:rgba(var(--snl-paper-rgb),.4)}
.join select option{color:#000}
.join input[type=checkbox]{width:22px;height:22px;accent-color:var(--snl-accent);vertical-align:middle;margin-right:8px}
.join .status{text-align:center;min-height:1.4em;margin:0;font-weight:700;color:#ffd27a}
.join .m-logo{margin:6px auto 4px}
.join .field{display:flex;flex-direction:column;gap:10px}
.join #room{text-transform:uppercase;letter-spacing:.5em;text-align:center;font-size:var(--snl-text-xl);font-weight:900;padding-left:.5em}
.join #name{text-align:center}
.join .tagline{text-align:center;margin:0;opacity:.75;font-weight:700}
.lobby-top{display:flex;align-items:center;gap:12px;justify-content:space-between}
.lobby-top .m-mark{width:56px}
.lobby-top .m-logo{flex-direction:row;gap:10px;margin:0}
.lobby-top .m-word{font-size:2rem}
.roompill{display:flex;flex-direction:column;align-items:flex-end;font-weight:900}
.roompill .room{font-size:var(--snl-text-xl);letter-spacing:.3em;padding:2px 12px 2px 18px;border-radius:12px;background:rgba(0,0,0,.28);border:2px dashed rgba(var(--snl-paper-rgb),.35)}
.roompill a{font-size:var(--snl-text-s);color:var(--snl-foam);font-weight:700}
.lobby .tvlink{display:none}
.lobby .row{display:flex;gap:10px;flex-wrap:wrap}
.lobby .roster{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px}
.lobby .roster li{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:14px;background:rgba(0,0,0,.2)}
.lobby .roster .who{display:flex;flex-direction:column;flex:1;min-width:0;line-height:1.15}
.lobby .roster .who b,.lobby .roster .who small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lobby .roster .who small{opacity:.65;font-weight:700}
.lobby .team-glyph{font-weight:900;opacity:.8}
.team-line{display:flex;align-items:center;gap:10px}
.team-line .m-dot{flex:none;width:44px;height:44px;font-size:1.1rem}
.team-line input{flex:1;min-width:0}
.lobby .pick{min-width:48px;min-height:48px;padding:0 12px;border:3px solid rgba(255,255,255,.25);color:#000;font-size:1.3em;text-shadow:0 0 3px #fff}
.lobby .pick[style]{border-radius:50%;padding:0;width:48px;box-shadow:inset 0 -4px 0 rgba(0,0,0,.18),0 2px 4px rgba(0,0,0,.35)}
.lobby .pick:not([style]){color:var(--snl-paper);text-shadow:none;font-size:var(--snl-text-s);min-height:40px;min-width:0;border-width:2px}
.lobby .pick.on{border-color:var(--snl-paper);transform:scale(1.08);box-shadow:0 0 0 3px var(--snl-accent)}
.lobby .pick:not([style]).on{background:var(--snl-accent);color:var(--snl-ink);transform:none;box-shadow:none}
.lobby .pick:disabled{opacity:.2}
.snailnames{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.snailnames label{display:flex;align-items:center;gap:6px;font-weight:900;opacity:1}
.snailnames label span{opacity:.6;min-width:1.2em;text-align:right}
.snailnames input{flex:1;min-width:0;width:100%;min-height:44px}
.card-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.card-actions button{min-height:40px;padding:6px 14px;font-size:var(--snl-text-s)}
.lobby fieldset{border:1.5px solid rgba(var(--snl-paper-rgb),.16);margin:0;min-width:0}
.lobby .settings label,.lobby .more label{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 0;font-weight:700}
.lobby .settings input:not([type=checkbox]){width:6em;min-height:42px;text-align:center}
.lobby .settings select{max-width:60%}
.lobby .cpu-panel .row{margin-bottom:8px}
.lobby .cpu-remove{min-height:36px;padding:4px 12px}
@media (max-width:380px){.snailnames{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.join button{transition:none}}
`;

/** Injects the shared and phone menu styles once. */
export function injectControllerMenuStyles(doc: Document): void {
  injectMenuStyles(doc);
  if (doc.getElementById('snails-controller-menu')) return;
  const style = doc.createElement('style');
  style.id = 'snails-controller-menu';
  style.textContent = CONTROLLER_MENU_CSS;
  doc.head.append(style);
}
