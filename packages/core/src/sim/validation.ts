import type { GameState } from '../state/types.js';
import { usesPerTurn } from '../combat/combat.js';
import { weaponAvailability, type StockedWeapon } from '../combat/inventory.js';
import type { Command } from './types.js';

/** Stable machine-readable codes for why a command was refused. */
export type RejectionReason =
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'SNAIL_NOT_ACTIVE'
  | 'SNAIL_DEAD'
  | 'UNKNOWN_SNAIL'
  | 'UNKNOWN_WEAPON'
  | 'ALREADY_FIRED'
  | 'NO_USES_LEFT'
  | 'NO_AMMO'
  | 'WEAPON_LOCKED'
  | 'INVALID_VALUE'
  | 'MATCH_OVER';

/** Outcome of validating a command. */
export type ValidationResult =
  { ok: true } | { ok: false; reason: RejectionReason; message: string };

/** Extra inputs for {@link validateCommand}. */
export interface ValidationContext {
  /** Weapon registry; when omitted, weapon ids are not checked. */
  weapons?: {
    has(id: string): boolean;
    /** When present, use-limited weapons, stock and tech locks are checked. */
    get?(id: string):
      | (Partial<StockedWeapon> & {
          perTurn?: number | undefined;
          endsAction?: boolean | undefined;
        })
      | undefined;
  };
  /** Team issuing the command; when omitted, issuer is not checked. */
  issuerTeamId?: string;
}

const OK: ValidationResult = { ok: true };

function reject(reason: RejectionReason, message: string): ValidationResult {
  return { ok: false, reason, message };
}

function checkSnail(state: GameState, snailId: string): ValidationResult {
  const snail = state.teams.flatMap((t) => t.snails).find((s) => s.id === snailId);
  if (!snail) return reject('UNKNOWN_SNAIL', `unknown snail ${snailId}`);
  if (snailId !== state.turn.activeSnailId) {
    return reject('SNAIL_NOT_ACTIVE', `snail ${snailId} is not the active snail`);
  }
  if (!snail.alive) return reject('SNAIL_DEAD', `snail ${snailId} is dead`);
  return OK;
}

function checkValues(cmd: Command): ValidationResult {
  if (cmd.type === 'move') {
    const d: number = cmd.direction;
    if (d !== -1 && d !== 0 && d !== 1) {
      return reject('INVALID_VALUE', 'direction must be -1, 0 or 1');
    }
  } else if (cmd.type === 'aim') {
    if (!Number.isFinite(cmd.angle)) return reject('INVALID_VALUE', 'angle must be finite');
    if (cmd.facing !== undefined && !Number.isFinite(cmd.facing)) {
      return reject('INVALID_VALUE', 'facing must be finite');
    }
    if (!Number.isFinite(cmd.power) || cmd.power < 0 || cmd.power > 1) {
      return reject('INVALID_VALUE', 'power must be within 0..1');
    }
  } else if (cmd.type === 'steer') {
    if (!Number.isFinite(cmd.input) || cmd.input < -1 || cmd.input > 1) {
      return reject('INVALID_VALUE', 'input must be within -1..1');
    }
  }
  return OK;
}

function checkStock(
  state: GameState,
  snailId: string,
  weaponId: string,
  def: Partial<StockedWeapon> | undefined,
): ValidationResult {
  if (def?.ammo === undefined) return OK;
  const team = state.teams.find((t) => t.snails.some((s) => s.id === snailId));
  if (!team) return OK;
  const weapon = { id: weaponId, ammo: def.ammo, requiresTech: def.requiresTech };
  const status = weaponAvailability(team, weapon);
  if (status === 'WEAPON_LOCKED') return reject(status, `${weaponId} is locked (needs research)`);
  if (status === 'NO_AMMO') return reject(status, `${weaponId} is out of ammo`);
  return OK;
}

function allowedPhase(cmd: Command, phase: string): boolean {
  if (cmd.type === 'steer') return phase === 'fire' || phase === 'resolve';
  if (cmd.type === 'aim' || cmd.type === 'fire') return phase === 'action';
  return phase === 'action' || phase === 'retreat';
}

/**
 * Checks a command against the current state without mutating it.
 * @returns `{ ok: true }` or a rejection with a stable reason code and message.
 */
export function validateCommand(
  state: GameState,
  cmd: Command,
  ctx: ValidationContext = {},
): ValidationResult {
  if (state.match.status !== 'playing') return reject('MATCH_OVER', 'the match is over');
  if (cmd.type === 'queueResearch' || cmd.type === 'cancelResearch') {
    // Placeholder until M5-03 adds research validation (any team, any phase).
    return reject('WRONG_PHASE', 'research commands are not handled yet');
  }
  const { turn } = state;
  if (ctx.issuerTeamId !== undefined && ctx.issuerTeamId !== turn.activeTeamId) {
    return reject('NOT_YOUR_TURN', `team ${ctx.issuerTeamId} is not the active team`);
  }
  if (cmd.type === 'endTurn') {
    if (cmd.teamId !== turn.activeTeamId) {
      return reject('NOT_YOUR_TURN', `team ${cmd.teamId} is not the active team`);
    }
  } else {
    const snail = checkSnail(state, cmd.snailId);
    if (!snail.ok) return snail;
  }
  if (!allowedPhase(cmd, turn.phase)) {
    return reject('WRONG_PHASE', `${cmd.type} is not allowed in phase ${turn.phase}`);
  }
  const values = checkValues(cmd);
  if (!values.ok) return values;
  if (cmd.type === 'fire') {
    if (ctx.weapons && !ctx.weapons.has(cmd.weaponId)) {
      return reject('UNKNOWN_WEAPON', `unknown weapon ${cmd.weaponId}`);
    }
    if (turn.fired) return reject('ALREADY_FIRED', 'a shot was already fired this turn');
    const def = ctx.weapons?.get?.(cmd.weaponId);
    if (def && (turn.uses?.[cmd.weaponId] ?? 0) >= usesPerTurn(def)) {
      return reject('NO_USES_LEFT', `${cmd.weaponId} has no uses left this turn`);
    }
    const stock = checkStock(state, cmd.snailId, cmd.weaponId, def);
    if (!stock.ok) return stock;
  }
  return OK;
}
