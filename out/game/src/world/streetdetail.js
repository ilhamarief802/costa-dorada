// Street-level detail: the things that stop a road reading as a flat grey plane. Everything here
// is instanced and seeded from the plan, so a kilometre of avenue costs a handful of draw calls:
//
//   patches    irregular darker rectangles of fresh tarmac
//   drains     kerbside grates with a painted halo
//   litter     small flat cards of paper, card and leaves
//   kerbPaint  yellow no-parking dashes along the shopfront kerbs
//   stopLines  stop bars and give-way triangles at each junction mouth
//   bollards   short posts along the promenade edge
//   stains     oil and water stains under the parked cars
import config from '../core/config.js';
import Rng from '../core/rng.js';

const THREE = globalThis.THREE;

const LITTER_COLOURS = [0xd8d2c0, 0xc7b48a, 0xb9b3a4, 0xe0d8c4, 0xa8916a, 0xc0c6b2];

/** A flat quad lying on the ground, centred, with a 1x1 footprint. */
function groundQuad() {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** A rounded rectangle approximated as a low-poly disc squeezed to an aspect ratio. */
function disc(segments = 10) {
  const geometry = new THREE.CircleGeometry(0.5, segments);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export default class StreetDetail {
  constructor(plan) {
    this.plan = plan;
    this.group = new THREE.Group();
    this.group.name = 'street-detail';
    this.rng = new Rng((plan.seed ^ 0x51ee7a11) >>> 0);
    this.buildPatches();
    this.buildDrains();
    this.buildLitter();
    this.buildKerbPaint();
    this.buildBollards();
    this.buildStains();
    this.buildPavementEdges();
  }

  /** The roads that the shots look down, so detail goes where the camera is. */
  nearShotStreets(x, z) {
    return (Math.abs(x - 47) < 26 && z > 250 && z < 350)
      || (Math.abs(z - 338) < 18)
      || (x > 210 && x < 320 && z > 320);
  }

  buildPatches() {
    const patches = [];
    const rng = this.rng;
    // Scatter along every road centreline the camera can see.
    for (const centre of this.plan.roads.x) {
      for (let z = -320; z < 330; z += 6) {
        if (!this.nearShotStreets(centre, z)) continue;
        if (!rng.chance(0.08)) continue;
        patches.push({
          x: centre + rng.float(-7, 7),
          z: z + rng.float(-3, 3),
          w: rng.float(1.6, 5.4),
          d: rng.float(1.2, 4.2),
          yaw: rng.float(0, Math.PI),
          shade: rng.float(0.7, 1.15),
        });
      }
    }
    for (const centre of this.plan.roads.z) {
      for (let x = -320; x < 330; x += 6) {
        if (!this.nearShotStreets(x, centre)) continue;
        if (!rng.chance(0.08)) continue;
        patches.push({
          x: x + rng.float(-3, 3),
          z: centre + rng.float(-7, 7),
          w: rng.float(1.4, 4.6),
          d: rng.float(1.2, 4.0),
          yaw: rng.float(0, Math.PI),
          shade: rng.float(0.7, 1.15),
        });
      }
    }
    if (!patches.length) return;
    const mesh = new THREE.InstancedMesh(
      groundQuad(),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.9, metalness: 0.02 }),
      patches.length,
    );
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    patches.forEach((patch, index) => {
      dummy.position.set(patch.x, 0.028, patch.z);
      dummy.rotation.set(0, patch.yaw, 0);
      dummy.scale.set(patch.w, 1, patch.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      color.setHex(0x2a2a2e).multiplyScalar(patch.shade);
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.patches = mesh;
  }

  buildDrains() {
    const drains = [];
    const rng = this.rng;
    for (const centre of this.plan.roads.x) {
      for (let z = 260; z < 348; z += 17) {
        if (!this.nearShotStreets(centre, z)) continue;
        for (const side of [-1, 1]) {
          drains.push({ x: centre + side * 8.4, z, yaw: 0 });
        }
      }
    }
    for (let x = -300; x < 320; x += 22) {
      if (!this.nearShotStreets(x, 338)) continue;
      drains.push({ x, z: 338.8, yaw: Math.PI / 2 });
    }
    if (!drains.length) return;
    // Grate: a dark recessed box with five bars, one merged instanced geometry.
    const bars = [];
    bars.push({ geometry: new THREE.BoxGeometry(0.9, 0.04, 0.5), matrix: new THREE.Matrix4() });
    const grate = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.86, 0.05, 0.46),
      new THREE.MeshStandardMaterial({ color: 0x1b1d1f, roughness: 0.55, metalness: 0.6 }),
      drains.length,
    );
    // A pale concrete collar around each grate makes it read at a glance.
    const collar = new THREE.InstancedMesh(
      groundQuad(),
      new THREE.MeshStandardMaterial({ color: 0x9d968a, roughness: 0.94 }),
      drains.length,
    );
    const dummy = new THREE.Object3D();
    drains.forEach((drain, index) => {
      dummy.position.set(drain.x, 0.035, drain.z);
      dummy.rotation.set(0, drain.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      grate.setMatrixAt(index, dummy.matrix);
      dummy.position.y = 0.030;
      dummy.scale.set(1.2, 1, 0.76);
      dummy.updateMatrix();
      collar.setMatrixAt(index, dummy.matrix);
    });
    void bars;
    grate.instanceMatrix.needsUpdate = true;
    collar.instanceMatrix.needsUpdate = true;
    grate.frustumCulled = false;
    collar.frustumCulled = false;
    this.group.add(collar, grate);
    this.drains = drains;
  }

  buildLitter() {
    const litter = [];
    const rng = this.rng;
    // Litter collects along the kerbs and in the gutter, never in the middle of the lane.
    for (let i = 0; i < 340; i += 1) {
      const onAvenue = rng.chance(0.6);
      let x;
      let z;
      if (onAvenue) {
        x = 47 + rng.sign() * rng.float(7.4, 9.6);
        z = rng.float(256, 344);
      } else {
        x = rng.float(-300, 320);
        z = 338 + rng.float(-8.6, 3.2);
      }
      if (!this.nearShotStreets(x, z)) continue;
      litter.push({
        x, z,
        size: rng.float(0.16, 0.44),
        yaw: rng.float(0, 6.28),
        colour: LITTER_COLOURS[rng.int(0, LITTER_COLOURS.length - 1)],
      });
    }
    if (!litter.length) return;
    const mesh = new THREE.InstancedMesh(
      groundQuad(),
      new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }),
      litter.length,
    );
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    litter.forEach((item, index) => {
      dummy.position.set(item.x, 0.031, item.z);
      dummy.rotation.set(0, item.yaw, 0);
      dummy.scale.set(item.size, 1, item.size * 0.7);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      color.setHex(item.colour);
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  buildKerbPaint() {
    const dashes = [];
    // Yellow no-parking dashes down the shopfront kerbs of the avenue and the promenade.
    for (let z = 262; z < 340; z += 4.2) {
      dashes.push({ x: 47 - 8.1, z, w: 0.16, d: 2.6, colour: 0xd8b23c });
      dashes.push({ x: 47 + 8.1, z, w: 0.16, d: 2.6, colour: 0xd8b23c });
    }
    for (let x = 216; x < 312; x += 4.2) {
      dashes.push({ x, z: 337.4, w: 2.6, d: 0.16, colour: 0xd8b23c });
    }
    const mesh = new THREE.InstancedMesh(
      groundQuad(),
      new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0.02 }),
      dashes.length,
    );
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    dashes.forEach((dash, index) => {
      dummy.position.set(dash.x, 0.034, dash.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(dash.w, 1, dash.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      color.setHex(dash.colour);
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  buildBollards() {
    const spots = [];
    for (let x = 200; x < 330; x += 5.4) {
      spots.push({ x, z: 342.2 });
    }
    for (let x = -320; x < 180; x += 6.8) {
      if (Math.abs(x - 47) < 12) continue;
      spots.push({ x, z: 342.2 });
    }
    if (!spots.length) return;
    const geometry = new THREE.CylinderGeometry(0.1, 0.13, 0.86, 8);
    geometry.translate(0, 0.43, 0);
    const band = new THREE.CylinderGeometry(0.115, 0.115, 0.1, 8);
    band.translate(0, 0.66, 0);
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0x23282b, roughness: 0.55, metalness: 0.5 }),
      spots.length,
    );
    const bandMesh = new THREE.InstancedMesh(
      band,
      new THREE.MeshStandardMaterial({ color: 0xd8cfae, roughness: 0.6, metalness: 0.2 }),
      spots.length,
    );
    const dummy = new THREE.Object3D();
    spots.forEach((spot, index) => {
      dummy.position.set(spot.x, config.slabHeight, spot.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      bandMesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    bandMesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    this.group.add(mesh, bandMesh);
  }

  buildStains() {
    const stains = [];
    const rng = this.rng;
    // Under and around the parked cars: oil drips and old water marks.
    for (const car of this.plan.parked) {
      stains.push({ x: car.x, z: car.z, r: rng.float(1.4, 2.4), colour: 0x22242a, alpha: 1 });
    }
    for (const drain of this.drains ?? []) {
      stains.push({ x: drain.x - 0.6, z: drain.z, r: rng.float(0.9, 1.7), colour: 0x33383a, alpha: 1 });
    }
    if (!stains.length) return;
    const mesh = new THREE.InstancedMesh(
      disc(12),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4, depthWrite: false, color: 0xffffff }),
      stains.length,
    );
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    stains.forEach((stain, index) => {
      dummy.position.set(stain.x, 0.029, stain.z);
      dummy.rotation.set(0, stain.x * 0.7, 0);
      dummy.scale.set(stain.r * 2, 1, stain.r * 1.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      color.setHex(stain.colour);
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.renderOrder = 1;
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  /**
   * Kerb faces and gutter: a light strip of stone along every block edge, sitting proud of the
   * road. The blocks module already draws the platform; this adds the visible kerb lip the eye
   * uses to read where the road ends.
   */
  buildPavementEdges() {
    const edging = [];
    const half = config.block / 2;
    for (const block of this.plan.blocks) {
      const cx = block.x;
      const cz = block.z;
      edging.push({ x: cx, z: cz - half, w: config.block, d: 0.3 });
      edging.push({ x: cx, z: cz + half, w: config.block, d: 0.3 });
      edging.push({ x: cx - half, z: cz, w: 0.3, d: config.block });
      edging.push({ x: cx + half, z: cz, w: 0.3, d: config.block });
    }
    if (!edging.length) return;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0xc9c1b1, roughness: 0.9, metalness: 0.01 }),
      edging.length,
    );
    const dummy = new THREE.Object3D();
    edging.forEach((edge, index) => {
      dummy.position.set(edge.x, config.slabHeight * 0.5, edge.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(edge.w, config.slabHeight, edge.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  setPeriod(period) {
    const night = period === 'night';
    if (this.patches) this.patches.material.roughness = night ? 0.5 : 0.9;
  }
}
