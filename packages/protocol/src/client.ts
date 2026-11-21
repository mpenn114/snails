import { z } from 'zod';
import { PROTOCOL_VERSION } from './version.js';

/** First message a client sends after connecting. */
export const ClientHello = z.object({
  type: z.literal('hello'),
  role: z.enum(['controller', 'display']),
  name: z.string().min(1).max(32),
  roomCode: z.string().min(1).max(16),
  protocolVersion: z.literal(PROTOCOL_VERSION),
});

/** Controller intents. */
export const Move = z.object({ type: z.literal('move'), direction: z.enum(['left', 'right', 'stop']) });
export const Jump = z.object({ type: z.literal('jump') });
export const Aim = z.object({
  type: z.literal('aim'),
  angle: z.number().min(-180).max(180),
  power: z.number().min(0).max(1),
});
export const SelectWeapon = z.object({ type: z.literal('selectWeapon'), weaponId: z.string() });
export const Fire = z.object({ type: z.literal('fire') });
export const EndTurn = z.object({ type: z.literal('endTurn') });
export const QueueResearch = z.object({ type: z.literal('queueResearch'), technologyId: z.string() });

/** Any message a client may send. */
export const ClientMessage = z.discriminatedUnion('type', [
  ClientHello,
  Move,
  Jump,
  Aim,
  SelectWeapon,
  Fire,
  EndTurn,
  QueueResearch,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;
export type ClientHello = z.infer<typeof ClientHello>;

/** Parses an unknown value as a client message; throws a ZodError on failure. */
export function parseClientMessage(raw: unknown): ClientMessage {
  return ClientMessage.parse(raw);
}
