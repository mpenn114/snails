/** Generic registry of id-keyed content definitions. */
export class ContentRegistry<T extends { id: string }> {
  private items = new Map<string, T>();

  /** Registers a definition. Throws if the id is already registered. */
  register(item: T): void {
    if (this.items.has(item.id)) throw new Error(`Duplicate content id: ${item.id}`);
    this.items.set(item.id, item);
  }

  /** Returns the definition for an id, or undefined. */
  get(id: string): T | undefined {
    return this.items.get(id);
  }

  /** Returns all registered definitions in registration order. */
  list(): T[] {
    return [...this.items.values()];
  }
}
