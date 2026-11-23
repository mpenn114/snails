import type { ClientMessage, MatchSettings } from '@snails/protocol';
import { choiceHtml, rosterHtml } from './lobby-html';
import type { LobbyStateMsg } from './lobby-html';
import {
  PALETTE,
  TEAMS,
  canStart,
  parseIntField,
  randomSeed,
  settingsError,
  startBlocker,
  takenColours,
} from './lobby-logic';

/** Thin DOM lobby for a phone controller. */
export interface LobbyView {
  update(state: LobbyStateMsg): void;
  showError(text: string): void;
  destroy(): void;
}

const SKELETON = `<h1>Lobby <span class="room"></span></h1>
  <ul class="roster"></ul>
  <div class="row teams"></div>
  <div class="row colours"></div>
  <button class="ready" type="button"></button>
  <fieldset class="settings"><legend>Match settings</legend>
    <label>Turn time (s) <input class="turn" inputmode="numeric" /></label>
    <label>Snails per team <input class="snails" inputmode="numeric" /></label>
    <label>Seed <input class="seed" inputmode="numeric" /></label>
    <button class="random" type="button">Random seed</button></fieldset>
  <button class="start" type="button">Start match</button>
  <p class="status" role="status"></p>`;

/** Reads host settings from the three inputs (NaN when blank or invalid). */
function readSettings(inputs: readonly HTMLInputElement[]): MatchSettings {
  return {
    turnTimeSeconds: parseIntField(inputs[0]!.value),
    snailsPerTeam: parseIntField(inputs[1]!.value),
    seed: parseIntField(inputs[2]!.value),
  };
}

/** Fills the settings inputs from the server defaults; returns true. */
function seedInputs(inputs: readonly HTMLInputElement[], s: MatchSettings): boolean {
  inputs[0]!.value = String(s.turnTimeSeconds);
  inputs[1]!.value = String(s.snailsPerTeam);
  inputs[2]!.value = String(s.seed);
  return true;
}

type Query = <T extends HTMLElement>(sel: string) => T;

/** Paints roster, pickers and ready button from a lobby snapshot. */
function paintLobby(q: Query, s: LobbyStateMsg, meId: string): void {
  const me = s.players.find((p) => p.id === meId);
  q('.room').textContent = s.roomCode;
  q('.roster').innerHTML = rosterHtml(s.players, s.hostId);
  q('.teams').innerHTML = choiceHtml(TEAMS, me?.teamId ?? null, new Set(), 'team');
  const taken = takenColours(s.players, meId);
  q('.colours').innerHTML = choiceHtml(PALETTE, me?.colour ?? null, taken, 'colour');
  q('.ready').textContent = me?.ready ? 'Not ready' : 'Ready';
  q<HTMLButtonElement>('.ready').disabled = !me?.teamId && !me?.ready;
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
  const el = document.createElement('div');
  el.className = 'join lobby';
  el.innerHTML = SKELETON;
  root.appendChild(el);
  const q = <T extends HTMLElement>(sel: string): T => el.querySelector<T>(sel)!;
  const inputs = ['.turn', '.snails', '.seed'].map((s) => q<HTMLInputElement>(s));
  let last: LobbyStateMsg | undefined;
  let seeded = false;
  const settings = (): MatchSettings => readSettings(inputs);
  const refreshStart = (): void => {
    if (!last) return;
    const isHost = last.hostId === meId;
    q('.settings').toggleAttribute('hidden', !isHost);
    q('.start').toggleAttribute('hidden', !isHost);
    const ok = canStart(last.players, last.hostId, meId, settings());
    q<HTMLButtonElement>('.start').disabled = !ok;
    if (isHost)
      q('.status').textContent = startBlocker(last.players) ?? settingsError(settings()) ?? '';
  };
  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button');
    if (!t || !last) return;
    const v = t.dataset['v'];
    const kind = t.parentElement?.className.replace('row ', '');
    if (kind === 'teams' && v) send({ type: 'setTeam', teamId: v });
    else if (kind === 'colours' && v) send({ type: 'setColour', colour: v });
    else if (t.classList.contains('ready'))
      send({ type: 'setReady', ready: !last.players.find((p) => p.id === meId)?.ready });
    else if (t.classList.contains('random')) {
      inputs[2]!.value = String(randomSeed(random));
      refreshStart();
    } else if (
      t.classList.contains('start') &&
      canStart(last.players, last.hostId, meId, settings())
    )
      send({ type: 'startMatch', settings: settings() });
  });
  for (const input of inputs) input.addEventListener('input', refreshStart);

  return {
    update: (s) => {
      last = s;
      if (!seeded) seeded = seedInputs(inputs, s.settings);
      paintLobby(q, s, meId);
      refreshStart();
    },
    showError: (msg) => {
      q('.status').textContent = msg;
    },
    destroy: () => el.remove(),
  };
}
