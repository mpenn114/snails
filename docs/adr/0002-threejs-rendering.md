# 0002. Three.js rendering; the renderer is a pure view

Status: Accepted

## Context
The display app shows a destructible 3D world with PBR snail shells, water, particles and post-processing on a TV or monitor, on a typical gaming-PC or laptop GPU. It must ship inside Electron and also run in a plain browser. The rendering stack should not constrain or contain game rules.

## Decision
Render with Three.js on WebGL2 today, with a planned migration to `WebGPURenderer` (and TSL node materials) once it is stable enough for our feature set. The display app is a pure function of simulation state plus an event stream: it never mutates rules state and never decides outcomes. Visual-only randomness uses a separate non-deterministic RNG so it can never leak into the sim.

## Alternatives considered
- **Babylon.js**: capable and batteries-included, but a larger framework footprint; the team has more Three.js experience and a bigger ecosystem of examples for terrain and shaders.
- **Godot 4 / Unity**: see ADR-0001; they would also tie rendering to the rules engine.
- **Raw WebGL / WebGPU**: too much undifferentiated work (materials, shadows, loaders).
- **PlayCanvas / react-three-fiber**: R3F adds a React reconciliation layer we do not need for a render loop driven by snapshots.

## Consequences
- Large ecosystem (GLTF, postprocessing, instancing) and easy Electron/browser parity.
- We own the terrain mesher, shell shaders and camera system.
- Headless sim runs and tests need no GPU.
- WebGPU migration needs materials written to be portable (see [graphics.md](../graphics.md)).
