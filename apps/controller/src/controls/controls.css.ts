/** Stylesheet for the in-match controls (injected once by `mountControls`). */
export const CONTROLS_CSS = `
.ctl{position:fixed;inset:0;pointer-events:none;touch-action:none;user-select:none;-webkit-user-select:none;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
.ctl *{touch-action:none;-webkit-tap-highlight-color:transparent}
.ctl-hud{position:absolute;top:calc(8px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);
  display:flex;gap:12px;align-items:center;background:rgba(16,24,32,.75);padding:6px 14px;border-radius:999px}
.ctl-time{font-size:1.6rem;font-weight:700;min-width:2.2em;text-align:center;font-variant-numeric:tabular-nums}
.ctl-time.warn{color:#ff5a4d}
.ctl-own{position:absolute;inset:0;display:none}
.ctl.mine .ctl-own{display:block}
.ctl-own>*{pointer-events:auto}
.ctl-stick{position:absolute;left:calc(16px + env(safe-area-inset-left));bottom:calc(16px + env(safe-area-inset-bottom));
  width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.3)}
.ctl-knob{position:absolute;left:50%;top:50%;width:72px;height:72px;margin:-36px 0 0 -36px;border-radius:50%;background:rgba(255,255,255,.55)}
.ctl-aim{position:absolute;right:0;top:20%;bottom:0;width:50%}
.ctl-aimvis{position:absolute;width:10px;height:10px;margin:-5px;border-radius:50%;background:#ffd24d;display:none}
.ctl-btn{position:absolute;min-width:76px;min-height:76px;border-radius:50%;font-size:1.1rem;font-weight:700;color:#fff;background:#2f6f4f}
.ctl-jump{left:calc(190px + env(safe-area-inset-left));bottom:calc(28px + env(safe-area-inset-bottom))}
.ctl-fire{right:calc(16px + env(safe-area-inset-right));bottom:calc(16px + env(safe-area-inset-bottom));min-width:96px;min-height:96px;background:#b8322a}
.ctl-wbtn{right:calc(16px + env(safe-area-inset-right));bottom:calc(128px + env(safe-area-inset-bottom));min-width:64px;min-height:64px;background:#34506b}
.ctl-sheet{position:absolute;left:0;right:0;bottom:0;display:none;pointer-events:auto;background:rgba(16,24,32,.96);
  padding:12px 12px calc(12px + env(safe-area-inset-bottom));border-radius:16px 16px 0 0}
.ctl-sheet.open{display:block}
.ctl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
.ctl-tile{min-height:88px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  background:#1f2f3f;color:#fff;border:2px solid transparent;border-radius:12px;font-size:.9rem}
.ctl-tile.sel{border-color:#ffd24d}
.ctl-tile:disabled{opacity:.4}
.ctl-icon{font-size:1.6rem;font-weight:700}
`;
