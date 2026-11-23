// Prepares the CC0 prop models in packages/content-base/assets/models/ from the original packs.
//
// This is a maintenance tool, not part of the build: the prepared .glb files are committed.
// It needs glTF-Transform, which is deliberately NOT a repo dependency. Install it anywhere and
// point TOOLS_DIR at that folder (it must contain node_modules/@gltf-transform/*):
//
//   mkdir /tmp/gt && cd /tmp/gt && npm init -y && npm i @gltf-transform/core @gltf-transform/functions
//   TOOLS_DIR=/tmp/gt SRC_DIR=<folder holding the original .glb files> node scripts/prepare-models.mjs
//
// Each entry copies one source file, recolours its materials by name to the art-direction palette
// (docs/art-direction.md), and wraps the scene in a node that scales it to a target size and
// puts its base centre at the origin. Sources and licences: packages/content-base/assets/CREDITS.md.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const toolsDir = resolve(process.env.TOOLS_DIR ?? '.');
const srcDir = resolve(process.env.SRC_DIR ?? '.');
const outDir = resolve(process.env.OUT_DIR ?? 'packages/content-base/assets/models');
const require = createRequire(join(toolsDir, 'noop.js'));
const { NodeIO } = require('@gltf-transform/core');
const { getBounds, dedup, prune } = require('@gltf-transform/functions');

/** Palette colours (docs/art-direction.md) used to recolour source materials by name. */
const C = {
  rock: '#9a968c',
  grassTop: '#86b04a',
  grassEdge: '#5c8a34',
  soil: '#946a48',
  deepSoil: '#5e4230',
  accent: '#ff8a3d',
  paper: '#fff6e4',
  sunflower: '#ffd21f',
  capRed: '#d8452f',
  capTan: '#c9954f',
  cream: '#f2e6cf',
};

/** Recolour tables per source material name. */
const RECOLOUR = {
  Rock: C.rock,
  Green: C.grassTop,
  DarkGreen: C.grassEdge,
  DarkGreen2: C.grassEdge,
  Wood: C.deepSoil,
  LightWood: C.soil,
  Mushroom_Top: C.capRed,
  Mushroom_Bottom: C.cream,
  Mushroom1: C.cream,
  Red: C.capRed,
  White: C.cream,
  LightRed: C.capTan,
  Yellow: C.sunflower,
};

/**
 * Output name -> [source file, target size in metres, axis ('y' height or 'max' largest extent),
 * extra material overrides].
 */
const MODELS = {
  'rock-a': ['nature_pack/Rock_1.glb', 0.55, 'max'],
  'rock-b': ['nature_pack/Rock_2.glb', 0.4, 'max'],
  'rock-c': ['nature_pack/Rock_4.glb', 0.65, 'max'],
  'rock-d': ['nature_pack/Rock_6.glb', 0.3, 'max'],
  'mushroom-a': ['crops_pack/Mushroom_1.glb', 0.7, 'y'],
  'mushroom-b': ['crops_pack/Mushroom_2.glb', 0.95, 'y'],
  'mushroom-c': ['platformer_pack/Mushroom.glb', 0.6, 'y'],
  'grass-a': ['nature_pack/Grass.glb', 0.55, 'y'],
  'grass-b': ['nature_pack/Grass_2.glb', 0.65, 'y'],
  'flowers-a': ['nature_pack/Flowers.glb', 0.7, 'y', { Cyan: C.accent }],
  'flower-b': ['crops_pack/Flower_3.glb', 0.55, 'y', { Cyan: C.paper }],
  'plant-a': ['nature_pack/Plant_1.glb', 0.45, 'y'],
  'plant-b': ['nature_pack/Plant_3.glb', 0.6, 'y'],
  'log-a': ['nature_pack/WoodLog.glb', 1.6, 'max'],
  'stump-a': ['nature_pack/TreeStump.glb', 0.5, 'y'],
};

/** sRGB hex string to linear RGBA factor. */
function linearFactor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255), 1];
}

const io = new NodeIO();
mkdirSync(outDir, { recursive: true });
for (const [name, [file, size, axis, extra = {}]] of Object.entries(MODELS)) {
  const doc = await io.readBinary(readFileSync(join(srcDir, file)));
  for (const m of doc.getRoot().listMaterials()) {
    const hex = extra[m.getName()] ?? RECOLOUR[m.getName()];
    if (!hex) throw new Error(`${file}: no recolour for material ${m.getName()}`);
    m.setBaseColorFactor(linearFactor(hex)).setRoughnessFactor(1).setMetallicFactor(0);
  }
  const scene = doc.getRoot().listScenes()[0];
  const { min, max } = getBounds(scene);
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const s = size / (axis === 'y' ? ext[1] : Math.max(...ext));
  const wrapper = doc
    .createNode(name)
    .setScale([s, s, s])
    .setTranslation([-((min[0] + max[0]) / 2) * s, -min[1] * s, -((min[2] + max[2]) / 2) * s]);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    wrapper.addChild(child);
  }
  scene.addChild(wrapper);
  await doc.transform(dedup(), prune());
  await io.write(join(outDir, `${name}.glb`), doc);
  console.log(name, ext.map((v) => (v * s).toFixed(2)).join(' x '));
}
