/** Stylesheet for the in-match controls (injected once by `mountControls`). */
export const CONTROLS_CSS = `
.ctl{position:fixed;inset:0;pointer-events:none;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
.ctl *{touch-action:none;-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
.ctl-hud{position:absolute;top:calc(8px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);
  display:flex;gap:12px;align-items:center;background:rgba(var(--snl-ink-rgb),.85);padding:4px 14px;border-radius:999px;color:var(--snl-paper);font-family:var(--snl-font);box-shadow:var(--snl-shadow)}
.ctl-time{font-size:var(--snl-text-l);font-weight:800;min-width:2.2em;text-align:center;font-variant-numeric:tabular-nums}
.ctl-time.warn{color:var(--snl-accent)}
.ctl-own{position:absolute;inset:0;display:none}
.ctl.mine .ctl-own{display:block}
.ctl-own>*{pointer-events:auto}
.ctl-stick{position:absolute;left:calc(16px + env(safe-area-inset-left));bottom:calc(16px + env(safe-area-inset-bottom));
  width:160px;height:160px;border-radius:50%;background:rgba(var(--snl-paper-rgb),.12);border:var(--snl-outline) solid rgba(var(--snl-paper-rgb),.3)}
.ctl-knob{position:absolute;left:50%;top:50%;width:72px;height:72px;margin:-36px 0 0 -36px;border-radius:50%;background:rgba(var(--snl-paper-rgb),.55)}
.ctl-aim{position:absolute;right:0;top:20%;bottom:0;width:50%}
.ctl-aimvis{position:absolute;width:10px;height:10px;margin:-5px;border-radius:50%;background:var(--snl-foam);display:none}
.ctl-btn{position:absolute;min-width:76px;min-height:76px;border-radius:50%;font-size:var(--snl-text-m);font-weight:800;color:var(--snl-paper);background:var(--snl-water);box-shadow:var(--snl-shadow)}
.ctl-jump{left:calc(min(190px,100vw - 194px) + env(safe-area-inset-left));bottom:calc(28px + env(safe-area-inset-bottom))}
.ctl-fire{right:calc(16px + env(safe-area-inset-right));bottom:calc(16px + env(safe-area-inset-bottom));min-width:96px;min-height:96px;background:var(--snl-accent);color:var(--snl-ink)}
.ctl-aimbtn{right:calc(124px + env(safe-area-inset-right));bottom:calc(20px + env(safe-area-inset-bottom));width:84px;height:84px;padding:0;line-height:1.1;background:rgba(var(--snl-ink-rgb),.85);border:var(--snl-outline) solid var(--snl-accent)}
@media (max-width:380px){.ctl-stick{width:140px;height:140px}}
@media (max-width:560px){.ctl-aimbtn{right:calc(20px + env(safe-area-inset-right));bottom:calc(206px + env(safe-area-inset-bottom))}}
.ctl-aimbtn.on{background:var(--snl-accent);color:var(--snl-ink)}
.ctl-aimbtn.hint{animation:ctl-pulse 1.6s ease-out infinite}
@keyframes ctl-pulse{0%{box-shadow:0 0 0 0 rgba(var(--snl-paper-rgb),.7)}100%{box-shadow:0 0 0 18px rgba(var(--snl-paper-rgb),0)}}
@media (prefers-reduced-motion:reduce){.ctl-aimbtn.hint{animation:none}}
.ctl-tilewrap{position:relative;display:flex}
.ctl-tilewrap>.ctl-tile{flex:1}
.ctl-fire.charging{transform:scale(1.08);box-shadow:0 0 0 6px rgba(var(--snl-paper-rgb),.5)}
.ctl-fire{touch-action:none}
.ctl-gauge{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(132px + env(safe-area-inset-bottom));width:min(62vw,380px);height:44px;
  border-radius:999px;background:rgba(var(--snl-ink-rgb),.85);border:var(--snl-outline) solid var(--snl-paper);overflow:hidden;pointer-events:none;display:none}
.ctl-gauge.on,.ctl-gauge.hint{display:block}
.ctl-gauge-fill{position:absolute;inset:0 auto 0 0;width:0;background:linear-gradient(90deg,var(--snl-foam),var(--snl-accent))}
.ctl-gauge-pct{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:var(--snl-text-l);color:var(--snl-paper);text-shadow:0 1px 3px #000}
.ctl-gauge-hint{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-weight:700;font-size:var(--snl-text-s);color:var(--snl-paper);background:rgba(var(--snl-ink-rgb),.95)}
.ctl-gauge.hint:not(.on) .ctl-gauge-hint{display:flex}
.ctl-gauge.hint:not(.on) .ctl-gauge-pct{display:none}
.ctl-wbtn{right:calc(16px + env(safe-area-inset-right));bottom:calc(128px + env(safe-area-inset-bottom));min-width:64px;min-height:64px;background:rgba(var(--snl-paper-rgb),.16)}
.ctl-sheet{position:absolute;left:0;right:0;bottom:0;display:none;pointer-events:auto;background:rgba(var(--snl-ink-rgb),.96);
  padding:12px 12px calc(12px + env(safe-area-inset-bottom));border-radius:var(--snl-radius) var(--snl-radius) 0 0}
.ctl-sheet.open{display:block}
.ctl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
.ctl-tile{min-height:88px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  background:rgba(var(--snl-paper-rgb),.1);color:var(--snl-paper);border:var(--snl-outline) solid transparent;border-radius:var(--snl-radius);font-family:inherit;font-size:var(--snl-text-s);font-weight:700}
.ctl-tile.sel{border-color:var(--snl-accent)}
.ctl-tile:disabled{opacity:.4}
.ctl-icon{font-size:var(--snl-text-l);font-weight:800}
`;
