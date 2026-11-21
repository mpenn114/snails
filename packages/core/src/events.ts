import type { SimEvent } from './sim/events.js';

/** Handler receiving the event narrowed to its type. */
export type Handler<E> = (event: E) => void;

/** Typed publish/subscribe bus over a discriminated union with a string `type`. */
export class EventBus<E extends { type: string } = SimEvent> {
  private readonly handlers = new Map<string, Handler<never>[]>();

  /** Subscribes to one event type. Returns an unsubscribe function. */
  on<T extends E['type']>(type: T, handler: Handler<Extract<E, { type: T }>>): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as Handler<never>);
    this.handlers.set(type, list);
    return () => this.off(type, handler);
  }

  /** Removes a previously registered handler (first match). */
  off<T extends E['type']>(type: T, handler: Handler<Extract<E, { type: T }>>): void {
    const list = this.handlers.get(type);
    const i = list ? list.indexOf(handler as Handler<never>) : -1;
    if (list && i >= 0) this.handlers.set(type, [...list.slice(0, i), ...list.slice(i + 1)]);
  }

  /** Emits an event to its handlers in subscription order. */
  emit(event: E): void {
    for (const h of this.handlers.get(event.type) ?? []) (h as Handler<E>)(event);
  }

  /** Emits each event in order. */
  emitAll(events: readonly E[]): void {
    for (const e of events) this.emit(e);
  }
}
