# Asset credits

All models in `models/` are by [Quaternius](https://quaternius.com) and released under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) (public domain; no
attribution required, given here anyway). Each pack page on quaternius.com states CC0 and links
the deed.

The originals were obtained from the CC0 mirror
[trebeljahr/quaternius-showcase](https://github.com/trebeljahr/quaternius-showcase) (its
`LICENSES.md` lists every pack as CC0-1.0 and links the official source page; the official
download is the Google Drive link on each pack page). They were then processed with
`scripts/prepare-models.mjs`: materials recoloured to the palette in `docs/art-direction.md`,
scene scaled to the target size in metres and re-centred (base centre at the origin), deduplicated.
Geometry is otherwise unmodified.

| File                    | Source model               | Pack (source page)                                                           | Licence |
| ----------------------- | -------------------------- | ---------------------------------------------------------------------------- | ------- |
| `models/rock-a.glb`     | `Rock_1`                   | Ultimate Nature Pack, https://quaternius.com/packs/ultimatenature.html       | CC0     |
| `models/rock-b.glb`     | `Rock_2`                   | Ultimate Nature Pack                                                         | CC0     |
| `models/rock-c.glb`     | `Rock_4`                   | Ultimate Nature Pack                                                         | CC0     |
| `models/rock-d.glb`     | `Rock_6`                   | Ultimate Nature Pack                                                         | CC0     |
| `models/grass-a.glb`    | `Grass`                    | Ultimate Nature Pack                                                         | CC0     |
| `models/grass-b.glb`    | `Grass_2`                  | Ultimate Nature Pack                                                         | CC0     |
| `models/flowers-a.glb`  | `Flowers`                  | Ultimate Nature Pack                                                         | CC0     |
| `models/plant-a.glb`    | `Plant_1`                  | Ultimate Nature Pack                                                         | CC0     |
| `models/plant-b.glb`    | `Plant_3`                  | Ultimate Nature Pack                                                         | CC0     |
| `models/log-a.glb`      | `WoodLog` (with mushrooms) | Ultimate Nature Pack                                                         | CC0     |
| `models/stump-a.glb`    | `TreeStump`                | Ultimate Nature Pack                                                         | CC0     |
| `models/mushroom-a.glb` | `Mushroom_1`               | Ultimate Crops Pack, https://quaternius.com/packs/ultimatecrops.html         | CC0     |
| `models/mushroom-b.glb` | `Mushroom_2`               | Ultimate Crops Pack                                                          | CC0     |
| `models/flower-b.glb`   | `Flower_3`                 | Ultimate Crops Pack                                                          | CC0     |
| `models/mushroom-c.glb` | `Mushroom`                 | Modular Platformer Pack, https://quaternius.com/packs/modularplatformer.html | CC0     |

No snail model was found in a CC0 pack; the snail body and shell are still built in code.
