import type { ResearchSetting } from '@snails/core';
import type { Snapshot, WireEvent, WireTeamEntry } from '@snails/protocol';

/** Friendly texts of core's research rejection codes (unknown codes fall back to the code). */
const REJECTIONS: Record<string, string> = {
  RESEARCH_OFF: 'Research is off',
  UNKNOWN_TECH: 'Unknown technology',
  ALREADY_RESEARCHED: 'Already researched',
  ALREADY_QUEUED: 'Already queued',
  TIER_LOCKED: 'Not enough techs for this tier',
  PREREQ_MISSING: 'Prerequisites missing',
  CAPSTONE_LIMIT: 'Only one capstone per team',
  QUEUE_FULL: 'The queue is full',
  NOT_QUEUED: 'Not in the queue',
  NOT_YOUR_TURN: 'Not your team',
  MATCH_OVER: 'The match is over',
};

/** Text for a `commandRejected` reason code (any letter case). */
export function rejectionText(reason: string): string {
  return REJECTIONS[reason.toUpperCase()] ?? reason;
}

/** Resolves a tech id to its display name. */
export type TechNames = (techId: string) => string;

/** Client-side mirror of the research part of the match. */
export interface ResearchStore {
  readonly setting: ResearchSetting;
  /** Entry of one team (private part only where the server sent it). */
  entry(teamId: string): WireTeamEntry | undefined;
  /** Applies a snapshot (replaces everything research-related). */
  applySnapshot(s: Pick<Snapshot, 'research' | 'teams'>): void;
  /**
   * Applies an event batch between snapshots.
   * @returns toast texts: own completions and rejected research commands
   */
  applyEvents(
    events: readonly WireEvent[],
    myTeamIds: readonly string[],
    names: TechNames,
  ): string[];
}

/** Creates an empty store. */
export function createResearchStore(): ResearchStore {
  let setting: ResearchSetting = 'off';
  const entries = new Map<string, WireTeamEntry>();
  return {
    get setting() {
      return setting;
    },
    entry: (id) => entries.get(id),
    applySnapshot(s) {
      setting = s.research ?? 'off';
      entries.clear();
      for (const t of s.teams ?? []) entries.set(t.id, structuredClone(t));
    },
    applyEvents(events, mine, names) {
      const toasts: string[] = [];
      for (const e of events) {
        if (e.type === 'commandRejected') {
          if (e.command === 'queueResearch' || e.command === 'cancelResearch') {
            toasts.push(rejectionText(e.reason));
          }
        } else if (e.type === 'calciumChanged') {
          const r = entries.get(e.teamId)?.research;
          if (r) r.calcium = e.balance;
        } else if (e.type === 'researchCompleted') {
          const t = entries.get(e.teamId);
          if (t) t.researched = [...new Set([...(t.researched ?? []), e.techId])];
          if (mine.includes(e.teamId)) toasts.push(`${names(e.techId)} researched!`);
        }
      }
      return toasts;
    },
  };
}
