# Snails: Technology and Research

Research is the strategic layer between turns. It turns a duel into a build: you decide what kind
of snail army you are becoming, and everyone can see it on your shells.

## Resource economy

One resource, **Calcium**, because shells are made of it. Simple enough to track on a phone.

| Source | Default amount | Notes |
|---|---|---|
| Per turn (per team) | +10 | Base income at the start of the team's turn. |
| Damage dealt | +1 per 5 damage (cap 15/turn) | Rewards aggression; cap stops one-shot spam. |
| Kills | +10 | Bonus for finishing a snail. |
| Calcium crates | +25 | Placed in contested spots. |
| Egg Hunt (utility tech) | +5 per turn | Passive. |
| Catch-up bonus | up to +10 | For teams behind in total health (see anti-snowball). |

Calcium is banked, not spent directly. It converts into **Research Points (RP)** when a tech is
queued (cost shown on the card). Simplification for v1: Calcium is the RP; techs just cost Calcium.
The two-step split is kept in the data model so other modes can introduce a separate RP source.

## Research flow

1. At the start of your turn (and while you wait) you may queue up to 2 techs from the phone.
2. A tech has a **cost** (Calcium) and **research time** in team turns (1 to 3). Calcium is paid
   when work begins; one tech is active at a time, the rest wait in the queue.
3. The research screen is private. Opponents see only an "researching..." shimmer on your shell
   and the finished result (reveal on completion).
4. Completing a tech fires `researchCompleted`: the shell gets a visible change, a stinger plays on
   the display and weapons or perks unlock.
5. Queue edits are free until work begins; cancelling in progress refunds 50%.
6. Rules as built (`packages/core/src/research/`): queueing starts an idle team's tech at once
   when affordable (so a 1-turn tech queued in your turn completes at your next turn start). Each
   own turn start counts the active tech down, completes it (it counts immediately), then starts
   the first valid, affordable queued tech in the same turn start. Queue checks count completed,
   active and queued techs as "will have" (tier N needs N-1 techs, all `prerequisites`, one
   `anyOf`, one capstone, max 2 waiting); a queued tech that is invalid when it would start is
   dropped with `researchCancelled` (refund 0). Fast mode: cost x0.5 rounded up, turns -1 (min 1).
   Research commands are accepted from the issuing team in any phase.

See [controller-ux.md](controller-ux.md) for the research screen.

## Tiers and branches

- **Tiers 1 to 4.** Tier N needs at least N-1 techs completed in total, plus the listed prerequisite.
- **Four branches:** Weaponry, Shell and Armour, Mobility, Utility and Intel.
- **Specialisation:** Tier 4 "capstone" techs are limited to one per team (tied to the Research race).
- Each team has a flat tech tree; branches are not linear. Prerequisites are explicit.

### Weaponry

| Tech | Tier | Cost | Effect | Prereq |
|---|---|---|---|---|
| Salt Mining | 1 | 20 | Unlocks Salt Shaker (3 stock). | none |
| Sticky Slime | 1 | 25 | Unlocks Slime Grenade; slime goo radius +0.5 m. | none |
| Heavy Pebbles | 2 | 40 | Pebble Toss +25% damage and radius. | Salt Mining or Sticky Slime |
| Radula Guidance | 2 | 50 | Unlocks Radula Missile (2 stock). | Sticky Slime |
| Beetle Calls | 3 | 80 | Unlocks Beetle Barrage (1 stock, +1 every 4 rounds). | Heavy Pebbles |

### Shell and Armour

Each of these changes the shell visibly (materials; see [snail-visuals.md](snail-visuals.md)).

| Tech | Tier | Cost | Effect | Prereq |
|---|---|---|---|---|
| Calcified Shell | 1 | 25 | Shell material chalky to calcified. +15 max health; heals 15 now. | none |
| Spiked Whorl | 2 | 45 | Spikes on shell. Melee attackers take 10 damage; Shell Bash +30% damage. | Calcified Shell |
| Iron Plating | 2 | 50 | Shell material iron. -20% blast damage; +10 HP. | Calcified Shell |
| Crystal Lattice | 3 | 85 | Crystal shell. Retreat blocks 80% damage; reflects 10% of a projectile's damage. | Iron Plating |
| Regrowth | 3 | 70 | Cracks mend: heals 5 HP per turn if the snail did not move. | Calcified Shell |

### Mobility

| Tech | Tier | Cost | Effect | Prereq |
|---|---|---|---|---|
| Lubricated Foot | 1 | 20 | Move budget +3 s; crawl speed +15%. | none |
| Sticky Climb | 1 | 25 | Climb slopes up to 80 degrees. | none |
| Hop Training | 2 | 40 | +1 jump charge; jumps 30% longer. | Lubricated Foot |
| Slime Rope | 2 | 45 | Unlocks the Slime Rope tool. | Sticky Climb |
| Burrow | 3 | 80 | Once per match, retreat underground and resurface up to 10 m away next turn. | Hop Training |

### Utility and Intel

| Tech | Tier | Cost | Effect | Prereq |
|---|---|---|---|---|
| Eye Stalk Optics | 1 | 20 | Aim preview shows the full arc with wind (base shows partial). | none |
| Weather Vane | 1 | 20 | Next turn's wind is shown in advance. | none |
| Egg Hunt | 2 | 40 | +5 Calcium per turn; crate locations revealed in fog. | Weather Vane |
| Scouting Mist | 2 | 45 | See opponents' queued research and weapon stock. | Eye Stalk Optics |
| Snail Mail | 3 | 75 | Unlocks Snail Mail teleport (see [game-design.md](game-design.md)). | Egg Hunt |

### Capstones (Tier 4, one per team)

| Tech | Cost | Effect | Prereq |
|---|---|---|---|
| Great Spiral: Arsenal | 150 | Weapons deal +20% and all stocks +1. | Tier 3 Weaponry |
| Great Spiral: Citadel | 150 | Full-health shell: immune to the first hit each turn. | Tier 3 Shell |
| Great Spiral: Glide | 150 | Free movement; no fall damage; one rope per turn. | Tier 3 Mobility |
| Great Spiral: Oracle | 150 | See all hidden info; steal 1 queued tech per round. | Tier 3 Utility |

Any capstone completed counts as the objective in Research race. Implemented as match setting `mode: 'researchRace'` (forces research on, stores the capstone ids in `state.raceCapstones`; the match ends with `reason: 'research'` on `matchEnded`).

## How techs change snails and shells

Each tech may carry a `visual` payload (all data, see [snail-visuals.md](snail-visuals.md)):

- **Material tier:** chalky, calcified, iron, crystal (Shell branch).
- **Attachments:** spikes, plates, a rope coil, an antenna (Utility), wings (Mobility capstone).
- **Glow/aura:** crystal veins, a faint eye-glow when scouting.
- **Sounds:** each tier has a distinct chime so you can hear an upgrade.

Opponents can therefore read a team's strategy from silhouettes: spiky bruiser, glassy tank,
antenna scout.

## Balance levers

- Tech cost, research time, and tier thresholds (global multiplier in match settings:
  Off / Slow / Normal / Fast).
- Calcium income splits: per turn vs damage vs crate.
- Max queue length and concurrency (1 or 2 active).
- Stock caps and replenishment for special weapons.
- Branch exclusivity (limit total techs per branch, e.g. 4 of 5).
- Capstone limit (one per team) and its cost.
- Visibility of research (private, revealed on completion or open).

## Anti-snowball and anti-stalemate

- **Comeback Calcium:** a team with less than 60% of the leader's total health gets up to +10
  Calcium per turn.
- **Diminishing damage income:** damage-based Calcium is capped per turn and per tech tier.
- **Tech costs scale with the leader:** each tech owned by a team makes the next tier +5% pricier
  for that team only (a soft tax on the leader).
- **Golden crates** spawn far from the leader.
- **Counterplay tech:** Salt shaker and Spore Cloud ignore armour tiers partially; Scouting Mist
  lets underdogs target a leader's plan.
- **Sudden death** and mutual Calcium loss for turtling teams: if a team has not damaged anyone for
  5 rounds, its income halves ("Moss Tax").
- **Capture the capstone:** the Oracle can steal techs, making a runaway lead brittle.

As built (`research/anti-snowball.ts`, tunables in `ANTI_SNOWBALL`):

- **Comeback Calcium** (`catchUp`): at its turn start a team under 60% of the leader's total living
  health gets `ceil(10 * (0.6 - own/leader) / 0.6)` Calcium (0 at the threshold, 10 at no health).
- **Cost scaling:** `techCost` is base +5% per tech owned (flat, not per tier), rounded up; fast
  mode halves the scaled price afterwards.
- **Moss Tax:** with `roundsSinceDamage >= 5` the team loses half of the base per-turn income
  (reason `mossTax`, -5, emitted right after `turnIncome`). Tech income (`calciumPerTurn`) is not taxed.
- Damage income stays a flat per-turn cap. Golden crates are later work (no crate exists yet).
- Kill credit is `Snail.lastHitByTeam` in game state, so it survives snapshot restore.

## Data definition

Techs are typed definitions validated by zod and registered in the `ContentRegistry`, never code
branches. Sketch of a definition (the authoritative schema lives in
[extensibility.md](extensibility.md)):

```ts
{
  id: 'base:iron-plating',
  branch: 'shell',
  tier: 2,
  cost: 50,
  researchTurns: 2,
  requires: ['base:calcified-shell'],
  effects: [
    { type: 'modifyStat', stat: 'blastDamageTaken', op: 'mul', value: 0.8 },
    { type: 'modifyStat', stat: 'maxHealth', op: 'add', value: 10 },
  ],
  visual: { shellMaterial: 'iron', attachments: ['plating-light'] },
  nameKey: 'tech.iron-plating.name',
}
```

Effects are a small closed vocabulary (`modifyStat`, `unlockWeapon`, `grantStock`, `addAbility`,
`setFlag`, `hook`) so the AI ([ai.md](ai.md)) and UI can reason about them. The `hook` effect
subscribes to the event bus for rare custom behaviour.

Effects are applied in `packages/core/src/research/`. Continuous effects are derived, never
stored: `teamStat` (adds, then muls), `weaponModifier`, `teamHasFlag`, `teamHasAbility` read
`team.researched` and the registry (`ctx.techs`). One-time effects (`heal`, `maxHealth`,
`unlockWeapon`, `grantStock`) run from the `researchCompleted` event observer; repeating
`grantStock` counts the team's own turns in `research.stockTimers`. `hook` effects look up
`registerTechHook(hookId, fn)`; the hook sees every sim event for teams that completed the tech.
Stat bases: damage stats are multipliers (base 1), `crawlSpeed` m/s, `maxClimbDegrees` degrees
(base 50), `jumpDistance` a multiplier on jump speed, `moveBudgetSeconds` the retreat window,
`calciumPerTurn` Calcium, `stockBonus` extra uses on every finite grant. Not wired yet:
`jumpCharges`, `retreatDamageTaken`, `projectileReflect`, `healPerStillTurn` (content jobs).

## Testing the balance

Headless AI-vs-AI matches (see [ai.md](ai.md)) log win rate per tech and per branch. Targets:
no tech picked in over 70% of winning builds, no branch under 15%, and first-turn advantage under
55%.
