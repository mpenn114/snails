/** Weapon data the info popover reads (structurally compatible with `WeaponDefinition`). */
export interface WeaponInfoSource {
  name: string;
  category?: string | undefined;
  ammo: number | 'infinite';
  effects?: readonly unknown[] | undefined;
  pattern?: { count: number } | undefined;
  fuseSeconds?: number | undefined;
  perTurn?: number | undefined;
  melee?: { reach: number } | undefined;
  requiresTech?: string | undefined;
}

/** What the popover shows. */
export interface InfoContent {
  title: string;
  lines: string[];
}

const CATEGORY_TEXT: Record<string, string> = {
  projectile: 'Lobbed shot: aim, hold Fire for power',
  thrown: 'Thrown: aim, hold Fire for power',
  bouncing: 'Bounces before it blows',
  guided: 'Guided: steer it with the stick in flight',
  area: 'Area attack',
  digger: 'Digs through terrain',
  melee: 'Melee strike in front of you',
  utility: 'Utility: not an attack',
  special: 'Special: lands after a delay',
};

interface Walk {
  maxDamage: number;
  statuses: string[];
  carves: boolean;
}

function walk(effects: readonly unknown[] | undefined, out: Walk): Walk {
  for (const raw of effects ?? []) {
    if (typeof raw !== 'object' || raw === null) continue;
    const e = raw as Record<string, unknown>;
    if (e.type === 'damage' && typeof e.maxDamage === 'number') {
      out.maxDamage = Math.max(out.maxDamage, e.maxDamage);
    } else if (e.type === 'carve') out.carves = true;
    else if (e.type === 'status' && typeof e.statusId === 'string') out.statuses.push(e.statusId);
    if (Array.isArray(e.effects)) walk(e.effects, out);
  }
  return out;
}

const pretty = (id: string): string => (id.split(':').pop() ?? id).replace(/-/g, ' ');

/**
 * Short description of a weapon for the (i) popover: how it is used, damage, ammo, effects and
 * the technology it needs. `techName` resolves a tech id to its display name.
 */
export function weaponInfo(
  w: WeaponInfoSource,
  techName: (id: string) => string = pretty,
): InfoContent {
  const lines: string[] = [];
  const how = CATEGORY_TEXT[w.category ?? ''];
  if (how) lines.push(how);
  const fx = walk(w.effects, { maxDamage: 0, statuses: [], carves: false });
  if (fx.maxDamage > 0) {
    const each = w.pattern ? ` x ${w.pattern.count} shells` : '';
    lines.push(`Damage: up to ${fx.maxDamage}${each}`);
  }
  if (fx.statuses.length > 0)
    lines.push(`Inflicts: ${[...new Set(fx.statuses)].map(pretty).join(', ')}`);
  if (fx.carves) lines.push('Blasts a hole in the terrain');
  if (w.fuseSeconds) lines.push(`Fuse: ${w.fuseSeconds}s`);
  if (w.melee) lines.push(`Reach: ${w.melee.reach} m`);
  lines.push(`Ammo: ${w.ammo === 'infinite' ? 'unlimited' : `${w.ammo} per match`}`);
  if (w.perTurn && w.perTurn > 1) lines.push(`Up to ${w.perTurn} uses per turn`);
  if (w.requiresTech) lines.push(`Needs research: ${techName(w.requiresTech)}`);
  return { title: w.name, lines };
}

/** Tech card data the info popover reads. */
export interface TechInfoSource {
  name: string;
  description: string;
  cost: number;
  turns: number;
  capstone: boolean;
  state: string;
  reason?: string | undefined;
}

/** Short description of a technology for its (i) popover. */
export function techInfo(t: TechInfoSource): InfoContent {
  const lines: string[] = [];
  if (t.description) lines.push(t.description);
  lines.push(`Cost: ${t.cost} calcium, ${t.turns} turn${t.turns === 1 ? '' : 's'}`);
  if (t.capstone) lines.push('Capstone: one per team');
  if (t.state === 'locked' && t.reason) lines.push(`Locked: ${t.reason}`);
  else if (t.state !== 'available') lines.push(`Status: ${t.state}`);
  return { title: t.name, lines };
}
