import * as THREE from 'three';
import type { SimEvent } from '@snails/core';
import type { FrameUpdater } from '../render-loop.js';
import { PALETTE } from '../style/palette.js';
import {
  aliveCount,
  createParticleData,
  spawnBurst,
  stepParticles,
  type ParticleData,
  type ParticlePhysics,
} from './particles.js';
import { createSoftSpriteTexture } from './soft-sprite.js';

/** Particles per snail in one unlock burst at quality 1. */
export const UNLOCK_PARTICLES = 28;
const PHYSICS: ParticlePhysics = { gravity: 1.5, drag: 1.2 };

/** Resolves the world positions of a team's living snails. */
export type TeamPositions = (teamId: string) => readonly THREE.Vector3[];

/**
 * Tech-unlock VFX: a pooled additive sparkle burst on each living snail of the team that just
 * completed a tech (`researchCompleted`). Camera-neutral: it only adds particles.
 */
export class TechUnlockBurst {
  /** Attach to the effects root. */
  readonly group = new THREE.Group();
  /** Loop-compatible updater. */
  readonly updater: FrameUpdater;
  private readonly data: ParticleData;
  private readonly points: THREE.Points;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly colAttr: THREE.BufferAttribute;
  private readonly sprite = createSoftSpriteTexture(32);
  private readonly perSnail: number;

  /** `quality` is the tier's particle scale; `random` is injectable for tests. */
  constructor(
    private readonly positions: TeamPositions,
    quality = 1,
    private readonly random: () => number = Math.random,
  ) {
    const q = Math.max(0.1, quality);
    this.perSnail = Math.max(6, Math.floor(UNLOCK_PARTICLES * q));
    this.data = createParticleData(this.perSnail * 8);
    this.posAttr = new THREE.BufferAttribute(this.data.positions, 3);
    this.colAttr = new THREE.BufferAttribute(this.data.colours, 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.3,
        vertexColors: true,
        transparent: true,
        map: this.sprite,
        alphaTest: 0.02,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    this.group.name = 'tech-unlock';
    this.group.add(this.points);
    this.updater = (dt) => this.update(dt);
  }

  /** Bursts on every living snail of the team of each `researchCompleted` event. */
  handleEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type !== 'researchCompleted') continue;
      for (const p of this.positions(e.teamId)) {
        spawnBurst(
          this.data,
          {
            x: p.x,
            y: p.y + 0.3,
            z: p.z,
            count: this.perSnail,
            speedMin: 1.5,
            speedMax: 4,
            lifeMin: 0.7,
            lifeMax: 1.3,
            colour: this.random() < 0.5 ? PALETTE.uiAccent : PALETTE.uiPaper,
            upBias: 0.6,
          },
          this.random,
        );
      }
    }
  }

  private update(dt: number): void {
    stepParticles(this.data, dt, PHYSICS);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }

  /** Number of live particles. */
  get live(): number {
    return aliveCount(this.data);
  }

  /** Frees GPU resources. */
  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.sprite.dispose();
    this.group.removeFromParent();
  }
}
