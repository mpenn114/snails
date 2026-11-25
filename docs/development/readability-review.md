# Readability review: shell tiers and crack states (M7-14)

Software-GL review of the shell material tiers and crack damage states at TV scale and at phone
size. The real-device pass is MG-12.

## How to reproduce

```sh
pnpm build && SHOTS_SMALL=1 \
  SHOTS_ONLY=display-review-tiers,display-review-cracks,display-review-tiers-phone,display-review-cracks-phone \
  NODE_PATH=$(npm root -g) pnpm shots
```

Scenes live in `apps/display/src/harness/review-scene.ts` (`?review=tiers|cracks` on the shot
harness). One snail per team in a row: tiers are plain, chalky, calcified, iron, crystal (fake tech
visuals, same path as `?research=`); cracks are health 100, 70, 40, 15 percent. Review scenes run 60
extra frames so the 0.8 s tier dissolve has finished (the older 20 frames ended mid-dissolve).

Shots: `display-review-tiers`, `display-review-cracks` (960x540 with `SHOTS_SMALL=1`, about a 1080p TV
at 3 m), and `display-review-tiers-phone`, `display-review-cracks-phone`. The phone shots are a
390x844 viewport of the display harness, used as a proxy: there is no harness path for the phone
spectate view. The camera backs off in portrait so the row fits, so snails are small, a worst case.
PNGs are 280-730 KB, so they are not committed.

## Findings

- Tiers at TV scale: all five are told apart at once. Chalky reads as pale cool-grey, calcified as
  cream with ridges, iron as dark grey with studs, crystal as pale cyan-white. Iron and chalky keep
  the team hue; calcified (yellow team) and crystal (pink team) drift toward cream and white, so
  team identity there leans on the glyph decal and shell pattern, which stay visible.
- Tiers on phone proxy: plain vs tinted is obvious, chalky/iron/crystal separable, calcified vs
  plain-yellow is the weakest pair.
- Cracks at TV scale: pristine (clean), scratched (light grey streaks near the lip), cracked (dark
  veins) and critical (broad broken areas) are distinguishable. Scratched vs pristine is the subtlest
  but visible; cracked vs critical is clear.
- Cracks on phone proxy: pristine vs the damaged states reads; scratched vs cracked is marginal at
  about 40 px snails.

## Changes made

- `shell-tier.ts`: crystal tint mix 0.4 to 0.3 so the team hue survives. A stronger mix of all tiers
  was tried (0.5 / 0.55 / 0.75 / 0.6) and rejected: it made tiers pop but erased team colour.
- Harness: extra dissolve frames in review scenes (above).

## Remaining for MG-12 (real devices)

- Scratched vs pristine and scratched vs cracked on a real phone at spectate camera distance.
- Calcified vs plain yellow, and crystal on pink, in sunlight and with auto-brightness.
- Colour-blind check of team hue on iron and chalky.
- TV at 3 m with real 1080p High-tier shading (shots here use software GL at 960x540).
