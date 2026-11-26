import { MatchSettings } from '@snails/protocol';
import type { ClientMessage, ControlMode, MatchSettingsInput } from '@snails/protocol';
import { NAME_MAX } from '@snails/protocol';
import { LOGO_SVG, teamGlyphForColour } from '@snails/render';
import { injectControllerMenuStyles } from './menu-css';
import { CPU_PANEL_HTML, createCpuPicker } from './cpu-controls';
import { choiceHtml, rosterHtml, safeColour } from './lobby-html';
import type { LobbyStateMsg } from './lobby-html';
import { paintSettingFields, readSettingFields, settingsFieldsHtml } from './settings-form';
import {
  PALETTE,
  TEAMS,
  canStart,
  cleanName,
  mergeSnailNames,
  parseIntField,
  snailFieldCount,
  takenTeams,
  randomSeed,
  settingsError,
  playerTeams,
  startBlocker,
  takenColours,
} from './lobby-logic';

/** Thin DOM lobby for a phone controller. */
export interface LobbyView {
  update(state: LobbyStateMsg): void;
  showError(text: string): void;
  destroy(): void;
}

const SKELETON = `<div class="lobby-top"><div class="m-logo">${LOGO_SVG}<span class="m-word">Snails</span></div>
    <div class="roompill"><span class="room"></span><a class="tv" target="_blank" rel="noopener">Open TV view</a></div></div>
  <section class="m-card"><h2>Your team</h2>
    <div class="team-line"><span class="m-dot slot">?</span>
      <input class="teamname" maxlength="${NAME_MAX}" aria-label="Team name" autocomplete="off" />
      <button class="reroll-team" type="button" aria-label="Random team name">&#127922;</button></div>
    <p class="m-h" style="margin-top:14px">Shell colour</p>
    <div class="row colours"></div>
    <div class="extra" hidden><p class="m-h" style="margin-top:14px">Also playing (hot-seat)</p>
      <div class="row teams"></div></div></section>
  <section class="m-card"><h2>Your snails</h2><div class="snailnames"></div>
    <div class="card-actions"><button class="reroll-snails" type="button">&#127922; Shuffle names</button></div></section>
  <section class="m-card"><h2>Players</h2><ul class="roster"></ul></section>
  <button class="ready" type="button"></button>
  ${CPU_PANEL_HTML}
  <fieldset class="settings m-card"><legend>Match settings</legend>
    <label>Turn time (s) <input class="turn" inputmode="numeric" /></label>
    <label>Snails per team <input class="snails" inputmode="numeric" /></label>
    <label>Seed <input class="seed" inputmode="numeric" /></label>
    <label>Controls <select class="mode">
      <option value="perPlayer">One phone per player</option>
      <option value="hotSeat">Hot-seat (shared phone)</option></select></label>
    <button class="random" type="button">Random seed</button>
    <div class="more"></div></fieldset>
  <button class="start primary" type="button">Start match</button>
  <p class="status" role="status"></p>`;

/**
 * Reads host settings: the form's fields on top of the last settings the server sent (so values
 * the form cannot show are kept), then the three numeric inputs (NaN when blank or invalid).
 */
function readSettings(
  el: ParentNode,
  inputs: readonly HTMLInputElement[],
  mode: ControlMode,
  base: MatchSettings | undefined,
): MatchSettingsInput {
  return {
    ...base,
    ...readSettingFields(el),
    controlMode: mode,
    turnTimeSeconds: parseIntField(inputs[0]!.value),
    snailsPerTeam: parseIntField(inputs[1]!.value),
    seed: parseIntField(inputs[2]!.value),
  };
}

/** Fills the settings inputs from the server defaults; returns true. */
function seedInputs(
  el: ParentNode,
  inputs: readonly HTMLInputElement[],
  mode: HTMLSelectElement,
  s: MatchSettings,
): boolean {
  mode.value = s.controlMode;
  paintSettingFields(el, s);
  inputs[0]!.value = String(s.turnTimeSeconds);
  inputs[1]!.value = String(s.snailsPerTeam);
  inputs[2]!.value = String(s.seed);
  return true;
}

type Query = <T extends HTMLElement>(sel: string) => T;

/** Sets an input's value unless the player is typing in it. */
function setValue(input: HTMLInputElement, value: string): void {
  if (input.ownerDocument.activeElement !== input && input.value !== value) input.value = value;
}

/** Paints the player's own team card: name, slot chip, colours, extra hot-seat teams, snails. */
function paintMine(
  q: Query,
  s: LobbyStateMsg,
  me: LobbyStateMsg['players'][number] | undefined,
): void {
  const slot = q('.slot');
  slot.textContent = me?.teamId ?? '?';
  slot.style.background = safeColour(me?.colour ?? null);
  slot.title = me ? `Team ${me.teamId ?? '?'} ${teamGlyphForColour(me.colour)}` : '';
  setValue(q<HTMLInputElement>('.teamname'), me?.teamName ?? '');
  const hot = s.settings.controlMode === 'hotSeat';
  q('.extra').toggleAttribute('hidden', !hot);
  q('.teams').innerHTML = choiceHtml(
    TEAMS,
    me ? playerTeams(me) : null,
    takenTeams(s.players, me?.id ?? ''),
    'team',
  );
  const box = q('.snailnames');
  const n = snailFieldCount(s.settings.snailsPerTeam);
  if (box.childElementCount !== n)
    box.innerHTML = Array.from(
      { length: n },
      (_, i) =>
        `<label><span>${i + 1}</span><input class="sn" data-i="${i}" maxlength="${NAME_MAX}" aria-label="Snail ${i + 1} name" autocomplete="off" /></label>`,
    ).join('');
  box.querySelectorAll<HTMLInputElement>('input.sn').forEach((input, i) => {
    setValue(input, me?.snailNames?.[i] ?? '');
  });
}

/** Paints roster, pickers and ready button from a lobby snapshot. */
function paintLobby(q: Query, s: LobbyStateMsg, meId: string): void {
  const me = s.players.find((p) => p.id === meId);
  q('.room').textContent = s.roomCode;
  q<HTMLAnchorElement>('.tv').href = `/display/?room=${encodeURIComponent(s.roomCode)}`;
  q('.roster').innerHTML = rosterHtml(s.players, s.hostId, s.hostId === meId);
  q('.cpu-panel').toggleAttribute('hidden', s.hostId !== meId);
  paintMine(q, s, me);
  const taken = takenColours(s.players, meId);
  q('.colours').innerHTML = choiceHtml(PALETTE, me?.colour ?? null, taken, 'colour');
  q('button.ready').textContent = me?.ready ? 'Not ready' : 'Ready!';
  q('button.ready').classList.toggle('on', !!me?.ready);
  q<HTMLButtonElement>('button.ready').disabled = !me?.teamId && !me?.ready;
}

/** Shows host-only controls and enables Start / explains what blocks it. */
function paintStart(q: Query, s: LobbyStateMsg, meId: string, settings: MatchSettingsInput): void {
  const isHost = s.hostId === meId;
  q('.settings').toggleAttribute('hidden', !isHost);
  q('.start').toggleAttribute('hidden', !isHost);
  q<HTMLButtonElement>('.start').disabled = !canStart(s.players, s.hostId, meId, settings);
  if (isHost)
    q('.status').textContent =
      startBlocker(s.players, settings.controlMode) ?? settingsError(settings) ?? '';
}

/** Live-publishes the host's valid edits so the display shows them; other players' edits are ignored. */
function pushSettings(
  edited: MatchSettingsInput,
  isHost: boolean,
  send: (m: ClientMessage) => void,
): void {
  if (isHost && settingsError(edited) === undefined)
    send({ type: 'setSettings', settings: MatchSettings.parse(edited) });
}

/** What a lobby button click may need. */
interface ClickCtx {
  last: LobbyStateMsg;
  meId: string;
  send: (m: ClientMessage) => void;
  settings: () => MatchSettingsInput;
  cpuPicker: ReturnType<typeof createCpuPicker>;
  seedInput: HTMLInputElement;
  random: () => number;
  refreshStart: () => void;
}

/** Routes a click on one of the lobby's buttons. */
function onClick(t: HTMLButtonElement, c: ClickCtx): void {
  const { last, meId, send } = c;
  const [v, kind] = [t.dataset['v'], t.parentElement?.className.replace('row ', '')];
  if (kind === 'teams' && v) send({ type: 'toggleTeam', teamId: v });
  else if (c.cpuPicker.click(t, last.hostId === meId, send)) return;
  else if (kind === 'colours' && v) send({ type: 'setColour', colour: v });
  else if (t.classList.contains('reroll-team')) send({ type: 'setTeamName', name: '' });
  else if (t.classList.contains('reroll-snails')) send({ type: 'setSnailNames', names: [] });
  else if (t.classList.contains('ready'))
    send({ type: 'setReady', ready: !last.players.find((p) => p.id === meId)?.ready });
  else if (t.classList.contains('random')) {
    c.seedInput.value = String(randomSeed(c.random));
    c.refreshStart();
  } else if (
    t.classList.contains('start') &&
    canStart(last.players, last.hostId, meId, c.settings())
  )
    send({ type: 'startMatch', settings: MatchSettings.parse(c.settings()) });
}

/** Sends a team or snail name edit; returns false when `target` is not a name field. */
function sendNameEdit(
  target: HTMLInputElement,
  el: ParentNode,
  me: LobbyStateMsg['players'][number] | undefined,
  send: (m: ClientMessage) => void,
): boolean {
  if (target.classList.contains('teamname')) {
    target.value = cleanName(target.value);
    send({ type: 'setTeamName', name: target.value });
  } else if (target.classList.contains('sn')) {
    const typed = [...el.querySelectorAll<HTMLInputElement>('input.sn')].map((i) => i.value);
    send({ type: 'setSnailNames', names: mergeSnailNames(typed, me?.snailNames ?? []) });
  } else return false;
  return true;
}

/**
 * Mounts the lobby screen.
 * @param root container element
 * @param meId this player's id (from `welcome`)
 * @param send sends a validated client message
 * @param random injectable randomness for the seed button
 */
export function mountLobbyView(
  root: HTMLElement,
  meId: string,
  send: (m: ClientMessage) => void,
  random: () => number = Math.random,
): LobbyView {
  injectControllerMenuStyles(document);
  const el = document.createElement('div');
  el.className = 'join lobby';
  el.innerHTML = SKELETON;
  root.appendChild(el);
  const q = <T extends HTMLElement>(sel: string): T => el.querySelector<T>(sel)!;
  const inputs = ['.turn', '.snails', '.seed'].map((s) => q<HTMLInputElement>(s));
  const modeSel = q<HTMLSelectElement>('.mode');
  let [last, seeded]: [LobbyStateMsg | undefined, boolean] = [undefined, false];
  const cpuPicker = createCpuPicker(el);
  q('.more').innerHTML = settingsFieldsHtml();
  const settings = (): MatchSettingsInput =>
    readSettings(el, inputs, modeSel.value as ControlMode, last?.settings);
  const refreshStart = (): void => {
    if (!last) return;
    paintStart(q, last, meId, settings());
  };
  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button');
    if (t && last)
      onClick(t, {
        last,
        meId,
        send,
        settings,
        cpuPicker,
        seedInput: inputs[2]!,
        random,
        refreshStart,
      });
  });
  for (const input of inputs) input.addEventListener('input', refreshStart);
  el.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    const me = last?.players.find((p) => p.id === meId);
    if (sendNameEdit(target, el, me, send) || !target.closest('.settings')) return;
    refreshStart();
    pushSettings(settings(), last?.hostId === meId, send);
  });

  return {
    update: (s) => {
      last = s;
      if (!seeded) seeded = seedInputs(el, inputs, modeSel, s.settings);
      paintLobby(q, s, meId);
      refreshStart();
    },
    showError: (msg) => {
      q('.status').textContent = msg;
    },
    destroy: () => el.remove(),
  };
}
