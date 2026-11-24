import { canResearch, techCost, techTurns } from '@snails/core';
import type { GameState, ResearchSetting, Team, TechnologyDefinition } from '@snails/core';
import type { WireTeamEntry } from '@snails/protocol';

/** Visual/interaction state of one tech card. */
export type CardState = 'researched' | 'active' | 'queued' | 'available' | 'locked';

/** One tech card of the tree. */
export interface TechCard {
  id: string;
  name: string;
  branch: TechnologyDefinition['branch'];
  tier: number;
  cost: number;
  turns: number;
  state: CardState;
  /** Why a locked card cannot be queued (from core's `canResearch`). */
  reason?: string;
  capstone: boolean;
  description: string;
}

/** One branch column of the tree, cards in tier order. */
export interface BranchColumn {
  branch: TechnologyDefinition['branch'];
  label: string;
  cards: TechCard[];
}

/** A queued or active tech in the header strip. */
export interface QueueSlot {
  techId: string;
  name: string;
  /** Turns left (active) or total turns (queued). */
  turns: number;
}

/** Everything the research screen renders. */
export interface ResearchModel {
  calcium: number;
  active: QueueSlot | null;
  queue: QueueSlot[];
  columns: BranchColumn[];
}

/** Branch display order and labels. */
export const BRANCHES: readonly { branch: TechnologyDefinition['branch']; label: string }[] = [
  { branch: 'weaponry', label: 'Weapons' },
  { branch: 'shell', label: 'Shell' },
  { branch: 'mobility', label: 'Mobility' },
  { branch: 'utility', label: 'Utility' },
];

/** Inputs of {@link buildResearchModel}. */
export interface ModelInput {
  setting: ResearchSetting;
  entry: WireTeamEntry | undefined;
  techs: readonly TechnologyDefinition[];
}

/** Resolves the card state and lock reason of one tech via core's rules. */
export function cardState(
  state: Pick<GameState, 'research'>,
  team: Pick<Team, 'researched' | 'research'>,
  def: TechnologyDefinition,
  byId: ReadonlyMap<string, TechnologyDefinition>,
): { state: CardState; reason?: string } {
  if (team.researched.includes(def.id)) return { state: 'researched' };
  const r = team.research;
  if (r?.active?.techId === def.id) return { state: 'active' };
  if (r?.queue.includes(def.id)) return { state: 'queued' };
  const check = canResearch(state as GameState, team as Team, def, { get: (id) => byId.get(id) });
  return check.ok ? { state: 'available' } : { state: 'locked', reason: check.message };
}

/**
 * Builds the screen model from one team's snapshot entry and the tech definitions, or null when
 * research is off or the team's private entry is not (yet) known.
 */
export function buildResearchModel(input: ModelInput): ResearchModel | null {
  const { setting, entry, techs } = input;
  if (setting === 'off' || !entry?.research) return null;
  const byId = new Map(techs.map((t) => [t.id, t]));
  const r = entry.research;
  const team = { researched: entry.researched ?? [], research: r } as Team;
  const state = { research: setting } as GameState;
  const turnsOf = (id: string): number => {
    const def = byId.get(id);
    return def ? techTurns(state, def) : 1;
  };
  const slot = (id: string, turns: number): QueueSlot => ({
    techId: id,
    name: byId.get(id)?.name ?? id,
    turns,
  });
  const columns = BRANCHES.map(({ branch, label }) => ({
    branch,
    label,
    cards: techs
      .filter((t) => t.branch === branch)
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))
      .map((def): TechCard => ({
        id: def.id,
        name: def.name,
        branch,
        tier: def.tier,
        cost: techCost(state, team, def),
        turns: techTurns(state, def),
        capstone: def.capstone === true,
        description: def.description,
        ...cardState(state, team, def, byId),
      })),
  }));
  return {
    calcium: r.calcium,
    active: r.active ? slot(r.active.techId, r.active.turnsLeft) : null,
    queue: r.queue.map((id) => slot(id, turnsOf(id))),
    columns,
  };
}
