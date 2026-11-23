import type { ControllerClient } from '../net/client';
import { CONTROLS_CSS } from './controls.css';
import { bindAim, bindJoystick } from './gestures';
import type { Gestures } from './gestures';
import { trackTurns } from './turn-tracker';
import type { TurnTracker } from './turn-tracker';
import { formatTimer, isWarning, remainingAt } from './turn-timer';
import { SLOT_TOP } from '../shell/layers';
import { buildWeaponTiles } from './weapon-list';
import type { WeaponLike } from './weapon-list';

/** Options for `mountControls`. */
export interface ControlsOptions {
  /** Own player id from the welcome message. */
  playerId: string | null;
  /** Weapons offered by the picker. */
  weapons: readonly WeaponLike[];
  /** +1 if the active snail faces screen-right, -1 if screen-left (default +1). */
  facingSign?: () => 1 | -1;
  /** Called with true when an aim drag starts and false when it ends or is released. */
  onAimingChange?: (aiming: boolean) => void;
}

const OWN_HTML = `
  <div class="ctl-stick"><div class="ctl-knob"></div></div>
  <div class="ctl-aim"><div class="ctl-aimvis"></div></div>
  <button type="button" class="ctl-btn ctl-jump">Jump</button>
  <button type="button" class="ctl-btn ctl-wbtn">Arms</button>
  <button type="button" class="ctl-btn ctl-fire">Fire</button>
  <div class="ctl-sheet"><div class="ctl-grid"></div></div>`;

function q<T extends HTMLElement>(root: HTMLElement, sel: string): T {
  return root.querySelector<T>(sel) as T;
}

/** Renders the weapon tiles into the sheet grid. */
function renderTiles(
  grid: HTMLElement,
  weapons: readonly WeaponLike[],
  selected: string | null,
  myTurn: boolean,
  pick: (id: string) => void,
): void {
  grid.replaceChildren();
  for (const t of buildWeaponTiles(weapons, selected, myTurn)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ctl-tile${t.selected ? ' sel' : ''}`;
    b.disabled = t.disabled;
    b.innerHTML = `<span class="ctl-icon"></span><span class="n"></span><span class="a"></span>`;
    q(b, '.ctl-icon').textContent = t.icon;
    q(b, '.n').textContent = t.name;
    q(b, '.a').textContent = t.ammoLabel;
    b.addEventListener('click', () => pick(t.id));
    grid.appendChild(b);
  }
}

/** Updates the HUD (timer + whose turn) and the own-turn visibility from the tracker. */
function updateHud(root: HTMLElement, hud: HTMLElement, tracker: TurnTracker): void {
  const v = tracker.view;
  root.classList.toggle('mine', v.myTurn);
  const ms = v.timer ? remainingAt(v.timer, Date.now()) : 0;
  hud.style.display = v.timer ? '' : 'none';
  const t = q(hud, '.ctl-time');
  t.textContent = v.timer ? formatTimer(ms) : '--';
  t.classList.toggle('warn', v.timer !== null && isWarning(ms));
}

/** Wires buttons plus blur/visibility release; returns a disposer that also releases and disposes gestures. */
function wireButtons(
  root: HTMLElement,
  client: ControllerClient,
  sheet: HTMLElement,
  gestures: Gestures[],
): () => void {
  q(root, '.ctl-jump').addEventListener('click', () => client.send({ type: 'jump' }));
  q(root, '.ctl-fire').addEventListener('click', () => client.send({ type: 'fire' }));
  q(root, '.ctl-wbtn').addEventListener('click', () => sheet.classList.toggle('open'));
  const release = (): void => gestures.forEach((g) => g.release());
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') release();
  };
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    release();
    gestures.forEach((g) => g.dispose());
    window.removeEventListener('blur', release);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/**
 * Mounts the in-match controls (HUD timer for everyone; joystick, aim, jump, fire and weapon
 * picker on my turn only). Returns a disposer.
 */
export function mountControls(
  parent: HTMLElement,
  client: ControllerClient,
  opts: ControlsOptions,
): () => void {
  const style = document.createElement('style');
  style.textContent = CONTROLS_CSS;
  const root = document.createElement('div');
  root.className = 'ctl';
  root.innerHTML = `<div class="ctl-hud"><span class="ctl-time">--</span></div>
    <div class="ctl-own">${OWN_HTML}</div>`;
  parent.append(style, root);
  // Single top bar: the countdown joins the turn banner when the shell provides the slot.
  const hud = q(root, '.ctl-hud');
  document.getElementById(SLOT_TOP)?.append(hud);

  const tracker = trackTurns(client, opts.playerId);
  const sheet = q(root, '.ctl-sheet');
  let selected: string | null = opts.weapons[0]?.id ?? null;
  const rebuild = (): void =>
    renderTiles(q(root, '.ctl-grid'), opts.weapons, selected, tracker.view.myTurn, (id) => {
      selected = id;
      client.send({ type: 'selectWeapon', weaponId: id });
      sheet.classList.remove('open');
      rebuild();
    });

  const facingSign = opts.facingSign ?? (() => 1);
  const stick = bindJoystick(q(root, '.ctl-stick'), q(root, '.ctl-knob'), client, facingSign);
  const aim = bindAim(
    q(root, '.ctl-aim'),
    q(root, '.ctl-aimvis'),
    client,
    facingSign,
    opts.onAimingChange,
  );
  const gestures = [stick, aim];
  const release = (): void => gestures.forEach((g) => g.release());
  const wired = wireButtons(root, client, sheet, gestures);

  const tick = setInterval(() => updateHud(root, hud, tracker), 250);
  const off = tracker.onChange(() => {
    if (!tracker.view.myTurn) {
      release();
      sheet.classList.remove('open');
    }
    updateHud(root, hud, tracker);
    rebuild();
  });
  updateHud(root, hud, tracker);
  rebuild();

  return () => {
    clearInterval(tick);
    off();
    tracker.dispose();
    wired();
    hud.remove();
    root.remove();
    style.remove();
  };
}
