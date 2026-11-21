/** 3D vector. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Shell state of a snail. */
export interface Shell {
  upgradeId: string | null;
  colour: string;
}

/** A single snail. */
export interface Snail {
  id: string;
  teamId: string;
  name: string;
  position: Vec3;
  health: number;
  maxHealth: number;
  shell: Shell;
}

/** A team of snails. */
export interface Team {
  id: string;
  name: string;
  colour: string;
  snails: Snail[];
  researched: string[];
}

/** Top-level game state. */
export interface GameState {
  tick: number;
  seed: number;
  wind: number;
  teams: Team[];
}
