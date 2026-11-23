# Architecture Decision Records

One file per significant decision, numbered `NNNN-kebab-title.md`. ADRs are immutable once accepted; to change a decision, add a new ADR and mark the old one `Superseded by NNNN`.

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-typescript-monorepo.md) | TypeScript monorepo | Accepted |
| [0002](0002-threejs-rendering.md) | Three.js rendering | Accepted |
| [0003](0003-phone-web-controller-over-lan.md) | Phone web controller over LAN | Accepted |
| [0004](0004-deterministic-simulation.md) | Deterministic simulation | Accepted |
| [0005](0005-destructible-sdf-terrain.md) | Destructible SDF terrain | Accepted |
| [0006](0006-data-driven-extensibility.md) | Data-driven extensibility | Accepted |
| [0007](0007-electron-desktop-distribution.md) | Electron desktop distribution | Accepted |
| [0008](0008-phone-renders-game-view.md) | Phones render the 3D game view | Accepted |
| [0009](0009-stylised-low-poly-art-direction.md) | Stylised low-poly art direction | Accepted |

## Template

```markdown
# NNNN. Title

Status: Proposed | Accepted | Superseded by NNNN | Deprecated
Date: YYYY-MM-DD

## Context
What forces and constraints led to this decision?

## Decision
What we decided, stated in the active voice.

## Alternatives considered
- Option: why not.

## Consequences
Positive, negative, and follow-up work.
```
