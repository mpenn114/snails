import type { GameState } from '../state/types.js';
import type { CancelResearchCommand, QueueResearchCommand } from '../sim/types.js';
import type { RejectionReason, ValidationResult } from '../sim/validation.js';
import { canResearch, type TechRegistry } from './tech-rules.js';

function reject(reason: RejectionReason, message: string): ValidationResult {
  return { ok: false, reason, message };
}

/**
 * Validates `queueResearch` / `cancelResearch`: allowed for any team in any phase while the match
 * is playing. When `issuerTeamId` is given it must equal `cmd.teamId`.
 */
export function checkResearchCommand(
  state: GameState,
  cmd: QueueResearchCommand | CancelResearchCommand,
  technologies: TechRegistry | undefined,
  issuerTeamId: string | undefined,
): ValidationResult {
  if (issuerTeamId !== undefined && issuerTeamId !== cmd.teamId) {
    return reject('NOT_YOUR_TURN', `team ${issuerTeamId} cannot command team ${cmd.teamId}`);
  }
  const team = state.teams.find((t) => t.id === cmd.teamId);
  if (!team) return reject('UNKNOWN_TEAM', `unknown team ${cmd.teamId}`);
  if (cmd.type === 'cancelResearch') {
    const r = team.research;
    if (!r) return reject('RESEARCH_OFF', 'research is off');
    const found = r.active?.techId === cmd.techId || r.queue.includes(cmd.techId);
    return found ? { ok: true } : reject('NOT_QUEUED', `${cmd.techId} is not queued`);
  }
  if (!technologies) return reject('UNKNOWN_TECH', 'no technologies in this match');
  const check = canResearch(state, team, technologies.get(cmd.techId), technologies);
  return check.ok ? check : reject(check.reason, check.message);
}
