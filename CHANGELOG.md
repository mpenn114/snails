# Changelog

All notable changes to Snails are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). The release workflow publishes the section matching a
pushed tag `vX.Y.Z` as the release notes.

## [Unreleased]

### Changed

- Default turn time is now 45 s.
- Aiming: drag sets direction only; press and hold Fire to charge power with a large gauge, then
  release to shoot.
- The tutorial no longer runs during your own turn; open it any time from the "?" button.
- Team slots are assigned automatically on join; team and snail names are editable, with fun
  defaults and a re-roll button.
- Restyled join, lobby and TV lobby screens with a shared garden theme and logo.
- Terrain generation links every sizeable standable region with ramps, causeways or tunnels, so
  all parts of the map can be reached on foot; spawns and crates only land on connected ground.

### Added

- Camera avoids terrain between it and the snail (no more views from inside rock in tunnels) and a
  new snail-eye camera mode on the phone's camera toggle.
- Info (i) buttons on weapon tiles and tech cards explaining what each does.
- Sounds for jumping, landing, crawling, crate landing and pickup, splashes, research, weapon
  selection and button clicks.
- Crate pickups show floating text on the TV and a toast on the collecting player's phone.

### Fixed

- Crates granting unlimited-ammo weapons made them limited; crate weapons were unusable until
  their tech was researched. Crate pickup range is more forgiving, and Supply and Utility crates
  now give genuinely new items.
- Phone lobby and match controls no longer overlap the corner buttons; long team names no longer
  wrap over the wind readout.

## [0.1.0] - Unreleased

First playable release.

### Added

- Turn-based snail artillery for 2 or more teams on destructible 3D terrain: crawl, jump, aim,
  pick a weapon and fire, with wind that changes every turn, fall damage and drowning.
- Play from your phone: scan the QR code on the host screen with any phone on the same Wi-Fi, no
  app install. Reconnect after a dropped connection and rejoin your snail automatically.
- Phone controller with a 3D view of the battlefield, joystick movement, aim and power controls,
  weapon picker, turn timer, haptics and sound cues; hot-seat and one-phone-per-player modes.
- Big-screen host view with lobby, match settings, camera modes and a spectator view that works in
  any desktop browser.
- A stylised low-poly garden look: spiral-shelled snails with team colours and patterns, props,
  toon water, and explosion and projectile effects.
- A full base weapon set (Pebble Toss, Salt Shaker, Slime Grenade, Pebble Roller, Radula Missile,
  Spore Cloud, Shell Drill, Shell Bash, Slime Rope, Dew Bomb, Beetle Barrage, Snail Mail) plus
  crates and pickups and sudden death.
- Research and tech tree: earn calcium, unlock weapons, armour and mobility, and race to the
  capstones.
- CPU players with several difficulties and personalities to fill empty seats.
- Shells that show your upgrades and cracks as health drops, and a King of the Hill mode.
- Desktop app for Windows (installer), macOS (dmg) and Linux (AppImage) that hosts the game and
  the TV view in one step.
- Tutorial overlay and tuned default settings.
- Five map styles, picked in the lobby or at random: Island, Archipelago (separate islands,
  beaches, sea stacks and a rock arch), Highlands (tall peaks with tunnels and a snow cap),
  Caverns (a cliff-walled plateau hollowed by caves) and Canyon (winding gorges with ledges and
  rock bridges). Terrain shows grass, stone cliffs with rock layers, sand and snow by surface.
- Redesigned snails: a smooth, cute body with a face, and real spiral shells with whorls, a lip
  and patterns that follow the spiral.

### Notes

- Installers are unsigned, so Windows SmartScreen and macOS Gatekeeper warn on first launch. See
  `docs/troubleshooting.md`.
