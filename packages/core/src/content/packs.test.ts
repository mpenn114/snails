import { describe, expect, it } from 'vitest';
import { ContentPackError, loadContentPacks, type ContentPack } from './packs.js';
import { ContentError } from './registry.js';
import { createContentRegistries } from './registries.js';
import { satisfiesRange } from './semver.js';
import type { WeaponDefinition } from './types.js';

const weapon = (id: string, extra: Partial<WeaponDefinition> = {}): WeaponDefinition => ({
  id,
  name: id,
  category: 'projectile',
  launch: { minSpeed: 1, maxSpeed: 2, gravityScale: 1, windScale: 1, projectileRadius: 0.1 },
  fuseSeconds: 0,
  effects: [{ type: 'damage', radius: 1, maxDamage: 5 }],
  ammo: 'infinite',
  ...extra,
});

const pack = (
  id: string,
  deps: Record<string, string> = {},
  content: Partial<ContentPack> = {},
): ContentPack => ({
  manifest: { id, name: id, version: '1.2.0', dependencies: deps },
  ...content,
});

function errorsOf(packs: ContentPack[]): readonly string[] {
  try {
    loadContentPacks(packs);
  } catch (err) {
    if (err instanceof ContentPackError) return err.errors;
    throw err;
  }
  return [];
}

describe('loadContentPacks', () => {
  it('orders dependencies first regardless of input order', () => {
    const a = pack('aaa', { zzz: '^1.0.0' });
    const z = pack('zzz');
    const m = pack('mmm');
    expect(loadContentPacks([a, z, m]).order).toEqual(['zzz', 'aaa', 'mmm']);
    expect(loadContentPacks([m, a, z]).order).toEqual(['zzz', 'aaa', 'mmm']);
  });

  it('reports dependency cycles', () => {
    const errs = errorsOf([pack('a', { b: '*' }), pack('b', { a: '*' })]);
    expect(errs.some((e) => /cycle: a -> b -> a/.test(e))).toBe(true);
  });

  it('reports missing dependencies and unsatisfied ranges', () => {
    const errs = errorsOf([pack('a', { nope: '*', b: '^2.0.0' }), pack('b')]);
    expect(errs).toContain('pack "a": missing dependency "nope"');
    expect(errs.some((e) => e.includes('"b" 1.2.0 does not satisfy "^2.0.0"'))).toBe(true);
  });

  it('rejects bad manifests and duplicate pack ids', () => {
    const bad: ContentPack = { manifest: { id: 'x', name: 'x', version: 'one' } };
    expect(errorsOf([bad])[0]).toMatch(/invalid manifest.*version/);
    expect(errorsOf([pack('x'), pack('x')])).toContain('duplicate pack id "x"');
  });

  it('reports every cross-reference error together', () => {
    const w = weapon('p:w', {
      requiresTech: 'missing-tech',
      effects: [
        { type: 'status', statusId: 'p:nostatus', radius: 1 },
        { type: 'spawn', spawn: { what: 'area', areaId: 'p:noarea' } },
        {
          type: 'spawn',
          spawn: { what: 'projectiles', weaponId: 'p:noweapon', count: 2, speed: 3 },
        },
      ],
    });
    const errs = errorsOf([pack('p', {}, { weapons: [w] })]);
    expect(errs).toHaveLength(4);
    expect(errs.join('\n')).toMatch(
      /requiresTech "missing-tech"[\s\S]*status[\s\S]*area[\s\S]*weapon/,
    );
  });

  it('names pack, kind and id for an invalid definition', () => {
    const bad = weapon('p:w', { fuseSeconds: -1 });
    const errs = errorsOf([pack('p', {}, { weapons: [bad] })]);
    expect(errs[0]).toMatch(/Invalid weapon "p:w" from pack "p": fuseSeconds/);
  });

  it('reports duplicate ids across packs', () => {
    const errs = errorsOf([
      pack('p', {}, { weapons: [weapon('p:w')] }),
      pack('q', {}, { weapons: [weapon('p:w')] }),
    ]);
    expect(errs[0]).toMatch(/Duplicate weapon id: p:w/);
  });

  it('freezes registries and definitions', () => {
    const { registries } = loadContentPacks([pack('p', {}, { weapons: [weapon('p:w')] })]);
    expect(registries.weapons.isFrozen).toBe(true);
    expect(() => registries.weapons.register(weapon('p:late'))).toThrow(ContentError);
    const w = registries.weapons.require('p:w');
    expect(Object.isFrozen(w) && Object.isFrozen(w.launch)).toBe(true);
  });

  it('computes a deterministic content hash that tracks content and versions', () => {
    const a = pack('p', {}, { weapons: [weapon('p:a'), weapon('p:b')] });
    const reordered = pack('p', {}, { weapons: [weapon('p:b'), weapon('p:a')] });
    const changed = pack('p', {}, { weapons: [weapon('p:a'), weapon('p:b', { fuseSeconds: 1 })] });
    const h = loadContentPacks([a]).contentHash;
    expect(loadContentPacks([reordered]).contentHash).toBe(h);
    expect(loadContentPacks([changed]).contentHash).not.toBe(h);
    expect(
      loadContentPacks([{ ...a, manifest: { ...a.manifest, version: '1.3.0' } }]).contentHash,
    ).not.toBe(h);
  });
});

describe('satisfiesRange', () => {
  it('handles exact, caret, tilde, >= and wildcard ranges', () => {
    expect(satisfiesRange('1.2.3', '*')).toBe(true);
    expect(satisfiesRange('1.2.3', '1.2.3')).toBe(true);
    expect(satisfiesRange('1.2.4', '1.2.3')).toBe(false);
    expect(satisfiesRange('1.5.0', '^1.2.0')).toBe(true);
    expect(satisfiesRange('2.0.0', '^1.2.0')).toBe(false);
    expect(satisfiesRange('1.1.0', '^1.2.0')).toBe(false);
    expect(satisfiesRange('0.2.5', '^0.2.1')).toBe(true);
    expect(satisfiesRange('0.3.0', '^0.2.1')).toBe(false);
    expect(satisfiesRange('1.2.9', '~1.2.0')).toBe(true);
    expect(satisfiesRange('1.3.0', '~1.2.0')).toBe(false);
    expect(satisfiesRange('3.0.0', '>=1.0.0')).toBe(true);
  });

  it('returns null for malformed input', () => {
    expect(satisfiesRange('1.2', '*')).toBeNull();
    expect(satisfiesRange('1.2.3', 'latest')).toBeNull();
  });
});

describe('registries', () => {
  it('validate on register with an error naming kind and id', () => {
    const r = createContentRegistries();
    expect(() => r.weapons.register({ id: 'nope' } as WeaponDefinition, 'pk')).toThrow(
      /Invalid weapon "nope" from pack "pk"/,
    );
  });
});
