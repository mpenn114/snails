import { validateReferences } from './pack-validation.js';
import { createContentRegistries, type ContentRegistries } from './registries.js';
import { ContentError, type ContentRegistry } from './registry.js';
import { ContentPackManifestSchema } from './schemas.js';
import { satisfiesRange } from './semver.js';
import type { ContentPackManifest } from './types.js';

/** Definition lists of a pack, keyed like {@link ContentRegistries}. */
export type PackContent = {
  [K in keyof ContentRegistries]?: ContentRegistries[K] extends ContentRegistry<infer T>
    ? readonly T[]
    : never;
};

/** A content pack: a manifest plus plain definition data. */
export interface ContentPack extends PackContent {
  manifest: ContentPackManifest;
}

/** Result of {@link loadContentPacks}. */
export interface LoadedContent {
  /** Frozen registries holding every pack's (deep-frozen) definitions. */
  registries: ContentRegistries;
  /** Pack ids in load order (dependencies first). */
  order: string[];
  /** Deterministic hash of pack versions and all definitions; sent in the room handshake. */
  contentHash: string;
}

/** Thrown by {@link loadContentPacks}; `errors` lists every problem found, not just the first. */
export class ContentPackError extends Error {
  /** Stable code. */
  readonly code = 'INVALID_PACKS';

  /** Creates the error from the full list of problems. */
  constructor(readonly errors: readonly string[]) {
    super(`Content packs are invalid (${errors.length}):\n- ${errors.join('\n- ')}`);
    this.name = 'ContentPackError';
  }
}

/** Resolves load order (dependencies first, ties by pack id) and reports dependency problems. */
function resolveOrder(packs: readonly ContentPack[], errors: string[]): ContentPack[] {
  const byId = new Map(packs.map((p) => [p.manifest.id, p]));
  const sorted = [...packs].sort((a, b) => (a.manifest.id < b.manifest.id ? -1 : 1));
  const done = new Set<string>();
  const out: ContentPack[] = [];
  const visit = (pack: ContentPack, stack: string[]): void => {
    const id = pack.manifest.id;
    if (done.has(id)) return;
    if (stack.includes(id)) {
      errors.push(`dependency cycle: ${[...stack.slice(stack.indexOf(id)), id].join(' -> ')}`);
      return;
    }
    const deps = Object.entries(pack.manifest.dependencies ?? {}).sort(([a], [b]) =>
      a < b ? -1 : 1,
    );
    for (const [depId, range] of deps) {
      const dep = byId.get(depId);
      if (!dep) {
        errors.push(`pack "${id}": missing dependency "${depId}"`);
      } else {
        const ok = satisfiesRange(dep.manifest.version, range);
        if (ok !== true) {
          errors.push(
            `pack "${id}": dependency "${depId}" ${dep.manifest.version} does not satisfy "${range}"`,
          );
        }
        visit(dep, [...stack, id]);
      }
    }
    done.add(id);
    out.push(pack);
  };
  for (const p of sorted) visit(p, []);
  return out;
}

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v).sort();
    const rec = v as Record<string, unknown>;
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(rec[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** 53-bit string hash (cyrb53), hex. Not cryptographic; identifies content for handshakes. */
function hashString(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

function deepFreeze(v: unknown): void {
  if (v === null || typeof v !== 'object' || Object.isFrozen(v)) return;
  Object.freeze(v);
  for (const child of Object.values(v)) deepFreeze(child);
}

function registerAll(
  registries: ContentRegistries,
  ordered: readonly ContentPack[],
  errors: string[],
): void {
  const kinds = Object.keys(registries) as (keyof ContentRegistries)[];
  for (const pack of ordered) {
    for (const kind of kinds) {
      const reg = registries[kind] as ContentRegistry<{ id: string }>;
      for (const item of (pack[kind] ?? []) as readonly { id: string }[]) {
        try {
          reg.register(item, pack.manifest.id);
        } catch (err) {
          if (!(err instanceof ContentError)) throw err;
          errors.push(`${err.message} (pack "${pack.manifest.id}")`);
        }
      }
    }
  }
}

function manifestErrors(packs: readonly ContentPack[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const p of packs) {
    const r = ContentPackManifestSchema.safeParse(p.manifest);
    if (!r.success) {
      const issues = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      errors.push(`invalid manifest for pack "${String(p.manifest?.id)}": ${issues}`);
    }
    if (seen.has(p.manifest.id)) errors.push(`duplicate pack id "${p.manifest.id}"`);
    seen.add(p.manifest.id);
  }
  return errors;
}

/**
 * Loads content packs: validates manifests, orders packs so dependencies come first (ties by
 * pack id, so input order does not matter; a cycle is an error), registers every definition
 * through the schema-validating registries, then checks cross references (weapon
 * `requiresTech`, effect status/area/weapon ids, crate contents, ...).
 *
 * All problems are collected and thrown together as one {@link ContentPackError}. On success
 * the registries are frozen (definitions deep-frozen) and `contentHash` is identical for
 * identical content regardless of pack input order.
 * @throws ContentPackError listing every problem.
 */
export function loadContentPacks(packs: readonly ContentPack[]): LoadedContent {
  const errors = manifestErrors(packs);
  if (errors.length > 0) throw new ContentPackError(errors);
  const ordered = resolveOrder(packs, errors);
  const registries = createContentRegistries();
  if (errors.length === 0) {
    registerAll(registries, ordered, errors);
    errors.push(...validateReferences(registries));
  }
  if (errors.length > 0) throw new ContentPackError(errors);
  const kinds = Object.keys(registries) as (keyof ContentRegistries)[];
  const defs: Record<string, unknown> = {};
  for (const kind of kinds) {
    const reg = registries[kind] as ContentRegistry<{ id: string }>;
    reg.list().forEach(deepFreeze);
    reg.freeze();
    defs[kind] = reg.list();
  }
  const versions = ordered.map((p) => `${p.manifest.id}@${p.manifest.version}`);
  const contentHash = hashString(stableStringify({ packs: versions, defs }));
  return { registries, order: ordered.map((p) => p.manifest.id), contentHash };
}
