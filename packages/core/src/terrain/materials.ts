import { z } from 'zod';

/** Lowest allowed carve resistance (negative = carves more than nominal). */
export const MIN_CARVE_RESISTANCE = -0.5;

/** Schema of a terrain material (per-cell ground type with its own carve behaviour). */
export const TerrainMaterialSchema = z.object({
  /** Stable string id, e.g. `soil`. */
  id: z.string().min(1),
  /** Display name. */
  name: z.string().min(1),
  /**
   * Carve resistance: the effective carve radius in this material is
   * `radius * (1 - carveResistance)`. 0 = normal, 0.5 = half radius, negative = carves more.
   */
  carveResistance: z.number().min(MIN_CARVE_RESISTANCE).max(1),
  /** Cells of this material are untouched by carves whose damage power is below this value. */
  indestructibleBelowDamage: z.number().nonnegative().optional(),
  /** True if landing on it counts as soft (halves fall damage). */
  softLanding: z.boolean().optional(),
  /** Render hint colour (hex RGB); the renderer may refine it. */
  colour: z.number().int().min(0).max(0xffffff),
});

/** A validated terrain material definition. */
export type TerrainMaterialDefinition = z.infer<typeof TerrainMaterialSchema>;

/** Validates and freezes a material definition; throws a descriptive error on bad data. */
export function defineTerrainMaterial(def: unknown): TerrainMaterialDefinition {
  const parsed = TerrainMaterialSchema.safeParse(def);
  if (!parsed.success) {
    const id = (def as { id?: unknown } | null)?.id;
    throw new Error(`Invalid terrain material ${String(id)}: ${parsed.error.message}`);
  }
  return Object.freeze(parsed.data);
}

/** Base materials. The array index is the per-cell material id stored in the grid. */
export const BASE_TERRAIN_MATERIALS: readonly TerrainMaterialDefinition[] = [
  { id: 'soil', name: 'Soil', carveResistance: 0, colour: 0x946a48 },
  { id: 'sand', name: 'Sand', carveResistance: -0.2, softLanding: true, colour: 0xd8c27a },
  { id: 'clay', name: 'Clay', carveResistance: 0.5, colour: 0xb4684a },
  {
    id: 'rock',
    name: 'Stone',
    carveResistance: 0.8,
    indestructibleBelowDamage: 30,
    colour: 0x9a968c,
  },
].map(defineTerrainMaterial);

/** Per-cell material index of soil (the default fill). */
export const MATERIAL_SOIL = 0;
/** Per-cell material index of sand. */
export const MATERIAL_SAND = 1;
/** Per-cell material index of clay. */
export const MATERIAL_CLAY = 2;
/** Per-cell material index of rock. */
export const MATERIAL_ROCK = 3;

/** Index of a material id in a table, or -1. */
export function materialIndex(table: readonly TerrainMaterialDefinition[], id: string): number {
  return table.findIndex((m) => m.id === id);
}

/** Largest effective-radius factor in a table (bounds the carve scan box). */
export function maxCarveScale(table: readonly TerrainMaterialDefinition[]): number {
  return table.reduce((m, d) => Math.max(m, 1 - d.carveResistance), 1);
}
