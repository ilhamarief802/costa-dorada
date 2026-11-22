// Seagulls. One instanced body and one instanced pair of wings per bird; the flock circles the
// bay on ellipses with a shared period, so the whole thing is a per-frame matrix write and one
// draw call per part. They only exist over the water side of town, which is where the camera
// spends the marina shots.
import config from '../core/config.js';
import Rng from '../core/rng.js';

const THREE = globalThis.THREE;

function bodyGeometry() {
  // A stretched capsule: fat at the chest, tapering to the tail.
  const geometry = new THREE.SphereGeometry(0.16, 8, 6);
  geometry.scale(1.0, 0.9, 2.3);
  return geometry;
}

function wingGeometry() {
  // A thin swept plate, hinged at the shoulder so it can flap about Z.
  const geometry = new THREE.BoxGeometry(1.05, 0.03, 0.34);
  geometry.translate(0.52, 0, 0);
  return geometry;
}

export default class Gulls {
  constructor(plan) {
    this.plan = plan;
    this.group = new THREE.Group();
    this.group.name = 'gulls';
    this.rng = new Rng((plan.seed ^ 0x9a1f33c7) >>> 0);
    this.birds = [];
    this.dummy = new THREE.Object3D();
    this.build();
  }

  build() {
    const count = 22;
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.7, metalness: 0 });
    const grey = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.75, metalness: 0 });
    this.bodies = new THREE.InstancedMesh(bodyGeometry(), white, count);
    this.wings = new THREE.InstancedMesh(wingGeometry(), grey, count * 2);
    this.bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bodies.frustumCulled = false;
    this.wings.frustumCulled = false;
    this.group.add(this.bodies, this.wings);

    const rng = this.rng;
    for (let i = 0; i < count; i += 1) {
      // Circles anchored over the bay and the marina, at three different radii and heights.
      const anchorX = i % 3 === 0 ? 270 : i % 3 === 1 ? 60 : -180;
      const anchorZ = 380 + rng.float(-30, 70);
      this.birds.push({
        ax: anchorX,
        az: anchorZ,
        rx: rng.float(26, 68),
        rz: rng.float(18, 46),
        y: rng.float(15, 34),
        speed: rng.float(0.16, 0.3) * (rng.chance(0.5) ? 1 : -1),
        phase: rng.float(0, Math.PI * 2),
        flap: rng.float(4.4, 7.2),
        flapPhase: rng.float(0, Math.PI * 2),
        size: rng.float(0.85, 1.35),
      });
    }
  }

  update(dt, elapsed = 0) {
    const dummy = this.dummy;
    for (let i = 0; i < this.birds.length; i += 1) {
      const bird = this.birds[i];
      const angle = bird.phase + elapsed * bird.speed;
      const x = bird.ax + Math.cos(angle) * bird.rx;
      const z = bird.az + Math.sin(angle) * bird.rz;
      const y = bird.y + Math.sin(elapsed * 0.7 + bird.phase) * 1.6;
      // Heading is the tangent of the ellipse.
      const heading = Math.atan2(-Math.sin(angle) * bird.rx, Math.cos(angle) * bird.rz);

      dummy.position.set(x, y, z);
      dummy.rotation.set(0, heading, 0);
      dummy.scale.setScalar(bird.size);
      dummy.updateMatrix();
      this.bodies.setMatrixAt(i, dummy.matrix);

      // Two wings, hinged at the body, flapping in opposition.
      const flap = Math.sin(elapsed * bird.flap + bird.flapPhase) * 0.7;
      for (let side = 0; side < 2; side += 1) {
        const dir = side === 0 ? 1 : -1;
        dummy.position.set(
          x + Math.cos(heading) * 0.1 * dir,
          y,
          z - Math.sin(heading) * 0.1 * dir,
        );
        dummy.rotation.set(flap * dir, heading + (dir > 0 ? 0 : Math.PI), 0);
        dummy.scale.setScalar(bird.size);
        dummy.updateMatrix();
        this.wings.setMatrixAt(i * 2 + side, dummy.matrix);
      }
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.wings.instanceMatrix.needsUpdate = true;
  }
}
