import type { ZodType, ZodTypeDef } from 'zod';

/** Stable machine-readable codes for content registry failures. */
export type ContentErrorCode = 'DUPLICATE_ID' | 'UNKNOWN_ID' | 'FROZEN' | 'INVALID_DEFINITION';

/** Error thrown by {@link ContentRegistry} for invalid registry operations. */
export class ContentError extends Error {
  /** Stable code identifying the failure kind. */
  readonly code: ContentErrorCode;

  /** Creates a content error with a stable code and a human-readable message. */
  constructor(code: ContentErrorCode, message: string) {
    super(message);
    this.name = 'ContentError';
    this.code = code;
  }
}

/**
 * Generic registry of id-keyed content definitions.
 *
 * Lookups are keyed by id. {@link ContentRegistry.list} is sorted by id so
 * output is deterministic; registration order is NOT relied upon anywhere.
 * Call {@link ContentRegistry.freeze} once a match starts to lock content.
 */
export class ContentRegistry<T extends { id: string }> {
  private readonly items = new Map<string, T>();
  private frozen = false;

  /**
   * @param kind - Human-readable kind used in error messages (e.g. `weapon`).
   * @param schema - If given, every registered definition is validated against it and the
   *   parsed copy is stored.
   */
  constructor(
    private readonly kind = 'content',
    private readonly schema?: ZodType<T, ZodTypeDef, unknown>,
  ) {}

  /**
   * Registers a definition. Throws `INVALID_DEFINITION` (naming pack, kind and id),
   * `DUPLICATE_ID` or `FROZEN` on failure.
   * @param pack - Id of the pack providing the definition, for error messages.
   */
  register(item: T, pack = '?'): void {
    if (this.frozen) {
      throw new ContentError('FROZEN', `Cannot register "${item.id}": registry is frozen`);
    }
    const checked = this.validate(item, pack);
    if (this.items.has(checked.id)) {
      throw new ContentError('DUPLICATE_ID', `Duplicate ${this.kind} id: ${checked.id}`);
    }
    this.items.set(checked.id, checked);
  }

  private validate(item: T, pack: string): T {
    if (!this.schema) return item;
    const result = this.schema.safeParse(item);
    if (result.success) return result.data;
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    const id = typeof item.id === 'string' ? item.id : '(no id)';
    throw new ContentError(
      'INVALID_DEFINITION',
      `Invalid ${this.kind} "${id}" from pack "${pack}": ${issues}`,
    );
  }

  /** Returns the definition for an id, or undefined. */
  get(id: string): T | undefined {
    return this.items.get(id);
  }

  /** Returns true if a definition with this id is registered. */
  has(id: string): boolean {
    return this.items.has(id);
  }

  /** Returns the definition for an id. Throws `UNKNOWN_ID` if it is not registered. */
  require(id: string): T {
    const item = this.items.get(id);
    if (item === undefined) {
      throw new ContentError('UNKNOWN_ID', `Unknown content id: ${id}`);
    }
    return item;
  }

  /** Number of registered definitions. */
  get size(): number {
    return this.items.size;
  }

  /** True once {@link ContentRegistry.freeze} has been called. */
  get isFrozen(): boolean {
    return this.frozen;
  }

  /** Blocks any further registration. Idempotent. */
  freeze(): void {
    this.frozen = true;
  }

  /** Returns all definitions sorted by id (ascending, code-unit order). Returns a new array. */
  list(): T[] {
    return [...this.items.values()].sort((a, b) => compareIds(a.id, b.id));
  }
}

/** Code-unit comparison so ordering does not depend on locale. */
function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
