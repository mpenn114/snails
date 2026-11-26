# Snails: Phone Controller UX

The phone is a full play surface. It renders the same 3D scene as the big screen (shared render
package, lighter mobile quality tier) with controls overlaid, so a player can take an entire turn
looking only at their phone. The big screen is the shared spectator view. The controller is a web
app (PWA) opened by scanning a QR code; the host stays authoritative
([networking.md](networking.md)).

## Flow overview

```
Scan QR -> Join (name, colour) -> Lobby -> [Match: Waiting <-> My turn <-> Research] -> Results
                                      ^---- Disconnected / Rejoin ----^
```

## 1. Join

- Scan the QR on the host screen (`http://<host-ip>:<port>/?room=CODE`). Fallback: type the 4
  letter room code at the host's address.
- Pick a **name** (remembered locally) and a **shell colour and pattern** from the free options.
- Choose a role: Player or Spectator. Hot-seat players pick "Add another team on this phone".

```
+--------------------------+
|        SNAILS            |
|  Room: KFMT              |
|  Name: [ Dave_________ ] |
|  Colour:  (o)(o)(o)(o)   |
|  Pattern: stripes spots  |
|  [   JOIN THE GARDEN   ] |
+--------------------------+
```

## 2. Lobby

- Shows players, teams and their shells (live 3D preview that rotates the shell).
- **Team assignment:** drag yourself between teams, or tap "New team". Host can move anyone.
- **Add CPU:** the host taps "+ CPU", picks difficulty and personality ([ai.md](ai.md)).
- **Host settings:** mode, map (a select: Random, Island, Archipelago, Highlands, Caverns, Canyon, each with a one-line description), size (a select: Auto, Small, Medium, Large, Huge; Auto grows with the snail count, so 16 snails get a Large map; the TV lobby shows both choices in its settings chips), turn time, research, wind, crates, sudden death
  ([game-design.md](game-design.md)). Non-hosts see settings read-only.
- Ready toggle per player; the host starts when all are ready.

```
+--------------------------+
| LOBBY            [gear]  |
| Team Moss   Team Rust    |
|  Dave (you)  Sam         |
|  CPU Tiny    [+ CPU]     |
| Mode: Classic  Map: Pots |
| [ READY ]   [ START ]*   |  * host only
+--------------------------+
```

## 3. In-match: full-screen 3D view

Every in-match screen is the 3D scene filling the phone, with HUD and controls drawn over it.

### Camera modes

| Mode | Behaviour | How to enter |
|---|---|---|
| Follow my snail | Smooth third-person follow of the active snail. Default during movement. | Auto at turn start; "target" button |
| Aim view | Snail's point of view: the camera sits behind and above the active snail looking along its facing (so "forward" is screen-up). A crosshair marks the aimed direction and a dotted initial-trajectory arc ends in a landing ring (drawn on top of terrain so it never hides). Joystick left/right turns the snail, which the camera follows. | The big **Aim** button beside Fire (pulses until first used), or just start an aim drag. Stays on after releasing the drag; **Exit aim** (same button) or firing leaves it |
| Free | One-finger drag pans, two-finger pinch zooms, two-finger twist rotates. Recentres after 3 s idle if enabled. | Any drag outside the aim zone |
| Follow projectile | Cuts to the projectile and then the explosion; returns to the follow mode. | Auto on fire; tap to skip |
| Cinematic (spectating) | Auto-director follows the action, same logic as the big screen. | Default while waiting |

Aim view details: entering it (button, drag, or the `Camera:` cycle button) switches the rig to a free
pose computed from the snail's position, facing and aim elevation (`aimPose` in
`apps/controller/src/view/camera-math.ts`); the crosshair and arc are the render package's
`createAimReticle` / `createAimHint` layers, driven locally from the selected weapon's own data
(launch, motion, melee reach), so drill, melee, bouncing and missile weapons preview the way they
fly. The mode is latched in `CameraModeMachine` and dropped when a projectile is in flight, the
turn ends, or a camera gesture takes over.

Camera is a pure client-side view; it never affects rules. The player can switch freely at any
time, even on other players' turns.

### HUD (always visible, small)

- **Turn timer:** ring top-centre with seconds; turns red under 5 s.
- **Wind:** arrow and strength top-left (leaf particles in the world also show it).
- **Health:** the active team's snail bars are in a compact strip top-right (shell crack state is
  also visible in the scene, see [snail-visuals.md](snail-visuals.md)).
- **Minimap:** top-down heightmap with snail dots in team colour, crates and the zone; tap to
  jump the free camera there. Collapsible.
- **Calcium and research pip:** bottom-left, tap for the research screen when allowed.

### Own-turn controls over the scene (landscape)

```
+------------------------------------------------------------+
| (wind ->3)        ( 24s )            [minimap] Moss 82 Rust 60|
|                                                            |
|                      [3D scene]                            |
|                    ~~~ arc preview ~~~                     |
|                   snail                                    |
|                                                            |
|  (   o   )                                       [ JUMP ]  |
|  joystick                    [wheel]  [ FIRE ]  [ END ]    |
|  [cam]  [Calcium 35 *]                                     |
+------------------------------------------------------------+
```

Portrait variant: the scene on the upper two-thirds, controls in a bottom panel.

```
+------------------+
| wind  (24s)  map |
|   [3D scene]     |
|    ~~~arc~~~     |
|                  |
+------------------+
| (joy)  JUMP      |
| [wheel][FIRE][END]|
+------------------+
```

Controls:
- **Movement:** virtual joystick (left thumb) controls crawl; dead zone and left/right-handed
  swap in settings. Joystick direction is relative to the camera: the stick vector is projected onto
  the active snail's on-screen facing (forward = stick toward where the snail faces, so stick-up in
  the follow view, stick-right/left in a side view). The perpendicular component steers: it is sent
  as `move.turn` (-1..1, 0.1 steps; stick-up turns a right-facing snail counter-clockwise, in the
  follow view stick-left does) and the snail turns at a limited rate while crawling or standing, so
  a diagonal stick crawls and turns at once. While a guided Radula Missile is in flight the stick
  steers the missile instead (no move).
- **Aim button:** large button left of Fire (above it in portrait). Tap to enter the aim view,
  tap again (it reads "Exit aim") to leave. Starting an aim drag enters it automatically.
- **Jump:** button (right thumb); tap for hop, swipe up for backflip.
- **Aim by drag:** touch and drag anywhere on the scene (outside buttons) from the snail: direction
  sets yaw/pitch (in a side view the drag direction is the shot direction; behind the snail drag up =
  steeper, down = flatter), distance sets power. An **angle/power arc preview** is drawn in the 3D scene
  (and mirrored on the big screen so spectators follow the shot), including wind drift only if the
  Eye Stalk Optics tech is owned ([technology-research.md](technology-research.md)).
  Release to lock; a fine-tune slider appears for 1-degree steps.
- **Weapon wheel:** long-press the weapon button or swipe from the edge. Shows stock counts;
  a cooldown or locked state is greyed.
- **Fire:** big button; hold-to-charge weapons show a charge ring. A confirm-on-release
  option avoids accidental shots.
- **End turn / retreat:** button; shell-retreat is an option in the same menu.
- **Utility:** context buttons (rope, drill) appear for relevant weapons.

## 4. Waiting / spectating

- Full 3D view in cinematic or free camera. No game controls.
- Banner: "Sam's turn: Rust". A "your turn is next" chime and vibration at 1 turn before.
- You can open the research screen (queue only) while waiting.
- Pure spectators see the same view plus a quick team-stats panel.

## 5. Research screen (between turns)

Slides up over a dimmed 3D scene; touching the scene closes it.

```
+------------------------------------+
| RESEARCH      Calcium 35  [x]      |
| [Weapon][Shell][Mobility][Utility] |
|  (Salt Mining)  20  OWNED          |
|  (Sticky Slime) 25  [QUEUE]        |
|  (Heavy Pebbles)40  needs: Salt    |
| Queue: 1. Calcified Shell  (2 t)   |
|        2. ____                     |
+------------------------------------+
```

- Branch tabs, tier lanes, prerequisite lines; tap a card for the effect and a shell preview.
- Hot-seat: hidden behind a hold-to-reveal cover.
- Queue changes are sent to the host and confirmed; the card shows the pending state until
  acknowledged.

## 6. Haptics and audio

- Short tick on joystick start; a stronger pulse when you cross the max power.
- Fire: a heavy pulse. Own snail hit: a double pulse. Turn start: a long pulse.
- Research complete: a rising pattern. All haptics respect a settings toggle and
  `navigator.vibrate` availability.
- Phone audio is minimal and off by default (the big screen carries audio); a toggle enables
  SFX for single-phone play.

## 7. Performance and battery settings

The phone renders at a mobile quality tier ([graphics.md](graphics.md)):

| Setting | Options |
|---|---|
| Quality | Auto / Low / Medium / High |
| Frame rate cap | 30 / 45 / 60 |
| Resolution scale | 50% / 75% / 100% |
| Shadows, water, particles | per-tier toggles |
| Battery saver | Forces Low, 30 fps, dims, disables free-cam inertia |
| Stream-only mode | No 3D; flat 2D map and controls (for very old phones) |

- **Auto:** adaptive: if frame time exceeds budget for 3 s, step down a tier; thermal or low
  battery (Battery API where available) steps down too.
- The renderer pauses when the tab is hidden and during the other players' turns if
  "Eco waiting" is on (renders at 15 fps with auto-camera).
- Keep the screen awake (Wake Lock API) during a match.

## 8. Orientation and layout

- Landscape is the preferred layout for the scene; portrait is fully supported with the bottom
  control panel. The layout reflows without losing state.
- Safe-area insets respected; controls anchored to thumbs; left-handed mirror option.
- Minimum touch target 48 dp.

## 9. Accessibility

- Colour-blind safe palettes plus patterns and decals as a second channel
  ([snail-visuals.md](snail-visuals.md)).
- Scalable HUD text (100 to 200%); high-contrast HUD option.
- Reduced motion: disables camera shake and slows pans.
- Aim assist options: snap-to-angle, larger power steps, or a "simple aim" tap-to-nudge mode.
- Timer extension for players who need it (host setting per player: +50% time).
- All actions possible with one thumb in the "one-handed" layout (joystick is replaced by
  left/right arrows).
- Screen reader labels for lobby and research screens (the scene is not described).

M7-16 status: team colours now carry a per-team shape glyph (`TEAM_GLYPHS` in
`packages/render/src/style/team-glyphs.ts`, same index as the shell pattern) in the controller
lobby roster, colour picker and spectate banner, and in the display lobby and HUD. The phone has an
"Aa" settings button (text size small/normal/large scaling the `--snl-text-*` tokens, reduce-motion
toggle, both persisted in localStorage). The display honours `prefers-reduced-motion` and
`?reducedMotion=1` (`resolveReducedMotion`/`motionConfig`): no shake (shake scale 0, there is no
shake effect yet) and camera smoothing 2.5x slower. High-contrast HUD, aim assist options and
timer extension remain open.

## 10. Disconnected and rejoin

- Connection indicator (small dot in the HUD). On drop: overlay "Reconnecting..." with the scene
  frozen; automatic retries with backoff.
- Rejoin: the stored session token puts you back in your team and turn state. If your turn
  expires while away, the host skips it.
- After 2 missed turns (default 60 s total offline) the host offers CPU takeover to the room;
  on return you reclaim control at your next turn.
- Host disconnect or crash: the phone shows "Host lost" and keeps trying; the match state is on the
  host, so it resumes when the host returns if the snapshot is saved.
- Version mismatch: a polite "Reload to update" screen
  ([networking.md](networking.md) covers protocol versions).

## 11. Tutorial

- First time a player's turn starts, a skippable 5-step coach-mark card (move, aim, power, weapon,
  fire) appears; "tutorial seen" is stored in localStorage (`snails.tutorialSeen`). Re-run it from
  the Aa settings panel ("Show tutorial again"). Skipped under automation (`navigator.webdriver`)
  or `?tutorial=0`; `?tutorial=1` forces it. The TV lobby shows a one-line "How to play" hint.
