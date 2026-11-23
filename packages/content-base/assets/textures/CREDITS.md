# Terrain texture credits

All source images are from [ambientCG](https://ambientcg.com), licensed
[CC0 1.0 (public domain)](https://creativecommons.org/publicdomain/zero/1.0/). Attribution is not
required; it is given here for provenance.

The files are derived from the 1K-JPG downloads: the colour maps are neutralised (per-channel mean
set to 0.5 and partly desaturated, so the terrain shader supplies hue from the art-direction
palette), recompressed as JPEG, and also provided at 512 px for phones. Normal maps are the
OpenGL-convention maps resized to 512 px.

| Files                                                               | Source material | URL                               | Licence |
| ------------------------------------------------------------------- | --------------- | --------------------------------- | ------- |
| `grass-color-1k.jpg`, `grass-color-512.jpg`, `grass-normal-512.jpg` | Grass004        | https://ambientcg.com/a/Grass004  | CC0     |
| `dirt-color-1k.jpg`, `dirt-color-512.jpg`, `dirt-normal-512.jpg`    | Ground048       | https://ambientcg.com/a/Ground048 | CC0     |
| `rock-color-1k.jpg`, `rock-color-512.jpg`, `rock-normal-512.jpg`    | Rock030         | https://ambientcg.com/a/Rock030   | CC0     |

Use: 1K colour + 512 normals on the display (High/Medium), 512 colour only on phones and Low.
