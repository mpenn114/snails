import { z } from 'zod';
import { Colour, CpuDifficulty, CpuPersonality, MatchSettings, Role, TeamId } from './common.js';

/**
 * First message after connecting. `protocolVersion` accepts any number so a mismatch is
 * reportable (see `checkHello`) instead of being a parse failure.
 */
export const ClientHello = z.object({
  type: z.literal('hello'),
  role: Role,
  name: z.string().min(1).max(32),
  /** Omitted by a display that wants a new room. */
  roomCode: z.string().min(1).max(16).optional(),
  protocolVersion: z.number(),
  /** Token from a previous welcome, to rejoin as the same player. */
  sessionToken: z.string().min(1).max(128).optional(),
});

/** Lobby actions. */
export const CreateRoom = z.object({ type: z.literal('createRoom') });
export const SetTeam = z.object({ type: z.literal('setTeam'), teamId: TeamId });
/** Toggles membership of a team without leaving others (hot-seat: one phone, several teams). */
export const ToggleTeam = z.object({ type: z.literal('toggleTeam'), teamId: TeamId });
export const SetColour = z.object({ type: z.literal('setColour'), colour: Colour });
export const SetReady = z.object({ type: z.literal('setReady'), ready: z.boolean() });
/** Host-only: changes the lobby's match settings (shown live on the display). */
export const SetSettings = z.object({ type: z.literal('setSettings'), settings: MatchSettings });
/** Host-only: adds a CPU team to the lobby. */
export const AddCpu = z.object({
  type: z.literal('addCpu'),
  difficulty: CpuDifficulty,
  personality: CpuPersonality,
});
/** Host-only: removes a CPU team from the lobby. */
export const RemoveCpu = z.object({ type: z.literal('removeCpu'), teamId: TeamId });
export const StartMatch = z.object({ type: z.literal('startMatch'), settings: MatchSettings });

/**
 * Optional client sequence number on every intent (latency instrumentation, M3-30). When present the
 * server answers with `ack {seq, serverTick}` after applying the intent. Absent = no ack.
 */
export const IntentSeq = z.number().int().nonnegative().optional();

/** Controller intents. Angles are radians. */
export const Move = z.object({
  type: z.literal('move'),
  direction: z.enum(['left', 'right', 'stop']),
  /** Steering input -1..1 (positive = counter-clockwise from above); omitted = no turning. */
  turn: z.number().min(-1).max(1).optional(),
  seq: IntentSeq,
});
export const Jump = z.object({ type: z.literal('jump'), seq: IntentSeq });
export const Aim = z.object({
  type: z.literal('aim'),
  angle: z.number().min(-Math.PI).max(Math.PI),
  power: z.number().min(0).max(1),
  seq: IntentSeq,
});
/** Steering input for the active player's guided projectile, -1 (left) .. 1 (right). */
export const Steer = z.object({
  type: z.literal('steer'),
  input: z.number().min(-1).max(1),
  seq: IntentSeq,
});
export const SelectWeapon = z.object({
  type: z.literal('selectWeapon'),
  weaponId: z.string(),
  seq: IntentSeq,
});
export const Fire = z.object({ type: z.literal('fire'), seq: IntentSeq });
export const EndTurn = z.object({ type: z.literal('endTurn'), seq: IntentSeq });
/** Queues a tech for the sender's team (any phase; the sim validates tiers and Calcium). */
export const QueueResearch = z.object({
  type: z.literal('queueResearch'),
  techId: z.string().min(1),
  seq: IntentSeq,
});
/** Removes a queued tech or cancels the active one (refunds 50% of what was paid). */
export const CancelResearch = z.object({
  type: z.literal('cancelResearch'),
  techId: z.string().min(1),
  seq: IntentSeq,
});

/** Heartbeat; `t` is an opaque client timestamp echoed by `pong`. */
export const Ping = z.object({ type: z.literal('ping'), t: z.number() });

/** Any message a client may send. */
export const ClientMessage = z.discriminatedUnion('type', [
  ClientHello,
  CreateRoom,
  SetTeam,
  ToggleTeam,
  SetColour,
  SetReady,
  SetSettings,
  AddCpu,
  RemoveCpu,
  StartMatch,
  Move,
  Jump,
  Aim,
  Steer,
  SelectWeapon,
  Fire,
  EndTurn,
  QueueResearch,
  CancelResearch,
  Ping,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;
export type ClientHello = z.infer<typeof ClientHello>;

/** Parses an unknown value as a client message; throws a ZodError on failure. */
export function parseClientMessage(raw: unknown): ClientMessage {
  return ClientMessage.parse(raw);
}
