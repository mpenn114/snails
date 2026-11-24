import { z } from 'zod';

const V = z.object({ x: z.number(), y: z.number(), z: z.number() });
const int = z.number().int();
const ids = z.array(int);
const phase = z.enum(['intro', 'action', 'fire', 'resolve', 'retreat', 'settle']);
const region = z.object({ min: V, max: V });
const fallen = z.object({
  cellCount: z.number(),
  dropCells: z.number(),
  dropMetres: z.number(),
  bounds: region,
});

/** Shared fields of the two terrain events whose id lists are delta-encoded on the wire. */
const collapsedBase = {
  type: z.literal('terrainCollapsed'),
  removedCells: z.number(),
  fallen: z.array(fallen),
};

/** Events that need no wire transformation (structurally identical to core's `SimEvent`). */
const plain = [
  z.object({ type: z.literal('tick'), tick: int }),
  z.object({
    type: z.literal('turnStarted'),
    teamId: z.string().nullable(),
    snailId: z.string().nullable(),
    turnNumber: int,
  }),
  z.object({ type: z.literal('turnEnded'), teamId: z.string().nullable(), turnNumber: int }),
  z.object({ type: z.literal('phaseChanged'), from: phase, to: phase }),
  z.object({ type: z.literal('windChanged'), strength: z.number(), direction: z.number() }),
  z.object({
    type: z.literal('matchEnded'),
    status: z.enum(['playing', 'won', 'draw']),
    winnerTeamId: z.string().optional(),
  }),
  z.object({
    type: z.literal('projectileFired'),
    projectileId: z.string(),
    weaponId: z.string(),
    snailId: z.string(),
    position: V,
    velocity: V,
  }),
  z.object({
    type: z.literal('projectileHit'),
    projectileId: z.string(),
    position: V,
    normal: V,
    weaponId: z.string(),
    ownerSnailId: z.string(),
    snailId: z.string().optional(),
  }),
  z.object({
    type: z.literal('projectileExpired'),
    projectileId: z.string(),
    position: V,
    reason: z.enum(['fuse', 'bounds']),
  }),
  z.object({
    type: z.literal('explosion'),
    position: V,
    radius: z.number(),
    weaponId: z.string(),
  }),
  z.object({
    type: z.literal('snailDamaged'),
    snailId: z.string(),
    amount: z.number(),
    remaining: z.number(),
    sourceSnailId: z.string().nullable(),
    cause: z.enum(['explosion', 'fall', 'status', 'area', 'crate']),
  }),
  z.object({
    type: z.literal('snailDied'),
    snailId: z.string(),
    teamId: z.string(),
    cause: z.enum(['explosion', 'fall', 'drown', 'void', 'status', 'area']),
  }),
  z.object({ type: z.literal('snailDrowned'), snailId: z.string() }),
  z.object({
    type: z.literal('snailLanded'),
    snailId: z.string(),
    impactSpeed: z.number(),
    fallDistance: z.number(),
  }),
  z.object({
    type: z.literal('commandRejected'),
    command: z.enum(['move', 'aim', 'steer', 'fire', 'endTurn']),
    reason: z.string(),
  }),
  z.object({
    type: z.literal('statusApplied'),
    snailId: z.string(),
    statusId: z.string(),
    turnsLeft: int,
    magnitude: z.number(),
    sourceSnailId: z.string(),
  }),
  z.object({ type: z.literal('statusExpired'), snailId: z.string(), statusId: z.string() }),
  z.object({
    type: z.literal('areaCreated'),
    areaId: z.string(),
    kind: z.string(),
    position: V,
    radius: z.number(),
    turnsLeft: int,
  }),
  z.object({ type: z.literal('areaExpired'), areaId: z.string(), kind: z.string() }),
  z.object({ type: z.literal('areaMoved'), areaId: z.string(), position: V }),
  z.object({ type: z.literal('snailMoved'), snailId: z.string(), from: V, to: V }),
  z.object({
    type: z.literal('crateSpawned'),
    crateId: z.string(),
    defId: z.string(),
    position: V,
  }),
  z.object({
    type: z.literal('crateCollected'),
    crateId: z.string(),
    defId: z.string(),
    snailId: z.string(),
    position: V,
    healed: z.number(),
    damage: z.number(),
    weapons: z.array(z.object({ weaponId: z.string(), count: z.number() })),
    statusId: z.string().optional(),
  }),
  z.object({
    type: z.literal('crateDestroyed'),
    crateId: z.string(),
    position: V,
    reason: z.enum(['explosion', 'water']),
  }),
] as const;

const carvedBase = {
  type: z.literal('terrainCarved'),
  centre: V,
  radius: z.number(),
  power: z.number().optional(),
};

/** A simulation event as consumers see it (same shape as core's `SimEvent`). */
export const SimEventData = z.discriminatedUnion('type', [
  ...plain,
  z.object({ ...carvedBase, chunks: ids }),
  z.object({
    ...collapsedBase,
    chunks: ids,
    cellIndices: ids,
    cellValues: z.array(z.number()),
  }),
]);
/** A simulation event as consumers see it. */
export type SimEventData = z.infer<typeof SimEventData>;

/** A simulation event as sent on the wire: sorted id lists are delta-encoded. */
export const WireEvent = z.discriminatedUnion('type', [
  ...plain,
  z.object({ ...carvedBase, chunkDeltas: ids }),
  z.object({
    ...collapsedBase,
    chunkDeltas: ids,
    cellDeltas: ids,
    cellValues: z.array(z.number()),
  }),
]);
/** Wire form of a simulation event. */
export type WireEvent = z.infer<typeof WireEvent>;

/** Batch of simulation events produced by one or more ticks. */
export const EventBatch = z.object({
  type: z.literal('eventBatch'),
  tick: int.nonnegative(),
  events: z.array(WireEvent),
});
/** Event batch message. */
export type EventBatch = z.infer<typeof EventBatch>;

/** Delta-encodes an ascending id list (first value kept as is). */
export function deltaEncode(values: readonly number[]): number[] {
  return values.map((v, i) => (i === 0 ? v : v - (values[i - 1] as number)));
}

/** Inverse of {@link deltaEncode}. */
export function deltaDecode(deltas: readonly number[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const d of deltas) {
    acc += d;
    out.push(acc);
  }
  return out;
}

function encodeEvent(e: SimEventData): WireEvent {
  if (e.type === 'terrainCarved') {
    const { chunks, ...rest } = e;
    return { ...rest, chunkDeltas: deltaEncode(chunks) };
  }
  if (e.type === 'terrainCollapsed') {
    const { chunks, cellIndices, ...rest } = e;
    return { ...rest, chunkDeltas: deltaEncode(chunks), cellDeltas: deltaEncode(cellIndices) };
  }
  return e;
}

function decodeEvent(e: WireEvent): SimEventData {
  if (e.type === 'terrainCarved') {
    const { chunkDeltas, ...rest } = e;
    return { ...rest, chunks: deltaDecode(chunkDeltas) };
  }
  if (e.type === 'terrainCollapsed') {
    const { chunkDeltas, cellDeltas, ...rest } = e;
    return { ...rest, chunks: deltaDecode(chunkDeltas), cellIndices: deltaDecode(cellDeltas) };
  }
  return e;
}

/** Builds an event batch message. Chunk and cell index lists must be ascending. */
export function encodeEventBatch(tick: number, events: readonly SimEventData[]): EventBatch {
  return { type: 'eventBatch', tick, events: events.map(encodeEvent) };
}

/** Expands a batch back into simulation events. */
export function decodeEventBatch(batch: EventBatch): SimEventData[] {
  return batch.events.map(decodeEvent);
}
