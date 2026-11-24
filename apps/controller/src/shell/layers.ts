/** Stacking order of the in-match UI layers (each layer is its own stacking context). */
export const Z = { view: 0, hud: 10, controls: 20, banners: 30, modal: 40 } as const;

/** Layer names, bottom to top (the `view` layer is the WebGL canvas container, not mounted here). */
export type LayerName = 'hud' | 'controls' | 'banners' | 'modal';

/** DOM id of the left column slot (minimap, team bars, own snail health). */
export const SLOT_LEFT = 'shell-left';
/** DOM id of the single top-right button column (camera mode, mute, battery saver). */
export const SLOT_RIGHT = 'shell-right';
/** DOM id of the top bar slot (turn banner and countdown). */
export const SLOT_TOP = 'shell-top';
/** CSS class shared by all compact in-match buttons. */
export const BTN_CLASS = 'shell-btn';

/** Height reserved for the top bar before the side columns start. */
const TOP = 'calc(env(safe-area-inset-top) + 64px)';
const SIDE_L = 'calc(env(safe-area-inset-left) + 8px)';
const SIDE_R = 'calc(env(safe-area-inset-right) + 8px)';

/**
 * Layout stylesheet for the shell: one top bar, a left column below it, one right button column.
 * Short (landscape) viewports shrink the minimap and controls and hide the extras.
 */
export const SHELL_CSS = `
.shell-layer{position:fixed;inset:0;pointer-events:none;font-family:var(--snl-font);color:var(--snl-paper)}
#${SLOT_TOP}{position:absolute;top:calc(env(safe-area-inset-top) + 8px);left:${SIDE_L};right:${SIDE_R};
  display:flex;justify-content:center;align-items:center;gap:8px}
#${SLOT_TOP} .ctl-hud,#${SLOT_TOP} .spec-banner{position:static;transform:none;margin:0}
#${SLOT_LEFT}{position:absolute;top:${TOP};left:${SIDE_L};width:112px;display:flex;flex-direction:column;gap:6px}
#${SLOT_LEFT} canvas{max-width:100%}
#${SLOT_RIGHT}{position:absolute;top:${TOP};right:${SIDE_R};display:flex;flex-direction:column;gap:6px;align-items:flex-end}
#${SLOT_RIGHT}>*,#${SLOT_LEFT}>*{pointer-events:auto}
.${BTN_CLASS}{min-height:44px;min-width:44px;padding:6px 12px;border:0;border-radius:var(--snl-radius);font-family:inherit;font-size:var(--snl-text-s);font-weight:700;
  background:rgba(var(--snl-ink-rgb),.85);color:var(--snl-paper);-webkit-touch-callout:none;touch-action:manipulation}
@media (max-height:480px){
  #${SLOT_LEFT} canvas{width:88px!important;height:88px!important}
  .spec-hp{display:none!important}
  .ctl-stick{width:120px!important;height:120px!important}
  .ctl-knob{width:56px!important;height:56px!important;margin:-28px 0 0 -28px!important}
  .ctl-jump{left:calc(150px + env(safe-area-inset-left))!important}
}`;
