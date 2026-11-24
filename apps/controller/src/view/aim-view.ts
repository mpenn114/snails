import { createAimHint, createAimReticle } from '@snails/render';
import type { AimHint, AimReticle, MatchRenderer } from '@snails/render';
import type { GameSnapshot, WeaponDefinition } from '@snails/core';
import type { AimStore } from '../controls/aim-store';
import { aimHintInput, resolveAim } from './aim-input';
import { DEFAULT_AIM_CAMERA } from './camera-math';

/** Inputs of the 3D aim view. */
export interface AimViewDeps {
  renderer: MatchRenderer;
  store: AimStore;
  /** Weapon lookup by id (the base pack). */
  weapon: (id: string) => WeaponDefinition | undefined;
}

/**
 * The 3D half of the aim view on the phone: an initial-trajectory arc with a landing target
 * (the display's aim hint, driven locally from the selected weapon so drill, melee and missile
 * preview like they fly) plus a crosshair at the aimed direction. Visible only while the local
 * player's aim mode is on. Pure view: it reads the store and snapshots and owns no rules.
 */
export class AimView {
  private readonly hint: AimHint;
  private readonly reticle: AimReticle;
  private readonly removeLayers: (() => void)[] = [];
  private readonly off: () => void;
  private snapshot: GameSnapshot | null = null;

  constructor(private readonly deps: AimViewDeps) {
    const { renderer } = deps;
    this.hint = createAimHint({
      samples: 22,
      seeThrough: true,
      isSolid: (p) => renderer.terrainReplica?.grid.isSolid(p) ?? false,
    });
    this.reticle = createAimReticle({
      getCamera: () => renderer.view?.camera ?? null,
      range: 16,
      eyeHeight: DEFAULT_AIM_CAMERA.eyeHeight,
      eyeBack: DEFAULT_AIM_CAMERA.eyeBack,
    });
    this.removeLayers.push(
      renderer.addLayer(this.hint.layer),
      renderer.addLayer(this.reticle.layer),
    );
    this.off = deps.store.subscribe(() => this.refresh());
  }

  /** A mapped snapshot arrived (names the active snail and carries its server-side aim). */
  onSnapshot(snapshot: GameSnapshot): void {
    this.snapshot = snapshot;
    this.refresh();
  }

  /** Releases the layers and the subscription. */
  dispose(): void {
    this.off();
    for (const remove of this.removeLayers) remove();
    this.hint.dispose();
    this.reticle.dispose();
  }

  private refresh(): void {
    const { store, weapon } = this.deps;
    const s = store.state;
    const id = this.snapshot?.turn.activeSnailId ?? null;
    const snail = this.snapshot?.teams.flatMap((t) => t.snails).find((n) => n.id === id);
    if (!s.myTurn || !s.aimMode || !id || !snail || !s.weaponId) return this.hide();
    const aim = resolveAim(s.aim, snail.aim);
    const input = aimHintInput(id, weapon(s.weaponId), aim);
    this.hint.set(input);
    this.reticle.set(input ? { snailId: id, angle: aim.angle } : null);
  }

  private hide(): void {
    this.hint.set(null);
    this.reticle.set(null);
  }
}
