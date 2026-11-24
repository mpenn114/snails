import type { SimContext } from '../sim/types.js';
import { ContentRegistry } from './registry.js';
import {
  AreaSchema,
  CrateSchema,
  StatusSchema,
  TechnologySchema,
  WeaponSchema,
} from './schemas.js';
import type {
  AreaDefinition,
  CrateDefinition,
  StatusDefinition,
  TechnologyDefinition,
  WeaponDefinition,
} from './types.js';

/** The content a running match needs: what effects, statuses and areas look up by id. */
export interface MatchContent {
  weapons: ContentRegistry<WeaponDefinition>;
  statuses: ContentRegistry<StatusDefinition>;
  areas: ContentRegistry<AreaDefinition>;
  crates: ContentRegistry<CrateDefinition>;
  technologies: ContentRegistry<TechnologyDefinition>;
}

/** Effect handlers and turn-start hooks get the sim context plus the match content. */
export interface EffectContext extends SimContext {
  content: MatchContent;
}

/** Builds frozen, validated match registries from plain definition lists. */
export function buildMatchContent(defs: {
  weapons: readonly WeaponDefinition[];
  statuses?: readonly StatusDefinition[];
  areas?: readonly AreaDefinition[];
  crates?: readonly CrateDefinition[];
  technologies?: readonly TechnologyDefinition[];
}): MatchContent {
  const content: MatchContent = {
    weapons: new ContentRegistry('weapon', WeaponSchema),
    statuses: new ContentRegistry('status', StatusSchema),
    areas: new ContentRegistry('area', AreaSchema),
    crates: new ContentRegistry('crate', CrateSchema),
    technologies: new ContentRegistry('technology', TechnologySchema),
  };
  for (const w of defs.weapons) content.weapons.register(w);
  for (const s of defs.statuses ?? []) content.statuses.register(s);
  for (const a of defs.areas ?? []) content.areas.register(a);
  for (const c of defs.crates ?? []) content.crates.register(c);
  for (const t of defs.technologies ?? []) content.technologies.register(t);
  content.weapons.freeze();
  content.statuses.freeze();
  content.areas.freeze();
  content.crates.freeze();
  content.technologies.freeze();
  return content;
}

/** Wraps a sim context with match content for effect handlers. */
export function withContent(ctx: SimContext, content: MatchContent): EffectContext {
  return { ...ctx, content };
}
