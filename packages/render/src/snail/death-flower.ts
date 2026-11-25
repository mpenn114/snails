import * as THREE from 'three';

/** Shared low-poly flower geometry (stem plus five petals merged would need utils; kept as parts). */
export class FlowerAssets {
  readonly stem = new THREE.CylinderGeometry(0.012, 0.016, 0.22, 4);
  readonly petal = new THREE.SphereGeometry(0.045, 5, 3);
  readonly centre = new THREE.SphereGeometry(0.035, 5, 4);
  readonly stemMat = new THREE.MeshLambertMaterial({ color: 0x4f8f3a });
  readonly petalMat = new THREE.MeshLambertMaterial({ color: 0xf3f0e8 });
  readonly centreMat = new THREE.MeshLambertMaterial({ color: 0xf2c230 });

  /** Frees the shared geometry and materials. */
  dispose(): void {
    for (const r of [
      this.stem,
      this.petal,
      this.centre,
      this.stemMat,
      this.petalMat,
      this.centreMat,
    ]) {
      r.dispose();
    }
  }
}

/** Builds one flower group (shares `assets`; do not dispose the group's resources). */
export function createFlower(assets: FlowerAssets): THREE.Group {
  const g = new THREE.Group();
  g.name = 'elimination-flower';
  const stem = new THREE.Mesh(assets.stem, assets.stemMat);
  stem.position.y = 0.11;
  g.add(stem);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const petal = new THREE.Mesh(assets.petal, assets.petalMat);
    petal.position.set(Math.cos(a) * 0.05, 0.24, Math.sin(a) * 0.05);
    petal.scale.y = 0.5;
    g.add(petal);
  }
  const c = new THREE.Mesh(assets.centre, assets.centreMat);
  c.position.y = 0.245;
  g.add(c);
  return g;
}
