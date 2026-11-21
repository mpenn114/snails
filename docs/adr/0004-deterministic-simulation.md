# 0004. Deterministic fixed-timestep simulation in `@snails/core`

Status: Accepted

## Context
Game rules (turns, damage, research, projectiles, terrain edits) must be testable without a GPU or network, replayable for bug reports and golden tests, and cheap to clone so CPU players can look ahead by simulating shots.

## Decision
All rules live in `@snails/core`: pure TypeScript, no DOM or Node APIs, no dependency on other internal packages. The sim advances in fixed steps (default 60 Hz) with a seeded PRNG (e.g. sfc32/xoshiro, state serialisable). Inputs are explicit commands; outputs are state plus an ordered event list. Projectile motion is custom ballistic integration (gravity, wind, drag) with swept collision against the SDF, not a general physics engine. Floating-point use is restricted to operations that are deterministic in V8 (`+ - * /`, `Math.sqrt`); transcendental functions go through helpers.

## Alternatives considered
- **Rapier/Cannon/Ammo physics**: nondeterministic across versions/platforms or hard to snapshot, poor fit for SDF terrain, and overkill for ballistics.
- **Lockstep fixed-point integer math**: bulletproof determinism but slow to write; unnecessary because the server is the single authority and we do not do cross-machine lockstep.
- **Rules inside the renderer (frame-driven)**: untestable, frame-rate dependent.

## Consequences
- Unit tests assert exact outcomes from a seed; golden replays become possible.
- AI can fork and simulate cheaply.
- Developers must not use `Math.random`, `Date.now`, or iteration over unordered structures in core; lint rules and tests guard this.
- Custom ballistics means special cases (bouncing, rolling) are our code to write.
