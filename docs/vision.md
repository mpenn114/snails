# Snails: Vision

## Elevator pitch

Snails is a turn-based artillery party game in the Worms-like artillery genre, set at garden scale.
Teams of slow, stubborn snails fight over a destructible 3D heap of soil, leaves and pebbles,
lobbing salt grenades and slime mortars at each other. Between turns, players research
technologies from their phones, and every upgrade is visible on the shell the snail carries.

The big screen (a TV or monitor driven by a host computer) shows the battlefield. Everyone else
plays from the phone already in their pocket: scan a QR code, pick a name and colour, and you are
in. No app install, no controllers to buy.

## Design pillars

1. **Chaotic, readable fun.** Artillery duels with wind, bad angles and terrain collapsing under
   your feet. Rounds should produce stories ("I dug myself out, then the pebble avalanche hit
   Dave"). Chaos is welcome; unreadable chaos is not. Every explosion must be understandable
   from the couch.
2. **Meaningful research choices.** Technology is a second game layered on the first. Spending
   Calcium on a Mobility tech instead of a weapon should change how you play, not just add a
   number. Choices are few, distinct and visible to opponents.
3. **Shells are identity and status.** The shell is the HUD. Team colour and pattern say who you
   are, material tier says how advanced you are, cracks say how hurt you are. A glance at the
   screen answers "who is winning and who is about to die" without reading text.
4. **Couch multiplayer with phones.** Low friction joining, short turns, nobody waiting long. The
   phone is a private control surface (including secret research queues), the TV is the shared
   spectacle.

## Target experience

- **Session length:** a match takes 20 to 30 minutes by default; a quick-match preset takes 10 to 12.
- **Turn length:** 30 seconds of action time plus a short retreat window. A full round of 4 teams
  should pass in under 3 minutes.
- **Player counts:** 2 to 8 participants. Humans and CPU players mix freely. Minimum viable match
  is one human against one CPU. Up to 4 teams of up to 4 snails each (soft cap of 16 snails to
  protect terrain and simulation performance).
- **Skill floor and ceiling:** a first-timer can lob something toward an enemy in the first turn.
  Veterans read wind, bank shots off terrain and plan research around the matchup.
- **Hardware:** one host computer (Windows, Linux or macOS) plus any number of Android phones
  (iOS browsers should work too, since the controller is a web app) on the same LAN.

## What makes it different

- **Research layer in a genre that usually has none.** Weapons and abilities are earned over the
  match instead of being fully available or random-crate-only. Matches have an arc: early scraps,
  a tech mid-game, a decisive late game.
- **Phones as controllers, including private information.** Research queues and weapon
  inventories are hidden from other players until revealed, which allows bluffing.
- **Shell as a living status display.** Procedurally varied logarithmic-spiral shells, material
  upgrades and progressive cracking replace health bars as the primary read.
- **Slow on purpose.** Snails crawl. Positioning is a commitment, terrain is a resource, and
  climbing steep slopes is their special trick.
- **Hackable by design.** Weapons, techs, shell upgrades, maps and modes are data. The base game
  is itself a content pack (see [extensibility.md](extensibility.md)).
- **Deterministic simulation.** Enables replays, fair CPU lookahead and headless balance testing
  (see [ai.md](ai.md)).

## Tone and setting

Warm, tongue-in-cheek and tactile. A sunny garden: soil cliffs, flowerpot ruins, leaf bridges,
puddles as water hazards. Snails are dramatic about everything. Violence is cartoonish; defeated
snails leave an empty shell behind rather than gore.

## Non-goals

- Not a realistic physics sandbox. Projectiles are ballistic with wind; no rigid-body chaos engine.
- Not real-time. There is no twitch aiming requirement; phone latency should never decide a shot.
- Not an online matchmaking game at launch. LAN and local play come first (online is a later item
  on the [roadmap](roadmap.md)).
- Not a clone. No characters, levels, sounds or art are taken from existing commercial games;
  only the general genre idea is shared.
- Not pay-to-anything. No in-app purchases, accounts or telemetry in the base game.
- Not a heavy 3D showpiece at the cost of playability. Visual polish follows the performance
  budgets in [graphics.md](graphics.md).
- Not a native phone app at launch. The web controller is the product; an Android wrapper is
  optional later work.

## Success criteria

- A group of four friends goes from "never heard of it" to playing within 2 minutes of the host
  launching the app.
- At least one memorable moment per match (an upset, a chain explosion, a last-snail comeback).
- Matches rarely stall: the anti-stalemate and anti-snowball rules in
  [technology-research.md](technology-research.md) keep leaders catchable and turtles pressured.
- CPU opponents are fun at every difficulty, not just beatable.

## Related documents

[game-design.md](game-design.md), [technology-research.md](technology-research.md),
[snail-visuals.md](snail-visuals.md), [controller-ux.md](controller-ux.md), [ai.md](ai.md),
[roadmap.md](roadmap.md).
