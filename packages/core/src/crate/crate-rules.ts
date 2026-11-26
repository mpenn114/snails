/** Crate radius (half the box edge) in metres; used for terrain contact and pickup reach. */
export const CRATE_RADIUS = 0.4;
/** Gravity pulling a falling crate (m/s^2) before the leaf parachute caps its speed. */
export const CRATE_GRAVITY = 9.8;
/** Terminal fall speed (m/s) under the leaf parachute: slow and gentle. */
export const PARACHUTE_SPEED = 2.5;
/** A snail within this distance (m, centre to centre; snail 0.5 + crate 0.4 + slack) of a crate collects it. */
export const PICKUP_RADIUS = 1.5;
/** Crates appear this high (m) above their landing spot, clamped to the world top. */
export const DROP_HEIGHT = 14;
/** Landing spots must be at least this far (m) above the water line. */
export const MIN_ABOVE_WATER = 1.5;
/** Landing spots keep this horizontal distance (m) from any living snail. */
export const MIN_SNAIL_DISTANCE = 3.5;
/** Landing spots keep this horizontal distance (m) from other crates. */
export const MIN_CRATE_DISTANCE = 4;
/** Landing spots need a ground normal at least this vertical (flat is 1). */
export const MIN_SURFACE_NORMAL_Y = 0.8;
/** Placement attempts per drop before giving up for this turn. */
export const PLACEMENT_ATTEMPTS = 40;
/** Health lost to the bad "damage" mystery outcome (never lethal). */
export const MYSTERY_DAMAGE = 15;

/** Match rules for crate drops. */
export interface CrateRules {
  /** A crate drops at the start of every `intervalRounds`-th round (default 3). */
  intervalRounds: number;
  /** No drop while this many crates are on the map (default 2). */
  maxOnMap: number;
}

/** Default crate rules (game design: every 3 rounds, up to 2 on the map). */
export const DEFAULT_CRATE_RULES: CrateRules = { intervalRounds: 3, maxOnMap: 2 };
