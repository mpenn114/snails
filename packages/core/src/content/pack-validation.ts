import type { ContentRegistries } from './registries.js';
import type { Effect } from './effects/effect-schemas.js';

type Check = (r: ContentRegistries, fail: (msg: string) => void) => void;

function effectRefs(e: Effect): { kind: 'status' | 'area' | 'weapon'; id: string }[] {
  if (e.type === 'status') return [{ kind: 'status', id: e.statusId }];
  if (e.type !== 'spawn') return [];
  return e.spawn.what === 'area'
    ? [{ kind: 'area', id: e.spawn.areaId }]
    : [{ kind: 'weapon', id: e.spawn.weaponId }];
}

const weaponRefs: Check = (r, fail) => {
  const known = { status: r.statuses, area: r.areas, weapon: r.weapons };
  for (const w of r.weapons.list()) {
    if (w.requiresTech !== undefined && !r.technologies.has(w.requiresTech)) {
      fail(`weapon "${w.id}": requiresTech "${w.requiresTech}" is not a registered technology`);
    }
    for (const ref of w.effects.flatMap(effectRefs)) {
      if (!known[ref.kind].has(ref.id)) {
        fail(`weapon "${w.id}": effect refers to unknown ${ref.kind} "${ref.id}"`);
      }
    }
  }
};

const otherRefs: Check = (r, fail) => {
  for (const t of r.technologies.list()) {
    for (const p of t.prerequisites) {
      if (!r.technologies.has(p)) fail(`technology "${t.id}": unknown prerequisite "${p}"`);
    }
  }
  for (const s of r.shellUpgrades.list()) {
    if (s.requiresTech !== undefined && !r.technologies.has(s.requiresTech)) {
      fail(
        `shellUpgrade "${s.id}": requiresTech "${s.requiresTech}" is not a registered technology`,
      );
    }
  }
  for (const a of r.areas.list()) {
    const id = a.applyStatus?.statusId;
    if (id !== undefined && !r.statuses.has(id)) {
      fail(`area "${a.id}": applyStatus refers to unknown status "${id}"`);
    }
  }
  for (const s of r.statuses.list()) {
    for (const c of s.cures ?? []) {
      if (!r.statuses.has(c)) fail(`status "${s.id}": cures unknown status "${c}"`);
    }
  }
  for (const c of r.crates.list()) {
    for (const w of c.contents.weapons ?? []) {
      if (!r.weapons.has(w.weaponId)) fail(`crate "${c.id}": unknown weapon "${w.weaponId}"`);
    }
    const sid = c.contents.statusId;
    if (sid !== undefined && !r.statuses.has(sid)) fail(`crate "${c.id}": unknown status "${sid}"`);
  }
};

/** Cross-reference checks, run after all packs are registered. Add a row for a new kind. */
export const referenceChecks: readonly Check[] = [weaponRefs, otherRefs];

/** Returns one message per dangling cross reference in the registries (empty = valid). */
export function validateReferences(registries: ContentRegistries): string[] {
  const errors: string[] = [];
  for (const check of referenceChecks) check(registries, (m) => errors.push(m));
  return errors;
}
