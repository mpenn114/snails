import type { ControllerClient } from '../net/client';
import { CONTROLS_CSS } from './controls.css';
import { DEFAULT_SCREEN_FACING } from './aim-mapping';
import type { ScreenFacing } from './aim-mapping';
import { wireAimButton } from './aim-button';
import type { AimStore } from './aim-store';
import { bindAim, bindJoystick } from './gestures';
import type { Gestures } from './gestures';
import { trackInventory } from './inventory-tracker';
import { trackSteering } from './steering';
import { trackTurns } from './turn-tracker';
import type { TurnTracker } from './turn-tracker';
import { formatTimer, isWarning, remainingAt } from './turn-timer';
import { SLOT_TOP } from '../shell/layers';
import {
  buildWeaponTiles,
  defaultWeaponId,
  fireLabel,
  needsCharge,
  resolveSelection,
} from './weapon-list';
import type { InventoryView, WeaponLike } from './weapon-list';
import { createInfoButton, showInfoPopover } from './info-popover';
import { weaponInfo } from './weapon-info';
import { aimSource, trackServerAim, wireFireButton } from './fire-button';

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
  /** Display name of a technology id (weapon info shows what unlocks a weapon). */
  techName?: (id: string) => string;
  /** Shared aim state: the Aim button, aim drags and weapon picks write it for the 3D aim view. */
  aimStore?: AimStore;
}

const OWN_HTML = `
  <div class="ctl-stick"><div class="ctl-knob"></div></div>
  <div class="ctl-aim"><div class="ctl-aimvis"></div></div>
  <button type="button" class="ctl-btn ctl-jump">Jump</button>
  <button type="button" class="ctl-btn ctl-wbtn">Arms</button>
  <button type="button" class="ctl-btn ctl-aimbtn">Aim</button>
  <div class="ctl-gauge" role="progressbar" aria-label="Shot power" aria-valuemin="0" aria-valuemax="100">
    <div class="ctl-gauge-fill"></div><span class="ctl-gauge-pct">0%</span>
    <span class="ctl-gauge-hint">Hold Fire to charge, release to shoot</span></div>
  <button type="button" class="ctl-btn ctl-fire" aria-label="Fire: hold to charge power, release to shoot">Fire</button>
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
  techName?: (id: string) => string,
): void {
  grid.replaceChildren();
  for (const t of buildWeaponTiles(weapons, selected, myTurn, inv)) {
    const wrap = document.createElement('div');
    wrap.className = 'ctl-tilewrap';
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
    const w = weapons.find((x) => x.id === t.id);
    wrap.append(b);
    if (w) {
      wrap.append(createInfoButton(t.name, () => showInfoPopover(weaponInfo(w, techName))));
    }
    grid.appendChild(wrap);
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
  power: () => number,
): Gestures[] {
  const stick = bindJoystick(
    q(root, '.ctl-stick'),
    q(root, '.ctl-knob'),
    client,
    facing,
    isSteering,
  );
  const store = opts.aimStore;
  const aim = bindAim(
    q(root, '.ctl-aim'),
    q(root, '.ctl-aimvis'),
    client,
    facing,
    (aiming) => {
      // Starting an aim drag opens the aim view; it stays after release until the Aim button.
      if (aiming) store?.setAimMode(true);
      opts.onAimingChange?.(aiming);
    },
    (a) => store?.setAim(a.angle, a.power),
    power,
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

/** Creates the stylesheet and control tree; the countdown joins the top bar slot when present. */
function buildRoot(parent: HTMLElement): {
  style: HTMLStyleElement;
  root: HTMLElement;
  hud: HTMLElement;
} {
  const style = document.createElement('style');
  style.textContent = CONTROLS_CSS;
  const root = document.createElement('div');
  root.className = 'ctl';
  root.innerHTML = `<div class="ctl-hud"><span class="ctl-time">--</span></div>
    <div class="ctl-own">${OWN_HTML}</div>`;
  parent.append(style, root);
  const hud = q(root, '.ctl-hud');
  document.getElementById(SLOT_TOP)?.append(hud);
  return { style, root, hud };
}

/** The weapon picker: selection state plus the rebuild that syncs tiles, fire label and store. */
function createPicker(
  root: HTMLElement,
  client: ControllerClient,
  opts: ControlsOptions,
  tracker: TurnTracker,
  inventory: ReturnType<typeof trackInventory>,
  sheet: HTMLElement,
): { rebuild(): void; selected(): string | null } {
  let selected: string | null = defaultWeaponId(opts.weapons, null);
  const fireBtn = q(root, '.ctl-fire');
  const rebuild = (): void => {
    const inv = inventory.of(tracker.view.myTeamId);
    selected = syncSelection(client, opts.weapons, selected, inv, tracker.view.myTurn);
    opts.aimStore?.setWeapon(selected);
    fireBtn.textContent = fireLabel(opts.weapons.find((w) => w.id === selected));
    renderTiles(
      q(root, '.ctl-grid'),
      opts.weapons,
      selected,
      tracker.view.myTurn,
      inv,
      (id) => {
        selected = id;
        client.send({ type: 'selectWeapon', weaponId: id });
        sheet.classList.remove('open');
        rebuild();
      },
      opts.techName,
    );
  };
  return { rebuild, selected: () => selected };
}

/** Binds the joystick and aim drag plus the press-and-hold Fire button with its power gauge. */
function wireAimAndFire(
  root: HTMLElement,
  client: ControllerClient,
  opts: ControlsOptions,
  facing: () => ScreenFacing,
  isSteering: () => boolean,
  needsPower: () => boolean,
): { gestures: Gestures[]; fire: { cancel(): void }; dispose(): void } {
  const serverAim = trackServerAim(client);
  const aim = aimSource(opts.aimStore, serverAim);
  const gestures = bindGestures(root, client, opts, facing, isSteering, aim.power);
  const fire = wireFireButton({
    button: q(root, '.ctl-fire'),
    gauge: q(root, '.ctl-gauge'),
    client,
    aim,
    store: opts.aimStore,
    needsCharge: needsPower,
  });
  return {
    gestures,
    fire,
    dispose: () => {
      fire.dispose();
      serverAim.dispose();
    },
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
  const { style, root, hud } = buildRoot(parent);
  const tracker = trackTurns(client, opts.playerId);
  const sheet = q(root, '.ctl-sheet');
  const inventory = trackInventory(client);
  const picker = createPicker(root, client, opts, tracker, inventory, sheet);
  const rebuild = picker.rebuild;
  inventory.onChange(rebuild);

  const facing = opts.screenFacing ?? (() => DEFAULT_SCREEN_FACING);
  const steering = trackSteering(client, opts.weapons);
  const aimWiring = wireAimAndFire(root, client, opts, facing, steering.active, () =>
    needsCharge(opts.weapons.find((w) => w.id === picker.selected())),
  );
  const { gestures } = aimWiring;
  const release = (): void => {
    gestures.forEach((g) => g.release());
    aimWiring.fire.cancel();
  };
  const wired = wireButtons(root, client, sheet, gestures);

  const offAimButton = opts.aimStore ? wireAimButton(q(root, '.ctl-aimbtn'), opts.aimStore) : null;
  const tick = setInterval(() => updateHud(root, hud, tracker), 250);
  const off = tracker.onChange(() => {
    opts.aimStore?.setMyTurn(tracker.view.myTurn);
    if (!tracker.view.myTurn) {
      release();
      sheet.classList.remove('open');
    }
    updateHud(root, hud, tracker);
    rebuild();
  });
  opts.aimStore?.setMyTurn(tracker.view.myTurn);
  updateHud(root, hud, tracker);
  rebuild();

  return () => {
    offAimButton?.();
    clearInterval(tick);
    steering.dispose();
    aimWiring.dispose();
    inventory.dispose();
    off();
    tracker.dispose();
    wired();
    hud.remove();
    root.remove();
    style.remove();
  };
}
