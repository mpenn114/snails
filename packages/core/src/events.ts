import type { Vec3 } from './state/types.js';

/** Map of event name to payload type for all gameplay events. */
export interface GameEvents {
  turnStarted: { teamId: string; snailId: string };
  turnEnded: { teamId: string; snailId: string };
  projectileFired: { snailId: string; weaponId: string; origin: Vec3; velocity: Vec3 };
  explosion: { position: Vec3; radius: number; weaponId: string };
  snailDamaged: { snailId: string; amount: number; remaining: number };
  researchCompleted: { teamId: string; technologyId: string };
}

/** Handler for an event with payload `P`. */
export type Handler<P> = (payload: P) => void;

/** Minimal typed publish/subscribe bus. */
export class EventBus<E extends { [K in keyof E]: unknown } = GameEvents> {
  private handlers: { [K in keyof E]?: Set<Handler<E[K]>> } = {};

  /** Subscribes to an event. Returns an unsubscribe function. */
  on<K extends keyof E>(event: K, handler: Handler<E[K]>): () => void {
    const set = this.handlers[event] ?? new Set<Handler<E[K]>>();
    set.add(handler);
    this.handlers[event] = set;
    return () => this.off(event, handler);
  }

  /** Removes a previously registered handler. */
  off<K extends keyof E>(event: K, handler: Handler<E[K]>): void {
    this.handlers[event]?.delete(handler);
  }

  /** Emits an event to all current handlers. */
  emit<K extends keyof E>(event: K, payload: E[K]): void {
    this.handlers[event]?.forEach((h) => h(payload));
  }
}
