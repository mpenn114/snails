import { describe, expect, it } from 'vitest';
import { MatchSettings } from '@snails/protocol';
import {
  SETTING_FIELDS,
  paintSettingFields,
  readSettingFields,
  settingsFieldsHtml,
} from './settings-form';

type Fake = { checked?: boolean; value?: string };

/** A form stand-in: `querySelector('[data-key="k"]')` returns the field `k`. */
function fakeRoot(fields: Record<string, Fake>): ParentNode {
  return {
    querySelector: (sel: string) => fields[/"(.+)"/.exec(sel)?.[1] ?? ''] ?? null,
  } as unknown as ParentNode;
}

describe('lobby settings form', () => {
  it('renders every host-changeable field once', () => {
    const html = settingsFieldsHtml();
    for (const f of SETTING_FIELDS) expect(html).toContain(`data-key="${f.key}"`);
    expect(html.match(/<select/g)).toHaveLength(7);
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
  });

  it('reads values back as typed settings', () => {
    const root = fakeRoot({
      startingHealth: { value: '150' },
      wind: { value: 'storm' },
      crates: { value: 'rare' },
      suddenDeathRound: { value: 'off' },
      suddenDeathType: { value: 'drain' },
      fallDamage: { value: 'high' },
      friendlyFire: { checked: false },
      lazyStart: { checked: true },
    });
    const read = readSettingFields(root);
    expect(read).toEqual({
      startingHealth: 150,
      wind: 'storm',
      crates: 'rare',
      suddenDeathRound: null,
      suddenDeathType: 'drain',
      fallDamage: 'high',
      friendlyFire: false,
      lazyStart: true,
    });
    expect(() => MatchSettings.parse(read)).not.toThrow();
    expect(readSettingFields(fakeRoot({ suddenDeathRound: { value: '12' } }))).toEqual({
      suddenDeathRound: 12,
    });
  });

  it('paints server settings into the fields', () => {
    const fields: Record<string, Fake> = {
      startingHealth: {},
      wind: {},
      crates: {},
      suddenDeathRound: {},
      suddenDeathType: {},
      fallDamage: {},
      friendlyFire: {},
      lazyStart: {},
    };
    paintSettingFields(
      fakeRoot(fields),
      MatchSettings.parse({ suddenDeathRound: null, friendlyFire: false, startingHealth: 50 }),
    );
    expect(fields['suddenDeathRound']?.value).toBe('off');
    expect(fields['startingHealth']?.value).toBe('50');
    expect(fields['wind']?.value).toBe('normal');
    expect(fields['friendlyFire']?.checked).toBe(false);
    expect(fields['lazyStart']?.checked).toBe(false);
  });
});
