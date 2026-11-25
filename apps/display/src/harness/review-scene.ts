import type { Vec3 } from '@snails/core';
import type { MatchRenderer } from '@snails/render';

/** Review scenes (`?review=`): rows of snails for readability checks. */
export type ReviewKind = 'tiers' | 'cracks';

/** Shell materials shown by `?review=tiers`, left to right (null = plain team shell). */
const TIER_ROW = [null, 'chalky', 'calcified', 'iron', 'crystal'] as const;
/** Health ratios shown by `?review=cracks`, left to right. */
const CRACK_RATIOS = [1, 0.7, 0.4, 0.15] as const;
/** Distance between neighbouring snails (world units). */
const SPACING = 1.5;

/** Parses `?review=`. */
export function reviewKind(params: URLSearchParams): ReviewKind | null {
  const v = params.get('review');
  return v === 'tiers' || v === 'cracks' ? v : null;
}

/** Teams to create for a review scene (one snail each). */
export function reviewTeamCount(kind: ReviewKind): number {
  return kind === 'tiers' ? TIER_ROW.length : CRACK_RATIOS.length;
}

/** The slice of the sim the review scene edits. */
export interface ReviewSim {
  state: {
    teams: {
      id: string;
      snails: { position: Vec3; facing: number; health: number; maxHealth: number }[];
    }[];
  };
  terrain: { isSolid(p: Vec3): boolean };
}

/** Surface height under (x, z), probing down from above `y`. */
function groundY(sim: ReviewSim, x: number, y: number, z: number): number {
  for (let h = y + 3; h > y - 6; h -= 0.05) if (sim.terrain.isSolid({ x, y: h, z })) return h;
  return y;
}

/**
 * Lines the first snail of each team up on the terrain beside the first snail's spot (facing +x),
 * sets health for the crack row, grants one fake tech per team for the tier row, and returns the
 * camera eye and look point (front-on, so the shell side shows).
 */
export function setupReview(
  kind: ReviewKind,
  sim: ReviewSim,
  renderer: MatchRenderer,
): { eye: Vec3; look: Vec3 } {
  const snails = sim.state.teams.map((t) => t.snails[0]);
  const base = snails[0]?.position ?? { x: 0, y: 0, z: 0 };
  const n = snails.length;
  const x0 = base.x - ((n - 1) * SPACING) / 2;
  snails.forEach((s, i) => {
    if (!s) return;
    const x = x0 + i * SPACING;
    s.position = { x, y: groundY(sim, x, base.y, base.z), z: base.z };
    s.facing = 0;
    if (kind === 'cracks') s.health = Math.max(1, Math.round(s.maxHealth * (CRACK_RATIOS[i] ?? 1)));
  });
  if (kind === 'tiers') {
    renderer.setTechVisuals((id) => {
      const m = TIER_ROW[Number(id)];
      return m ? { shellMaterial: m } : undefined;
    });
    renderer.setResearchTeams(
      sim.state.teams.map((t, i) => ({ id: t.id, researched: [String(i)] })),
    );
  }
  const look = { x: base.x, y: base.y + 0.55, z: base.z };
  // Portrait viewports (phone proxy) see less width: back the camera off to keep the row in frame.
  const aspect = typeof window === 'undefined' ? 16 / 9 : window.innerWidth / window.innerHeight;
  const back = (n * 0.75 + 1.4) * Math.max(1, 16 / 9 / aspect);
  return { eye: { x: look.x, y: look.y + 0.5, z: look.z + back }, look };
}
