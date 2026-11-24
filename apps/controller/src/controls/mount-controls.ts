import type { ControllerClient } from '../net/client';
import { CONTROLS_CSS } from './controls.css';
import { DEFAULT_SCREEN_FACING } from './aim-mapping';
import type { ScreenFacing } from './aim-mapping';
import { bindAim, bindJoystick } from './gestures';
import type { Gestures } from './gestures';
import { trackInventory } from './inventory-tracker';
import { trackSteering } from './steering';
import { trackTurns } from './turn-tracker';
import type { TurnTracker } from './turn-tracker';
import { formatTimer, isWarning, remainingAt } from './turn-timer';
import { SLOT_TOP } from '../shell/layers';
import { buildWeaponTiles, defaultWeaponId, fireLabel, resolveSelection } from './weapon-list';
import type { InventoryView, WeaponLike } from './weapon-list';

/** Options for `mountControls`. */
export interface ControlsOptions {
  /** Own player id from the welcome message. */
  playerId: string | null;
  /** Weapons offered by the picker. */
  weapons: readonly WeaponLike[];
  /** On-screen facing of the active snail (default: side view, facing right). */
  screenFacing?: () => ScreenFacing;
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
  inv: InventoryView | null,
  pick: (id: string) => void,
): void {
  grid.replaceChildren();
  for (const t of buildWeaponTiles(weapons, selected, myTurn, inv)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ctl-tile${t.selected ? ' sel' : ''}`;
    b.disabled = t.disabled;
    b.innerHTML = `<span class="ctl-icon"></span><span class="n"></span><span class="a"></span>`;
    q(b, '.ctl-icon').textContent = t.icon;
    q(b, '.n').textContent = t.name;
    q(b, '.a').textContent = t.ammoLabel;
    b.title = t.reason;
    if (t.block) b.dataset.block = t.block;
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

/** Binds the joystick (move, or steer while a guided missile flies) and the aim zone. */
function bindGestures(
  root: HTMLElement,
  client: ControllerClient,
  opts: ControlsOptions,
  facing: () => ScreenFacing,
  isSteering: () => boolean,
): Gestures[] {
  const stick = bindJoystick(
    q(root, '.ctl-stick'),
    q(root, '.ctl-knob'),
    client,
    facing,
    isSteering,
  );
  const aim = bindAim(
    q(root, '.ctl-aim'),
    q(root, '.ctl-aimvis'),
    client,
    facing,
    opts.onAimingChange,
  );
  return [stick, aim];
}

/**
 * Resolves the selected weapon against the inventory. When stock hit zero (or a lock applies)
 * the selection falls back to the default weapon and, on my turn, the server is told.
 */
function syncSelection(
  client: ControllerClient,
  weapons: readonly WeaponLike[],
  selected: string | null,
  inv: InventoryView | null,
  myTurn: boolean,
): string | null {
  const resolved = resolveSelection(weapons, selected, inv);
  if (resolved !== selected && selected !== null && myTurn && resolved !== null) {
    client.send({ type: 'selectWeapon', weaponId: resolved });
  }
  return resolved;
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
  let selected: string | null = defaultWeaponId(opts.weapons, null);
  const fireBtn = q(root, '.ctl-fire');
  const inventory = trackInventory(client);
  const rebuild = (): void => {
    const inv = inventory.of(tracker.view.myTeamId);
    selected = syncSelection(client, opts.weapons, selected, inv, tracker.view.myTurn);
    fireBtn.textContent = fireLabel(opts.weapons.find((w) => w.id === selected));
    renderTiles(q(root, '.ctl-grid'), opts.weapons, selected, tracker.view.myTurn, inv, (id) => {
      selected = id;
      client.send({ type: 'selectWeapon', weaponId: id });
      sheet.classList.remove('open');
      rebuild();
    });
  };
  inventory.onChange(rebuild);

  const facing = opts.screenFacing ?? (() => DEFAULT_SCREEN_FACING);
  const steering = trackSteering(client, opts.weapons);
  const gestures = bindGestures(root, client, opts, facing, steering.active);
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
    steering.dispose();
    inventory.dispose();
    off();
    tracker.dispose();
    wired();
    hud.remove();
    root.remove();
    style.remove();
  };
}
