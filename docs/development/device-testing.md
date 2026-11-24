# Real-device testing (Android phones on LAN)

This is the manual procedure for M3-32: 2 to 4 Android phones joined to one host over the local network, checked for latency, sustained play, reconnects and phone-specific behaviour. Simulated controllers and the Playwright smoke test (M3-31) do not replace it, because they cannot show thermal throttling, real Wi-Fi jitter or OS power management.

Run it on a release-like build, not `pnpm dev`, so the numbers reflect what players get.

## Status of the features used here

Some items below depend on work still in progress. Check the status column in [tasks.md](../tasks.md) before running a case, and mark a case "not applicable" in the results if its feature is not yet in the build.

| Feature | Where | Status |
| --- | --- | --- |
| Join URL with `?room=CODE` | Controller (`apps/controller`) | In code |
| `GET /api/info` (LAN IP, join URL) | Server | In code |
| Display at `/display/` | Server serves `apps/display/dist` | In code |
| Controller at `/` | Server serves `apps/controller/dist` | In code |
| Reconnect with backoff ("Reconnecting" state) | Controller net client | Client side in code; full turn restore depends on M3-12 (check [tasks.md](../tasks.md)) |
| Quality governor and battery saver control | Controller phone view | Partly in code (M3-26 still open in [tasks.md](../tasks.md)) |
| Hot-seat mode | Controller | Not yet in code (M3-28) |
| Latency instrumentation and `?debug` overlay | Server and controller | Not yet in code (M3-30) |

If `?debug` or `/api/debug/latency` is missing from the build, record latency with an external stopwatch or screen recording instead (see test case 1) and note the method used.

## 1. Setup

### 1.1 Build and start

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
PORT=3000 pnpm --filter @snails/server start
```

`pnpm build` builds the packages, the controller and the display. `start` runs the built server (`apps/server/dist/main.js`). It creates one room and prints the join URL.

### 1.2 Find the LAN address

The host's LAN IP is available from the running server:

```sh
curl -s http://localhost:3000/api/info
```

Use the `joinUrl` (or the primary address) in the response. If it lists several addresses, pick the one on the Wi-Fi network the phones use (usually `192.168.x.x` or `10.x.x.x`), not a Docker or VPN address.

### 1.3 Open the display

On the host or TV browser, open:

```
http://<host-lan-ip>:3000/display/
```

The server also prints a ready-made link on start, for the host PC:

```
TV view (host PC): http://localhost:3000/display/?room=ABCD
```

The lobby shows the QR code and the four-letter room code. A display opened without `?room=`
attaches to that same startup room. A display opened after the match has started is caught up
(match info, snapshot, turn state) like a spectator, in per-player and hot-seat mode alike. The
phone lobby also has an "Open TV view" link. With `pnpm dev` the display runs on Vite instead
(`http://localhost:5173/`), proxied to the server on port 3000.

### 1.4 Join the phones

1. Put all phones and the host on the same Wi-Fi network.
2. On each phone, open the camera, scan the QR code on the display, and tap the link. It opens `http://<host-lan-ip>:3000/?room=CODE` in Chrome.
3. Enter a name, pick a colour and join the lobby.
4. Fallback: open `http://<host-lan-ip>:3000/` and type the room code.

### 1.5 Network conditions

- Use 5 GHz Wi-Fi where possible, with the phones within a few metres of the access point.
- Disable AP or client isolation on the router (sometimes called "guest network isolation" or "AP isolation"). With isolation on, phones cannot reach the host even though the QR code loads.
- Turn off any VPN on the phones and the host.
- Note the router model and band in the results so the latency numbers can be compared later.
- Allow inbound TCP on the server port in the host firewall (for example the Windows Defender prompt on first run).

### 1.6 Phone preparation

- Full charge at the start (or record the starting level, which is needed for the battery figure).
- Chrome updated from the Play Store; record its version.
- Battery optimisation off for Chrome if the phone allows it, and note it if left on.
- Screen timeout set to at least 10 minutes so the screen does not sleep mid-test unless the case needs it.
- Same display brightness on every phone, and no other apps running.

## 2. Device matrix

Fill one row per phone before the run. Record what the device reports, not the marketing name.

| ID | Model (Settings > About) | Android version | Chrome version | SoC (e.g. Snapdragon 7s Gen 2) | RAM | Refresh rate (Hz) | Battery at start (%) | Notes (case, OS skin, power profile) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | | | | | | | | |
| P2 | | | | | | | | |
| P3 | | | | | | | | |
| P4 | | | | | | | | |

Also record the host: OS, CPU, GPU, browser used on the TV or host screen, and the router model and Wi-Fi band.

## 3. Test cases

Each case lists the steps and pass criteria. Mark each phone separately where the criteria are per device.

### Case 1: Latency

Goal: command-to-effect latency on a LAN stays low enough that a turn feels immediate.

Targets (LAN, 2 to 4 phones active): median command-to-effect under 100 ms, p90 under 100 ms. The roadmap exit criterion is a median under 150 ms, so 100 ms is a stricter goal for this test.

Steps:

1. Open the controller with `?debug` appended to the join URL (for example `http://<host-lan-ip>:3000/?room=CODE&debug`). The overlay shows command-to-effect p50 and p90 and round-trip time (RTT). If the overlay is not present in the build, use case 1b.
2. Play 10 minutes with all phones active: each phone aims, changes power and fires in turn. Aim adjustments count as commands.
3. Record the overlay values at 2, 5 and 10 minutes, and the final RTT.
4. Optional, for the server histogram: `curl -s http://<host-lan-ip>:3000/api/debug/latency` (available once M3-30 lands; otherwise skip and note it).

Case 1b (no overlay): film the controller and the display side by side at 60 fps or more. Count frames between the tap and the first visible change on the display, and convert to milliseconds. Take at least 20 samples per phone.

Pass criteria:

- p90 command-to-effect < 100 ms on each phone.
- RTT median < 30 ms on Wi-Fi.
- No phone shows a command with no effect (a lost command, a stuck turn) during the 10 minutes.

### Case 2: 20-minute thermal run (4 phones)

Goal: sustained play with all four phones for 20 minutes without crashes, unacceptable frame loss or a runaway battery drain.

Steps:

1. Start all four phones at the same battery level (record it) and screen brightness.
2. Play a continuous match for 20 minutes, with every phone taking turns. Keep the display on for the whole run.
3. Every 2 minutes, record for each phone: fps (from the `?debug` overlay if present, otherwise from the Chrome frame rate counter or a screen recording), the quality tier shown or logged by the auto-governor, and the device temperature if the phone exposes it (for example via a thermal monitoring app; record the app name).
4. At the end, record battery level, any Chrome tab reload, any "Aw, Snap" or tab crash, and any server log errors.
5. Note any throttling: fps dropping for more than 30 seconds, the governor stepping down and not back up, or the phone warm to the touch.

Pass criteria per phone:

- No tab crash or reload.
- Average fps at or above 30 for the whole run (the battery saver cap, if active, is 30).
- The quality governor settles (no more than 3 tier changes in the last 10 minutes) and does not get stuck at the lowest tier without cause.
- Battery drop no more than 25 percent over 20 minutes. Record the value; the threshold is a starting point to revisit after the first run.
- No server error log entries and no display freeze.

### Case 3: Reconnect

Goal: a dropped phone rejoins the same player and restores its turn within 3 seconds (M3-12).

Run each sub-case once per phone, during the phone's own turn and during another player's turn.

- 3a. Airplane mode: turn on airplane mode for 5 seconds, then off. Measure the time from Wi-Fi returning to the turn controls being usable again.
- 3b. Lock screen: lock the phone for 30 seconds during the turn, then unlock.
- 3c. Kill tab: close the Chrome tab (or swipe the app away) mid-turn, then reopen the join URL.
- 3d. Wi-Fi off and on: toggle Wi-Fi off for 10 seconds, then on.

For each sub-case, measure the time to "Connected" (the connection indicator in the HUD) and to restored turn state (the same turn controls and the same aim, if it was mid-aim).

Pass criteria:

- The phone rejoins as the same player (same name and colour, not a new player).
- Turn state is restored within 3 seconds of the phone being reachable again.
- The reconnect after 3a, 3b and 3d succeeds without re-entering the room code.
- For 3c, the rejoin works from the saved room (no need to rescan the QR code) or, if it needs a rescan, that is recorded as a finding.
- Other phones and the display keep running during the drop.

### Case 4: Background, foreground, orientation, battery saver

- 4a. Background and foreground: switch to another app for 60 seconds during the phone's turn, then return. Pass: the phone shows the current state within 3 seconds of returning, and the turn is still active.
- 4b. Orientation: rotate the phone to landscape and back during the turn and during aim. Pass: the layout reflows without losing the turn, and the aim does not jump.
- 4c. Battery saver on: turn on the battery saver control in the phone view during a turn. Pass: the frame cap and quality drop to the saver level (30 fps, lowest tier) and the turn controls still work.
- 4d. Battery saver automatic: if the phone allows a battery level to be set low for testing (developer options or a battery simulator app), or once the phone drops below 20 percent while discharging, confirm the saver turns on by itself. Record the method used.

Pass criteria: no lost turns, no crashes, and the expected state change in each sub-case.

### Case 5: Hot-seat mode

Applies only once hot-seat (M3-28) is in the build. Otherwise mark as not applicable.

Goal: one phone controls several teams, with each team's turn passed clearly to the next.

Steps:

1. Join one phone, add a second team on the same phone ("Add another team on this phone").
2. Play two full turns, handing the phone over between teams using the "Pass to" screen.
3. Check that the hidden information (for example research cover) requires a hold-to-reveal before it shows.

Pass criteria:

- Each team's controls appear only on its own turn.
- The "Pass to" screen shows the correct next team.
- Hidden information stays covered until held.
- Reconnect (case 3a) works on the hot-seat phone and restores the currently active team.

## 4. Results table

Copy this table into the test report for each run. Use one row per phone per case, and add the run date and build commit.

| Run date | Build (commit) | Case | Phone | Result (pass / fail / n/a) | Measured value(s) | Method | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | 1 Latency | P1 | | p50 __ ms, p90 __ ms, RTT __ ms | overlay / film | |
| | | 2 Thermal | P1 | | fps avg __, tier changes __, battery __ -> __ %, max temp __ | overlay / app | |
| | | 3 Reconnect | P1 | | 3a __ s, 3b __ s, 3c __ s, 3d __ s | stopwatch | |
| | | 4a Background | P1 | | return time __ s | stopwatch | |
| | | 4b Orientation | P1 | | | visual | |
| | | 4c Battery saver | P1 | | fps __ | overlay / app | |
| | | 5 Hot-seat | P1 | | | visual | |

Record the four device rows from section 2 alongside the results so each result can be traced to a model and Chrome version.

## 5. Filing issues

File one GitHub issue per distinct problem, not one per phone. Use the labels and template below.

- Title: `[device] <short symptom> on <model> (Android <ver>, Chrome <ver>)`
- Labels: `device-testing` plus the area (`controller`, `server`, `render`, `network`).
- Body:
  - Build commit and how it was served (`pnpm build`, server start command, port).
  - Device row from the matrix (model, Android, Chrome, SoC, RAM, Hz).
  - Steps to reproduce, including the case number from this document.
  - Expected result and the pass criterion it breaks.
  - Measured values (copy from the results table) and how they were measured.
  - Attachments: screen recording or screenshot, the `?debug` overlay values if available, and the server log lines around the event.
  - Whether it reproduces on a second phone and on a second run.
- Severity: a crash, a lost turn or a stuck game is high; a missed latency target or a slow reconnect is medium until it reproduces on more than one phone; a cosmetic issue is low.

Do not include personal data in issues or attachments (names of players, room photos, phone identifiers beyond the model).

Once the run is complete, link the results table and issue list from the M3-32 row in [tasks.md](../tasks.md) (update the status there, not in this document).

## 6. MG-12 visual and performance checklist (Android, iOS, TV)

Purpose: confirm on real hardware that the restyled look (art direction, see [art-direction.md](../art-direction.md)) is readable and holds its frame rate per quality tier. Headless budget counts live in [graphics.md](../graphics.md#tier-budget-verification-m7-15); this checklist is what they cannot show. **Status: not run.** MG-12 stays open until the tables in 6.4 are filled from real devices.

Use a release build (`pnpm build`, then the server start command from section 1.1). Append `?perf=1` to the phone URL to publish `window.__perf` (draw calls, triangles, textures, programs) and use `?tier=...` on the display harness page (`/display/harness.html?tier=high&profile=1&seed=2&speed=2`) for a fixed scene. Run `pnpm perf` on the host first so counts are known.

### 6.1 Per device (Android phone, iPhone, TV or laptop on the display)

| Check | What to look at | Pass |
| --- | --- | --- |
| Snail readability | Snail silhouettes, shell spiral face (phone follow camera is three-quarter), team colour, active-snail ring at normal holding distance | Own and enemy snails identifiable at a glance in sunlight-level brightness |
| Labels and HUD | Name tags, health bars, turn timer, wind, minimap, buttons (Jump, Fire, Arms) | All text legible without zooming; nothing clipped by notch, home bar or TV overscan |
| Aiming | Aim arc and landing ring, aim camera behind the snail | Arc visible against grass, water and sky |
| Terrain and props | Terrain colour banding, props, water, fog horizon | No flicker, z-fighting, black patches or missing props |
| Effects | Explosion, puff trail, splash, damage numbers | Readable, not washing out the screen |
| Frame rate | Fixed scene, 60 s steady state, per tier | Phone: 30 fps cap held at Mobile, 60 where the device allows. TV/laptop: High >= 58 fps average, 1% low >= 45 |
| Governor | Does the quality governor change tier during a 10 minute match? | Changes are rare and do not oscillate |
| Heat and battery | Battery % and device temperature at 0, 10 and 20 minutes | Phone <= 15% battery per 20 minutes with the screen on, not too hot to hold (note the touch temperature), no thermal throttling message |
| Water and post on High | (TV/laptop only) water ripples, SSAO, bloom, SMAA, grade | Water reads as water, no shimmering edges, post does not drop below the fps target; if it does, record medium's result too |
| Loss and restore | Lock the screen, switch app, rotate | Context restores, no black canvas (iOS: see [ios-compat.md](ios-compat.md)) |

### 6.2 Procedure

1. Fill the device matrix in section 2 (iPhones: iOS and Safari version in place of Android and Chrome; TV: model, browser, resolution, refresh rate).
2. Start a match with 4 snails per team. On each phone play 3 turns, watching the checks above. Take 4 photos or screen recordings: own turn, enemy turn, a blast, the minimap and HUD.
3. Run the 20 minute thermal case (case 2) once per device class and record battery and temperature.
4. On the TV or laptop, load the display on High, then Medium; note fps and which tier the governor settles on.

### 6.3 Where to record

Record results in the tables below (copy them into the test report or commit them here). Add one row per device and tier. File problems with the template in section 5, labelled `device-testing` and `render`.

### 6.4 Results (fill in)

| Date | Build (commit) | Device (model, OS, browser) | Tier | fps avg / 1% low | Battery % per 20 min | Temp | Readability (snails, labels, HUD) | Water / post (High) | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | Android: | Mobile | | | | | n/a | | |
| | | iOS: | Mobile | | | | | n/a | | |
| | | TV / laptop: | High | | n/a | n/a | | | | |
| | | TV / laptop: | Medium | | n/a | n/a | | | | |
