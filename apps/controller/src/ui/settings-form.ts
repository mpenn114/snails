import type { MatchSettings, MatchSettingsInput } from '@snails/protocol';

type Option = readonly [value: string, label: string];

/** A host-editable match setting shown in the lobby (the rest use their defaults). */
export type SettingField =
  | { kind: 'select'; key: keyof MatchSettings; label: string; options: readonly Option[] }
  | { kind: 'check'; key: keyof MatchSettings; label: string };

const HEALTH: readonly Option[] = [
  ['50', '50'],
  ['100', '100'],
  ['150', '150'],
];
const WIND: readonly Option[] = [
  ['off', 'Off'],
  ['low', 'Low'],
  ['normal', 'Normal'],
  ['storm', 'Storm'],
];
const CRATES: readonly Option[] = [
  ['off', 'Off'],
  ['rare', 'Rare'],
  ['normal', 'Normal'],
  ['frequent', 'Frequent'],
];
const SUDDEN_ROUND: readonly Option[] = [
  ['off', 'Off'],
  ['20', 'Round 20'],
  ['12', 'Round 12'],
];
const SUDDEN_TYPE: readonly Option[] = [
  ['both', 'Water and drain'],
  ['water', 'Rising water'],
  ['drain', 'Health drain'],
];
const MODE: readonly Option[] = [
  ['elimination', 'Elimination'],
  ['researchRace', 'Research race'],
  ['kingOfTheHill', 'King of the Hill'],
];
const FALL: readonly Option[] = [
  ['off', 'Off'],
  ['on', 'On'],
  ['high', 'High'],
];

/** The settings the host can change in the lobby, in display order (game-design "Match settings"). */
export const SETTING_FIELDS: readonly SettingField[] = [
  { kind: 'select', key: 'mode', label: 'Game mode', options: MODE },
  { kind: 'select', key: 'startingHealth', label: 'Starting health', options: HEALTH },
  { kind: 'select', key: 'wind', label: 'Wind', options: WIND },
  { kind: 'select', key: 'crates', label: 'Crates', options: CRATES },
  { kind: 'select', key: 'suddenDeathRound', label: 'Sudden death', options: SUDDEN_ROUND },
  { kind: 'select', key: 'suddenDeathType', label: 'Sudden death type', options: SUDDEN_TYPE },
  { kind: 'select', key: 'fallDamage', label: 'Fall damage', options: FALL },
  { kind: 'check', key: 'demo', label: 'Weapons demo map (all weapons, 99 each)' },
  { kind: 'check', key: 'friendlyFire', label: 'Friendly fire' },
  { kind: 'check', key: 'lazyStart', label: 'Lazy start (timer starts on first input)' },
];

function fieldHtml(f: SettingField): string {
  if (f.kind === 'check') {
    return `<label><input type="checkbox" data-key="${f.key}" /> ${f.label}</label>`;
  }
  const opts = f.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  return `<label>${f.label} <select data-key="${f.key}">${opts}</select></label>`;
}

/** HTML for every field of {@link SETTING_FIELDS}. */
export function settingsFieldsHtml(): string {
  return SETTING_FIELDS.map(fieldHtml).join('');
}

/** Option value shown for a setting (`null` sudden death reads as `off`). */
function toOptionValue(v: unknown): string {
  return v === null ? 'off' : String(v);
}

/** Parses a select's value back into the setting's type. */
function fromOptionValue(key: keyof MatchSettings, value: string): unknown {
  if (key === 'suddenDeathRound') return value === 'off' ? null : Number(value);
  if (key === 'startingHealth') return Number(value);
  return value;
}

/**
 * Reads the field values from the form under `root`.
 * @param root element containing the fields
 */
export function readSettingFields(root: ParentNode): MatchSettingsInput {
  const out: Record<string, unknown> = {};
  for (const f of SETTING_FIELDS) {
    const el = root.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-key="${f.key}"]`);
    if (!el) continue;
    out[f.key] =
      f.kind === 'check'
        ? (el as HTMLInputElement).checked
        : fromOptionValue(f.key, (el as HTMLSelectElement).value);
  }
  return out as MatchSettingsInput;
}

/**
 * Fills the form from server settings (values the selects cannot show are left alone).
 * @param root element containing the fields
 * @param s settings to show
 */
export function paintSettingFields(root: ParentNode, s: MatchSettings): void {
  for (const f of SETTING_FIELDS) {
    const el = root.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-key="${f.key}"]`);
    if (!el) continue;
    if (f.kind === 'check') (el as HTMLInputElement).checked = s[f.key] === true;
    else (el as HTMLSelectElement).value = toOptionValue(s[f.key]);
  }
}
