# Snails: CPU Players

CPU teams let one human play alone, fill empty seats and give the balance team a tireless sparring
partner. The AI lives in `@snails/ai` and depends only on `@snails/core`; it plays through the
same command interface as phones, so it cannot cheat by touching state.

## Architecture

```ts
interface CpuPlayer {
  readonly personality: Personality;
  readonly difficulty: Difficulty;
  /** Plan a complete turn from a read-only snapshot. May be async (time-sliced). */
  planTurn(view: SimView, budget: ThinkBudget): Promise<TurnPlan>;
  /** Choose research while waiting or at turn start. */
  planResearch(view: SimView): ResearchCommand[];
}
```

- `SimView` is the same fog-respecting view a human gets (no peeking at hidden research unless
  the Scouting Mist tech is owned).
- `TurnPlan` is an ordered list of commands (move, jump, switch weapon, aim, fire, retreat) that
  the server feeds to the match with human-like pacing.
- The core simulation is deterministic and has no DOM or Node dependencies
  (ADR-0004), so the AI clones the state (`sim.fork()`), applies a candidate command, and steps the
  fixed timestep with the same seeded wind to **look ahead**. The server runs AI in a worker
  thread so it never stalls the tick loop.
- A `ThinkBudget` caps simulated shots per turn (see difficulty).

## Turn planning pipeline

1. **Enumerate targets** (enemy snails, crates, zone).
2. **Enumerate positions** reachable within the move budget (flood fill over the terrain surface
   with slope and slime-trail costs).
3. **For each (position, weapon) candidate** run the aiming solver.
4. **Score** the results; pick the best.
5. **Emit the plan:** move, aim, fire, then a retreat move to a safe cell.

## Aiming solver

For a given shooter position, target and weapon:

1. Start with a ballistic guess ignoring wind: closed-form angle for a flat-ground range.
2. Sample `(angle, power)` on a grid around the guess (e.g. 9 x 7 samples) and a coarse global
   grid if the guess hits a wall.
3. For each sample, **simulate** the projectile with real gravity, wind and terrain using the
   core stepper; stop at impact or fuse.
4. Score each outcome with an explosion model:

```
score = sum over snails in blast radius:
          expectedDamage(snail) * value(snail)      // enemy positive, ally and self negative
        + terrainValue                               // dropping a floor under an enemy
        + killBonus + knockbackIntoWaterBonus
        - selfRisk * 1.5 - allyRisk * 1.0
```

5. Refine the best 3 samples by hill-climbing with a smaller step.
6. Add **aim noise** per difficulty before committing (Gaussian on angle and power).

Weapon-specific handling: bouncing weapons sample the roll; guided ones sample a steering
profile; area weapons rank by lingering value; diggers aim at supports; utility tools (rope,
mail) use movement planning instead.

## Target selection

Value of a target = `threat * killChance * resourceValue`:
- Threat: damage and unlocked weapons (read from visible shell upgrades).
- Kill chance: low health targets first; Crystal or high armour tiers deprioritised unless
  Salt or Spore (armour-ignoring) are in stock.
- Resource value: snails carrying a crate-adjacent spot; research leaders in Research race.
- Mode terms: in King of the Hill, snails in the zone have a huge multiplier.
- Personalities weight these (below). Revenge memory: +20% on whoever hit it last turn.

## Movement planning

- Reachable set from flood fill over crawl, climb and jump arcs, within move budget.
- Candidate positions are scored by: shot value from there, **cover** (line-of-sight exposure to
  enemies, depth into terrain), **fall and water risk**, **collapse risk** (own explosion
  undermining), crate proximity and the zone.
- Retreat position: after firing, move to the cell with the lowest enemy expected damage within the
  remaining Retreat time, or pull into the shell if no safe cell exists.
- Avoid own slime trail dead ends; prefer climbing to reach high ground, since snails climb well.

## Weapon choice

For each unlocked weapon with stock, run the solver and compare `score / cost`, where cost values
rare stock (Beetle Barrage is saved for kills or clusters). Rules:
- Never use a weapon with predicted self damage over 30% of health unless it kills.
- Digger and utility are chosen when no attack score exceeds a threshold, e.g. to reach a crate or
  flee salt.
- A small epsilon randomness picks the second-best option (variety).

## Research strategy

Each personality has a **build order**: a prioritised list of tech ids and a fallback scoring
function (tier-aware, cost-aware, counter-picks).

| Personality | Order sketch |
|---|---|
| Aggressive | Salt Mining, Sticky Slime, Heavy Pebbles, Lubricated Foot, Spiked Whorl, Beetle Calls, Great Spiral: Arsenal |
| Cautious | Calcified Shell, Iron Plating, Regrowth, Weather Vane, Crystal Lattice, Great Spiral: Citadel |
| Opportunist | Weather Vane, Eye Stalk Optics, Egg Hunt, Calcified Shell, Scouting Mist, Snail Mail, Oracle capstone |

Fallback scoring is `value(effect) / cost`, with counters: opponents going Iron makes it prefer
Salt and Spore; opponents with scouts make it prefer Calcified. Because techs are data, the AI reads
effects from definitions ([technology-research.md](technology-research.md)); modded techs get a
generic valuation from their stat modifiers.

## Difficulty levels

| Level | Aim noise (angle, power) | Samples per turn | Hit rate (18 m, within 2 m) | Other |
|---|---|---|---|---|
| Rookie | 2.5 degrees, 4% | 250 | about 15% | Ignores wind 40%; moves 15% of the time when it has no good shot. |
| Regular | 2 degrees, 4% | 400 | about 50% | Uses wind; moves 60% of the time when it has no good shot. |
| Veteran | 1.2 degrees, 4% | 500 | about 85% | Always considers movement (20 candidate scripts). |
| Mastermind | 0.3 degrees, 1% | 1500 | 100% | Two-turn lookahead (own shot then predicted replies). |

The hit rates are asserted (with slack) in `packages/ai/src/cpu/planner.test.ts`. In 20-match
`pnpm sim:ai` runs (opportunist mirror): Mastermind beat Rookie 20-0, Veteran beat Regular 18-2 and
Mastermind beat Veteran 15-5. Sample counts also limit accuracy: with too few samples the solver
cannot find a good aim, so noise alone does not set a level's strength.

Think time is artificial pacing: the plan is computed quickly but played back with human-like
delays so players can follow what the CPU does. The display shows "thinking" stalks wiggling.
Time-slicing keeps the worker under a per-turn CPU limit (default 200 ms) even on weak hosts.

## Personalities

- **Aggressive:** `aggression` 1.4, `caution` 0.6, kill bonus 70, tolerates self damage up to 25%
  of health, retreats after 20% of shots.
- **Cautious:** `aggression` 0.9, `caution` 1.6, tolerates only 5% self damage, retreats after 90%
  of shots.
- **Opportunist:** balanced combat weights with the highest `greed` (1.5): when no good shot exists
  it picks reposition spots near crates. Retreats after 50% of shots.
- Personality is a bag of weights and a build order, defined as data so mods can add more.
  `aggression`, `caution` and `killBonus` feed shot scoring. `revenge` multiplies the value of
  damaging the team that last hit one of our snails (`Snail.lastHitByTeam`). `greed` adds a
  movement-score bonus within 12 m of a landed crate. `retreatChance` decides whether the plan
  carries retreat moves.
- **Retreat:** `TurnPlan.retreat` holds moves with ticks relative to the start of the retreat phase
  (after the shot resolves). The brain plans them on a fork after the predicted shot with
  `planRetreat`; the headless runner and the server's CPU driver deliver them when the phase
  becomes `retreat`. Over 20 veteran matches each: Aggressive 8-12 vs Cautious, Aggressive 11-9 vs
  Opportunist, Cautious 6-14 vs Opportunist.

## Testing the AI

- **Headless matches:** `pnpm --filter @snails/ai sim --matches 500` runs seeded AI vs AI games
  with no renderer or network, in parallel workers, logging winners, turn counts and per-tech use.
- **Determinism test:** same seed and same AIs give identical results.
- **Solver tests:** known set-ups (flat ground, wall, wind) assert the AI hits within a tolerance
  at Veteran and above.
- **Regression gates in CI:** no match exceeds a turn cap (stalemate), no infinite loops, think time
  p99 under budget, and Mastermind beats Rookie in at least 90% of matches.
- **Balance reports:** the same runs feed the tech balance targets in
  [technology-research.md](technology-research.md).
- **Fuzzing:** random weapons, maps and settings catch crashes in `planTurn`.
- Failures reproduce with the printed seed, replayed in the display for debugging.
