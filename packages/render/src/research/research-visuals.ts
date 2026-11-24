import {
  PLAIN_LOOK,
  deriveShellLook,
  type TeamResearchView,
  type TechVisualLookup,
} from './shell-look.js';

/** Wire-neutral per-team research entry (matches the protocol's public fields). */
export interface TeamResearchInput {
  id: string;
  researching?: boolean | undefined;
  researched?: readonly string[] | undefined;
}

const NONE: TeamResearchView = { researching: false, look: PLAIN_LOOK };

/**
 * Holds each team's public research state and derived shell look. Fed from every snapshot
 * (absolute, so a late joiner is correct at once); no event replay is involved.
 */
export class ResearchVisuals {
  private lookup: TechVisualLookup = () => undefined;
  private readonly teams = new Map<string, TeamResearchView>();
  private readonly sources = new Map<string, string>();

  /** Sets where tech visuals come from (content registry); looks are re-derived on next feed. */
  setLookup(lookup: TechVisualLookup): void {
    this.lookup = lookup;
    this.sources.clear();
  }

  /** Replaces the state from a snapshot's `teams` list (absent = research off, all plain). */
  setTeams(entries: readonly TeamResearchInput[] | undefined): void {
    const seen = new Set<string>();
    for (const e of entries ?? []) {
      seen.add(e.id);
      const src = (e.researched ?? []).join(',');
      const prev = this.teams.get(e.id);
      const look =
        prev && this.sources.get(e.id) === src
          ? prev.look
          : deriveShellLook(e.researched, this.lookup);
      this.sources.set(e.id, src);
      this.teams.set(e.id, { researching: e.researching === true, look });
    }
    for (const id of [...this.teams.keys()]) {
      if (seen.has(id)) continue;
      this.teams.delete(id);
      this.sources.delete(id);
    }
  }

  /** Current view of a team (plain when unknown). */
  get(teamId: string): TeamResearchView {
    return this.teams.get(teamId) ?? NONE;
  }
}
