import { injectMenuStyles } from '@snails/render';

/** TV lobby and help-panel styles; build on the shared `m-*` classes from `@snails/render`. */
export const DISPLAY_MENU_CSS = `
.lobby{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;box-sizing:border-box;padding:3vh 3vw 5vh}
.lobby[hidden]{display:none}
.lobby-card{position:relative;z-index:1;display:flex;gap:3vw;align-items:stretch;width:100%;max-width:94vw;max-height:100%}
.lobby .join-side{flex:0 0 31vw;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.6vh;text-align:center}
.lobby .join-side .m-mark{width:9vw;max-width:150px}
.lobby .join-side .m-word{font-size:6vw}
.lobby .join-side .m-tag{font-size:1.5vw}
.lobby .join-side .label{margin:0;font-size:1.4vw;font-weight:900;letter-spacing:.2em;text-transform:uppercase;opacity:.75}
.lobby .code{font-size:8vw;font-weight:900;letter-spacing:.14em;line-height:1;border-radius:1.4vw;background:rgba(0,0,0,.3);border:.3vw dashed rgba(var(--snl-paper-rgb),.4);padding:.4vw 1.6vw .4vw 1.8vw;color:var(--snl-paper)}
.lobby .qr{background:#fff;border-radius:1.4vw;padding:1vw;box-shadow:0 .6vw 2vw rgba(0,0,0,.4);line-height:0}
.lobby .qr svg{width:17vw;height:17vw;max-height:34vh;max-width:34vh}
.lobby .url{margin:0;font-size:1.3vw;opacity:.75;font-weight:700;word-break:break-all}
.lobby .roster-side{flex:1;min-width:0;display:flex;flex-direction:column;gap:1.8vh;justify-content:center}
.lobby .roster-side h2{margin:0;font-size:2.6vw;font-weight:900;display:flex;align-items:center;gap:1.2vw}
.lobby .roster-side h2 .count{font-size:1.5vw;padding:.3vw 1.2vw;border-radius:999px;background:#7bd88f;color:#10321a}
.lobby .teams{display:grid;grid-template-columns:repeat(auto-fill,minmax(20vw,1fr));gap:1.2vw}
.lobby .team{border-left:.7vw solid var(--tc,#888);padding:1vw 1.2vw;display:flex;flex-direction:column;gap:.5vw;animation:lobby-pop .35s ease-out both}
@keyframes lobby-pop{from{opacity:0;transform:translateY(1.5vh) scale(.96)}}
.lobby .team-head{display:flex;align-items:center;gap:.8vw;font-size:2vw;font-weight:900;line-height:1.1}
.lobby .team-head .m-dot{flex:none;width:2.6vw;height:2.6vw;font-size:1.4vw}
.lobby .team-name{overflow-wrap:anywhere;flex:1;min-width:0}
.lobby .who{font-size:1.25vw;font-weight:700;opacity:.7}
.lobby .state{font-size:1vw;font-weight:900;letter-spacing:.08em;text-transform:uppercase;padding:.2vw .8vw;border-radius:999px;background:rgba(var(--snl-paper-rgb),.14)}
.lobby .state.ready{background:#7bd88f;color:#10321a}
.lobby .state.offline{opacity:.5}
.lobby .snails{display:flex;flex-wrap:wrap;gap:.4vw;margin:0;padding:0;list-style:none}
.lobby .snails li{font-size:1.1vw;font-weight:700;padding:.15vw .8vw;border-radius:999px;background:rgba(0,0,0,.25)}
.lobby .empty{font-size:1.8vw;opacity:.8;font-weight:700}
.lobby .chips{display:flex;flex-wrap:wrap;gap:.6vw;margin:0;padding:0;list-style:none;font-size:1.2vw}
.lobby .chips li{padding:.3vw 1vw;background:rgba(var(--snl-paper-rgb),.1);border:1.5px solid rgba(var(--snl-paper-rgb),.14);border-radius:999px}
.lobby .chips span{opacity:.6}
.lobby .howto{margin:0;font-size:1.3vw;opacity:.8;font-weight:700}
.team-glyph{margin-right:.3em;font-weight:900}
.help-btn{position:fixed;right:1.2vw;bottom:2.6vh;z-index:20;font-family:var(--snl-font);font-weight:800;font-size:1.2vw;padding:.6vw 1.4vw;border:0;border-radius:999px;color:var(--snl-paper);cursor:pointer;background:rgba(0,0,0,.45);box-shadow:0 .2vw 0 rgba(0,0,0,.3);transition:filter .15s,transform .08s}
.help-btn:hover{filter:brightness(1.3)}
.help-btn:active{transform:translateY(2px)}
.help-btn[hidden],.help-panel[hidden]{display:none}
.help-panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:30;width:min(560px,90vw);max-height:90vh;overflow:auto;box-sizing:border-box;padding:22px 26px;border-radius:20px;
  background:linear-gradient(180deg,#3a2f52,#2b2438);color:var(--snl-paper);font-family:var(--snl-font);border:1.5px solid rgba(var(--snl-paper-rgb),.2);box-shadow:0 12px 50px rgba(0,0,0,.65)}
.help-panel h2{margin:0 0 10px;font-size:1.5rem;font-weight:900;color:var(--snl-accent)}
.help-panel p{margin:.5em 0;line-height:1.4}
.help-panel .url{font-weight:800;color:var(--snl-foam);word-break:break-all}
.help-panel .qr{background:#fff;border-radius:14px;padding:10px;width:fit-content;line-height:0;margin:10px 0}
.help-panel .qr svg{width:180px;height:180px}
.help-panel .help-close{font-family:inherit;font-weight:800;font-size:1rem;margin-top:10px;padding:10px 28px;border:0;border-radius:999px;cursor:pointer;color:var(--snl-ink);background:linear-gradient(180deg,#ffb066,var(--snl-accent));box-shadow:0 4px 0 #b4561a}
.help-panel .help-close:active{transform:translateY(3px);box-shadow:none}
@media (prefers-reduced-motion:reduce){.lobby .team{animation:none}}
`;

/** Injects the shared and TV menu styles once. */
export function injectDisplayMenuStyles(doc: Document): void {
  injectMenuStyles(doc);
  if (doc.getElementById('snails-display-menu')) return;
  const style = doc.createElement('style');
  style.id = 'snails-display-menu';
  style.textContent = DISPLAY_MENU_CSS;
  doc.head.append(style);
}
