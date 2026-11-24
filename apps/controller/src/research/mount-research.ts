import type { TechnologyDefinition } from '@snails/core';
import { findMyTeam, findMyTeams } from '../controls/my-turn';
import type { ControllerClient } from '../net/client';
import { actingTeam, createHoldReveal } from './hold-reveal';
import { buildResearchModel } from './research-model';
import { createResearchDom, wireHold } from './research-dom';
import { createResearchStore } from './research-store';
import type { ViewActions } from './research-view';
import { renderResearch } from './research-view';

/** Who the phone is and whose turn it is, as the research screen needs it. */
interface Who {
  myTeams: string[];
  myTeam: string | null;
  activeTeam: string | null;
  hotSeat: boolean;
}

/**
 * Mounts the Research button (right column) and the full-screen research screen. Works at any
 * time during a match; hidden when research is off. In hot-seat the tree is hidden behind a
 * press-and-hold control and acts for the active team. Returns a disposer.
 */
export function mountResearch(
  parent: HTMLElement,
  client: ControllerClient,
  playerId: string | null,
  techs: readonly TechnologyDefinition[],
): () => void {
  const store = createResearchStore();
  const hold = createHoldReveal();
  const dom = createResearchDom(parent);
  const who: Who = { myTeams: [], myTeam: null, activeTeam: null, hotSeat: false };
  let open = false;
  const team = (): string | null =>
    actingTeam(who.hotSeat, who.myTeams, who.activeTeam, who.myTeam);
  const actions = researchActions(client, dom.say);
  const render = (): void => {
    const id = team();
    const on = store.setting !== 'off' && id !== null;
    dom.button.style.display = on ? '' : 'none';
    if (!on && open) return setOpen(false);
    if (!open) return;
    const shown = id !== null && (!who.hotSeat || hold.revealed);
    dom.screen.querySelectorAll('.rs-tree,.rs-queue').forEach((e) => e.remove());
    const model =
      shown && id !== null
        ? buildResearchModel({ setting: store.setting, entry: store.entry(id), techs })
        : null;
    const calc = dom.screen.querySelector('.rs-calc');
    if (calc) calc.textContent = shown ? 'Research' : 'Research (private)';
    if (model) renderResearch(dom.screen, model, actions);
    if (who.hotSeat && dom.holdBtn.parentElement !== dom.screen) dom.screen.append(dom.holdBtn);
  };
  function setOpen(v: boolean): void {
    open = v;
    dom.screen.classList.toggle('open', v);
    hold.reset();
    render();
  }

  dom.button.addEventListener('click', () => setOpen(true));
  dom.closeBtn.addEventListener('click', () => setOpen(false));
  wireHold(dom.holdBtn, hold);
  const offHold = hold.onChange(render);
  const offs = subscribe(
    client,
    playerId,
    who,
    store,
    render,
    (toasts) => toasts.forEach(dom.say),
    (id) => techs.find((t) => t.id === id)?.name ?? id,
    hold.reset,
  );
  render();
  return () => {
    offs();
    offHold();
    dom.dispose();
  };
}

/** Button callbacks: send intents, explain locked cards by toast. */
function researchActions(client: ControllerClient, say: (t: string) => void): ViewActions {
  return {
    queue: (techId) => client.send({ type: 'queueResearch', techId }),
    cancel: (techId) => client.send({ type: 'cancelResearch', techId }),
    explain: (c) => say(c.reason ?? 'Locked'),
  };
}

/** Wires server messages into `who` and the store; returns an unsubscribe-all. */
function subscribe(
  client: ControllerClient,
  playerId: string | null,
  who: Who,
  store: ReturnType<typeof createResearchStore>,
  render: () => void,
  toast: (texts: string[]) => void,
  name: (id: string) => string,
  resetHold: () => void,
): () => void {
  const offs = [
    client.on('lobbyState', (s) => {
      who.myTeams = findMyTeams(playerId, s.players);
      who.myTeam = findMyTeam(playerId, s.players);
      render();
    }),
    client.on('matchStarted', (m) => {
      who.hotSeat = m.settings.controlMode === 'hotSeat';
    }),
    client.on('turnStart', (t) => {
      who.activeTeam = t.teamId;
      resetHold();
      render();
    }),
    client.on('snapshot', (s) => {
      store.applySnapshot(s);
      render();
    }),
    client.on('eventBatch', (b) => {
      toast(store.applyEvents(b.events, who.myTeams, name));
      if (b.events.some((e) => e.type.startsWith('research') || e.type === 'calciumChanged')) {
        render();
      }
    }),
  ];
  return () => offs.forEach((off) => off());
}
