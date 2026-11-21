import * as THREE from 'three';

/** Placeholder snail: capsule body plus a spiral-ish shell built from spheres. */
export class SnailMesh {
  readonly group = new THREE.Group();
  private readonly shellMaterial = new THREE.MeshStandardMaterial({
    color: 0xc98b4a,
    roughness: 0.5,
  });

  /** @param shellColour - Team shell colour as a hex number. */
  constructor(shellColour = 0xc98b4a) {
    this.shellMaterial.color.setHex(shellColour);
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.25, 0.8, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0xb8c9a0 }),
    );
    body.rotation.z = Math.PI / 2;
    this.group.add(body);
    this.addShell();
  }

  private addShell(): void {
    for (let i = 0; i < 4; i++) {
      const r = 0.55 - i * 0.1;
      const whorl = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), this.shellMaterial);
      whorl.position.set(-0.1 + i * 0.05, 0.45 + i * 0.08, 0);
      this.group.add(whorl);
    }
  }

  /** Placeholder: darkens the shell as damage (0 = intact, 1 = destroyed). */
  setShellDamage(damage: number): void {
    const d = Math.min(1, Math.max(0, damage));
    this.shellMaterial.roughness = 0.5 + d * 0.5;
    this.shellMaterial.emissive.setScalar(0);
    this.shellMaterial.color.multiplyScalar(1 - d * 0.5);
  }

  /** Current shell roughness (exposed for tests). */
  get roughness(): number {
    return this.shellMaterial.roughness;
  }
}
