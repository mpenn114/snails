import type { ClientMessage, CpuDifficulty, CpuInfo, CpuPersonality } from '@snails/protocol';
import { choiceHtml } from './lobby-html';

/** Difficulty options in display order. */
export const CPU_DIFFICULTIES: readonly CpuDifficulty[] = [
  'rookie',
  'regular',
  'veteran',
  'mastermind',
];

/** Personality options in display order. */
export const CPU_PERSONALITIES: readonly CpuPersonality[] = [
  'aggressive',
  'cautious',
  'opportunist',
];

/** Default difficulty for a new CPU team. */
export const DEFAULT_CPU_DIFFICULTY: CpuDifficulty = 'regular';
/** Default personality for a new CPU team. */
export const DEFAULT_CPU_PERSONALITY: CpuPersonality = 'opportunist';

/**
 * Capitalises a CPU option for display.
 * @param v option value such as `rookie`
 */
export function cpuLabel(v: string): string {
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/**
 * Short description of a CPU team, e.g. `Rookie, Aggressive`.
 * @param c CPU settings
 */
export function cpuSummary(c: CpuInfo): string {
  return `${cpuLabel(c.difficulty)}, ${cpuLabel(c.personality)}`;
}

/** Markup for the host-only "+ CPU" panel. */
export const CPU_PANEL_HTML = `<fieldset class="cpu-panel"><legend>Add a CPU team</legend>
  <div class="row cpu-diff"></div><div class="row cpu-pers"></div>
  <button class="cpu-add" type="button">+ CPU</button></fieldset>`;

/**
 * Paints the difficulty and personality segmented buttons.
 * @param el panel container
 * @param difficulty selected difficulty
 * @param personality selected personality
 */
export function paintCpuPanel(
  el: ParentNode,
  difficulty: CpuDifficulty,
  personality: CpuPersonality,
): void {
  const fill = (sel: string, items: readonly string[], on: string): void => {
    el.querySelector(sel)!.innerHTML = choiceHtml(
      items.map(cpuLabel),
      cpuLabel(on),
      new Set(),
      'team',
    );
    for (const b of el.querySelectorAll<HTMLElement>(`${sel} button`))
      b.dataset['v'] = (b.dataset['v'] ?? '').toLowerCase();
  };
  fill('.cpu-diff', CPU_DIFFICULTIES, difficulty);
  fill('.cpu-pers', CPU_PERSONALITIES, personality);
}

/**
 * The message the host's "+ CPU" button sends, or `undefined` for non-hosts.
 * @param isHost whether this phone is the room host
 * @param difficulty selected difficulty
 * @param personality selected personality
 */
export function addCpuMessage(
  isHost: boolean,
  difficulty: CpuDifficulty,
  personality: CpuPersonality,
): ClientMessage | undefined {
  return isHost ? { type: 'addCpu', difficulty, personality } : undefined;
}

/**
 * The message a CPU row's remove button sends, or `undefined` for non-hosts.
 * @param isHost whether this phone is the room host
 * @param teamId CPU team to remove
 */
export function removeCpuMessage(isHost: boolean, teamId: string): ClientMessage | undefined {
  return isHost ? { type: 'removeCpu', teamId } : undefined;
}

/** Host-side state of the "+ CPU" panel. */
export interface CpuPicker {
  /**
   * Handles a click inside the lobby; returns true when it belonged to the CPU controls.
   * @param t clicked button
   * @param isHost whether this phone is the room host
   * @param send sends a client message
   */
  click(t: HTMLElement, isHost: boolean, send: (m: ClientMessage) => void): boolean;
}

/**
 * Creates the CPU picker, painting its defaults into `el`.
 * @param el lobby container holding the CPU panel
 */
export function createCpuPicker(el: ParentNode): CpuPicker {
  let difficulty: CpuDifficulty = DEFAULT_CPU_DIFFICULTY;
  let personality: CpuPersonality = DEFAULT_CPU_PERSONALITY;
  const repaint = (): void => paintCpuPanel(el, difficulty, personality);
  repaint();
  return {
    click: (t, isHost, send) => {
      const [v, kind] = [t.dataset['v'], t.parentElement?.className.replace('row ', '')];
      if (kind === 'cpu-diff' && v) difficulty = v as CpuDifficulty;
      else if (kind === 'cpu-pers' && v) personality = v as CpuPersonality;
      else {
        const team = t.dataset['team'];
        const m = t.classList.contains('cpu-add')
          ? addCpuMessage(isHost, difficulty, personality)
          : t.classList.contains('cpu-remove') && team
            ? removeCpuMessage(isHost, team)
            : undefined;
        if (m) send(m);
        return t.classList.contains('cpu-add') || t.classList.contains('cpu-remove');
      }
      repaint();
      return true;
    },
  };
}
