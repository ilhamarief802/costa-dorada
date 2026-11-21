// Pedestrians: 70 people on the block perimeters and zebra crossings. Six instanced parts per
// person (torso, head, hair, two arms, two legs) plus one instanced blob shadow, so the whole
// crowd is seven draw calls. Walkers swing opposite limbs, some sit on benches or lean in a
// doorway, and gunfire sends everyone within earshot sprinting away from the noise.
import config from '../core/config.js';
import Rng from '../core/rng.js';
import { contactShadowTexture } from '../core/assets.js';
import { resolveCircleBox } from '../core/math.js';

const THREE = globalThis.THREE;

const SHIRTS = [0xe8e0cf, 0xc75b4a, 0x3f6f86, 0xd8a95a, 0x5b7d58, 0x8b5a7a, 0xe2b7a0, 0x384b5e, 0xb04b62, 0xcfc3a4, 0x6f8f96, 0xd97b4a];
const SKINS = [0xe8b98f, 0xc98d62, 0x9d6644, 0x6f4530, 0xf0c9a4, 0xb8794f];
const TROUSERS = [0x2f3540, 0x4a4f57, 0x7c6b53, 0x2b3a4a, 0x5a4a3e, 0x27302f];
const HAIRS = [0x2a1c14, 0x4a3220, 0x171717, 0x6b4a2a, 0x9a8d7a];

function blockPath(block, radius) {
  const c = 4;
  const minX = block.x - radius;
  const maxX = block.x + radius;
  const minZ = block.z - radius;
  const maxZ = block.z + radius;
  const points = [
    [minX + c, minZ], [maxX - c, minZ], [maxX, minZ + c],
    [maxX, maxZ - c], [maxX - c, maxZ], [minX + c, maxZ],
    [minX, maxZ - c], [minX, minZ + c],
  ];
  let total = 0;
  const lengths = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lengths.push(length);
    total += length;
  }
  return { points, lengths, total };
}

function samplePath(path, distance) {
  let remaining = ((distance % path.total) + path.total) % path.total;
  for (let i = 0; i < path.points.length; i += 1) {
    const length = path.lengths[i];
    if (remaining <= length) {
      const a = path.points[i];
      const b = path.points[(i + 1) % path.points.length];
      const t = length > 0 ? remaining / length : 0;
      return {
        x: a[0] + (b[0] - a[0]) * t,
        z: a[1] + (b[1] - a[1]) * t,
        heading: Math.atan2(b[0] - a[0], b[1] - a[1]),
      };
    }
    remaining -= length;
  }
  const first = path.points[0];
  return { x: first[0], z: first[1], heading: 0 };
}

export default class Pedestrians {
  constructor(plan) {
    this.plan = plan;
    this.group = new THREE.Group();
    this.group.name = 'pedestrians';
    this.rng = new Rng((plan.seed ^ 0x2f7b1a3d) >>> 0);
    this.peds = [];
    this.tmp = new THREE.Object3D();
    this.root = new THREE.Object3D();
    this.buildCrowd();
    this.buildMeshes();
  }

  buildCrowd() {
    const rng = this.rng;
    const blocks = this.plan.blocks;
    const count = config.pedestrians.walkers;
    const seatCount = Math.min(config.pedestrians.seats, this.plan.benches.length);
    const leanCount = config.pedestrians.leaners;
    const crossCount = config.pedestrians.crossing;

    const addPed = (kind) => {
      const ped = {
        kind,
        shirt: rng.pick(SHIRTS),
        skin: rng.pick(SKINS),
        trousers: rng.pick(TROUSERS),
        hair: rng.pick(HAIRS),
        scale: rng.float(0.9, 1.06),
        phase: rng.float(0, Math.PI * 2),
        stride: rng.float(1.15, 1.55),
        speed: rng.float(1.15, 1.62),
        x: 0,
        z: 0,
        yaw: rng.float(0, Math.PI * 2),
        ground: config.slabHeight,
        panic: 0,
        panicX: 0,
        panicZ: 0,
        dead: false,
        deadT: 0,
        deathDir: 1,
        override: null,
        pause: 0,
        t: 0,
        dir: 1,
        sit: 0,
        lean: 0,
      };
      if (kind === 'walk') {
        ped.path = blockPath(rng.pick(blocks), 34.3);
        ped.t = rng.float(0, ped.path.total);
        ped.dir = rng.chance(0.5) ? 1 : -1;
        ped.speed = rng.float(1.0, 1.5);
      } else if (kind === 'cross') {
        const junctionX = rng.pick(this.plan.roads.x);
        const junctionZ = rng.pick(this.plan.roads.z);
        const horizontal = rng.chance(0.5);
        const side = rng.chance(0.5) ? 1 : -1;
        if (horizontal) {
          ped.ax = junctionX - 11.4;
          ped.az = junctionZ + side * 11.6;
          ped.bx = junctionX + 11.4;
          ped.bz = junctionZ + side * 11.6;
        } else {
          ped.ax = junctionX + side * 11.6;
          ped.az = junctionZ - 11.4;
          ped.bx = junctionX + side * 11.6;
          ped.bz = junctionZ + 11.4;
        }
        ped.t = rng.float(0, 1);
        ped.dir = rng.chance(0.5) ? 1 : -1;
        ped.speed = rng.float(1.0, 1.35);
      } else if (kind === 'sit') {
        const bench = this.plan.benches[this.peds.filter((p) => p.kind === 'sit').length];
        if (!bench) return null;
        ped.x = bench.x;
        ped.z = bench.z;
        ped.yaw = bench.yaw;
        ped.baseYaw = bench.yaw;
        ped.ground = bench.y ?? config.slabHeight;
        ped.sit = 1;
      } else {
        const block = rng.pick(blocks);
        const side = rng.int(0, 3);
        const offset = 35.1;
        const along = rng.float(-20, 20);
        if (side === 0) { ped.x = block.x + along; ped.z = block.z - offset; ped.yaw = Math.PI; }
        else if (side === 1) { ped.x = block.x + along; ped.z = block.z + offset; ped.yaw = 0; }
        else if (side === 2) { ped.x = block.x - offset; ped.z = block.z + along; ped.yaw = Math.PI / 2; }
        else { ped.x = block.x + offset; ped.z = block.z + along; ped.yaw = -Math.PI / 2; }
        ped.baseYaw = ped.yaw;
        ped.ground = this.plan.heightAt(ped.x, ped.z);
        ped.lean = 1;
      }
      this.peds.push(ped);
      return ped;
    };

    for (let i = 0; i < count - crossCount - seatCount - leanCount; i += 1) addPed('walk');
    for (let i = 0; i < crossCount; i += 1) addPed('cross');
    for (let i = 0; i < seatCount; i += 1) addPed('sit');
    for (let i = 0; i < leanCount; i += 1) addPed('lean');
    this.updatePositions(0);
  }

  buildMeshes() {
    const total = this.peds.length;
    const torsoGeometry = new THREE.BoxGeometry(0.5, 0.62, 0.29);
    torsoGeometry.translate(0, 1.12, 0);
    const headGeometry = new THREE.BoxGeometry(0.25, 0.27, 0.25);
    headGeometry.translate(0, 1.57, 0);
    const hairGeometry = new THREE.BoxGeometry(0.27, 0.1, 0.27);
    hairGeometry.translate(0, 1.72, 0);
    const armGeometry = new THREE.BoxGeometry(0.12, 0.56, 0.13);
    armGeometry.translate(0, -0.27, 0);
    const legGeometry = new THREE.BoxGeometry(0.17, 0.8, 0.19);
    legGeometry.translate(0, -0.38, 0);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0.02 });
    const skinMaterial = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    const hairMaterial = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    this.torsos = new THREE.InstancedMesh(torsoGeometry, material.clone(), total);
    this.heads = new THREE.InstancedMesh(headGeometry, skinMaterial, total);
    this.hairs = new THREE.InstancedMesh(hairGeometry, hairMaterial, total);
    this.arms = new THREE.InstancedMesh(armGeometry, material.clone(), total * 2);
    this.legs = new THREE.InstancedMesh(legGeometry, material.clone(), total * 2);
    const shadowGeometry = new THREE.PlaneGeometry(1.35, 1.35);
    shadowGeometry.rotateX(-Math.PI / 2);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: contactShadowTexture(), transparent: true, opacity: 0.38, depthWrite: false,
    });
    this.shadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, total);

    const color = new THREE.Color();
    this.peds.forEach((ped, i) => {
      this.torsos.setColorAt(i, color.setHex(ped.shirt));
      this.heads.setColorAt(i, color.setHex(ped.skin));
      this.hairs.setColorAt(i, color.setHex(ped.hair));
      this.arms.setColorAt(i * 2, color.setHex(ped.shirt));
      this.arms.setColorAt(i * 2 + 1, color.setHex(ped.shirt));
      this.legs.setColorAt(i * 2, color.setHex(ped.trousers));
      this.legs.setColorAt(i * 2 + 1, color.setHex(ped.trousers));
    });
    for (const mesh of [this.torsos, this.heads, this.hairs, this.arms, this.legs]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.group.add(mesh);
    }
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 1;
    this.group.add(this.shadows);
  }

  /** Freeze a few people on the promenade so the cover frame is never an empty street. */
  stageCover() {
    const spots = [
      [30, 338.4, Math.PI], [36, 337.8, -Math.PI / 2], [24, 338.8, 2.4],
      [42, 337.4, 1.1], [27, 317.8, 1.57], [35, 317.4, -1.2],
      [45, 318.2, 2.0], [33, 320.2, 0.2],
    ];
    for (let i = 0; i < spots.length; i += 1) {
      const ped = this.peds[i];
      if (!ped) continue;
      ped.override = { x: spots[i][0], z: spots[i][1], yaw: spots[i][2] };
      ped.panic = 0;
    }
    this.updatePositions(0);
  }

  updatePositions(dt) {
    for (const ped of this.peds) {
      if (ped.dead) continue;
      if (ped.override) {
        ped.x = ped.override.x;
        ped.z = ped.override.z;
        ped.yaw = ped.override.yaw;
        ped.ground = this.plan.heightAt(ped.x, ped.z);
        this.pushOutOfBuildings(ped);
        continue;
      }
      if (ped.panic > 0) {
        ped.x += ped.panicX * ped.speed * 2.2 * dt;
        ped.z += ped.panicZ * ped.speed * 2.2 * dt;
        ped.yaw = Math.atan2(ped.panicX, ped.panicZ);
        this.pushOutOfBuildings(ped);
        continue;
      }
      if (ped.kind === 'walk') {
        ped.t += ped.speed * dt * ped.dir;
        const point = samplePath(ped.path, ped.t);
        ped.x = point.x;
        ped.z = point.z;
        ped.yaw = point.heading + (ped.dir > 0 ? 0 : Math.PI);
        ped.ground = this.plan.heightAt(ped.x, ped.z);
      } else if (ped.kind === 'cross') {
        if (ped.pause > 0) {
          ped.pause -= dt;
        } else {
          ped.t += (ped.speed * dt * ped.dir) / 23;
          if (ped.t > 1) { ped.t = 1; ped.dir = -1; ped.pause = 2.2; }
          if (ped.t < 0) { ped.t = 0; ped.dir = 1; ped.pause = 2.4; }
        }
        ped.x = ped.ax + (ped.bx - ped.ax) * ped.t;
        ped.z = ped.az + (ped.bz - ped.az) * ped.t;
        ped.yaw = Math.atan2((ped.bx - ped.ax) * ped.dir, (ped.bz - ped.az) * ped.dir);
        ped.ground = this.plan.heightAt(ped.x, ped.z);
      } else if (ped.kind === 'lean') {
        ped.yaw = ped.baseYaw + Math.sin(ped.phase + ped.t * 0.35) * 0.06;
      }
      this.pushOutOfBuildings(ped);
    }
  }

  /** Keep every body on the pavement: a footprint that reaches the kerb pushes them clear. */
  pushOutOfBuildings(ped) {
    for (let pass = 0; pass < 2; pass += 1) {
      let moved = false;
      const boxes = this.plan.queryColliders(ped.x, ped.z, 0.8, []);
      for (const box of boxes) {
        if (box.kind !== 'building') continue;
        const resolved = resolveCircleBox(ped.x, ped.z, 0.38, box);
        if (resolved) {
          ped.x = resolved.x;
          ped.z = resolved.z;
          moved = true;
        }
      }
      if (!moved) break;
    }
    ped.ground = this.plan.heightAt(ped.x, ped.z);
  }

  update(dt, ctx = {}) {
    for (const ped of this.peds) {
      if (ped.panic > 0) ped.panic = Math.max(0, ped.panic - dt);
      if (ped.dead) {
        ped.deadT += dt;
        if (ped.deadT > 18) {
          ped.dead = false;
          ped.deadT = 0;
          ped.panic = 0;
          if (ped.kind === 'walk') ped.t = 0;
        }
      }
      ped.phase += dt * (ped.panic > 0 ? 11.5 : ped.kind === 'walk' || ped.kind === 'cross' ? 6.2 : 0.9);
    }
    this.updatePositions(dt);
    this.writeMatrices();
    void ctx;
  }

  writeMatrices() {
    const dummy = this.root;
    const part = this.tmp;
    const trans = new THREE.Matrix4();
    const rot = new THREE.Matrix4();
    const final = new THREE.Matrix4();
    const headMatrix = new THREE.Matrix4();
    const hairMatrix = new THREE.Matrix4();
    const shadow = new THREE.Matrix4();
    const euler = new THREE.Euler();
    for (let i = 0; i < this.peds.length; i += 1) {
      const ped = this.peds[i];
      const gait = ped.panic > 0 ? 1.05 : 0.55;
      const swing = Math.sin(ped.phase) * gait;
      const bob = Math.abs(Math.cos(ped.phase)) * 0.035 * (ped.panic > 0 ? 1.6 : 1);
      const fallen = ped.dead ? Math.min(1, ped.deadT / 0.45) : 0;
      const fall = fallen * (Math.PI / 2) * ped.deathDir;
      const ground = ped.ground;
      const sit = ped.sit;
      dummy.position.set(ped.x, ground + (ped.dead ? -0.72 * fallen : 0), ped.z);
      dummy.rotation.set(0, ped.yaw, fall);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      const bodyY = -bob - sit * 0.3;
      part.position.set(0, bodyY, 0);
      part.rotation.set(sit * -0.06, 0, 0);
      part.scale.set(ped.scale, ped.scale, ped.scale);
      part.updateMatrix();
      const base = part.matrix;
      this.torsos.setMatrixAt(i, base);
      trans.makeTranslation(0, 1.57, 0);
      headMatrix.multiplyMatrices(base, trans);
      trans.makeTranslation(0, 1.72, 0);
      hairMatrix.multiplyMatrices(base, trans);
      this.heads.setMatrixAt(i, headMatrix);
      this.hairs.setMatrixAt(i, hairMatrix);

      const armLift = sit ? -1.35 : 0;
      const lean = ped.lean ? 0.12 : 0;
      const armSwing = ped.dead ? 0.4 : swing;
      for (let side = 0; side < 2; side += 1) {
        const sign = side === 0 ? 1 : -1;
        const armX = sit ? armLift : -armSwing * sign;
        const armZ = sign * (sit ? 0.9 : 0.05);
        euler.set(armX + lean, 0, armZ);
        rot.makeRotationFromEuler(euler);
        rot.setPosition(sign * 0.32, 1.4, 0);
        final.multiplyMatrices(base, rot);
        this.arms.setMatrixAt(i * 2 + side, final);
        const legX = sit ? -1.5 : armSwing * sign * 0.9;
        euler.set(legX, 0, sign * 0.03);
        rot.makeRotationFromEuler(euler);
        rot.setPosition(sign * 0.13, sit ? 0.48 : 0.78, sit ? 0.2 : 0);
        final.multiplyMatrices(base, rot);
        this.legs.setMatrixAt(i * 2 + side, final);
      }

      shadow.makeTranslation(ped.x, ground + 0.03, ped.z);
      this.shadows.setMatrixAt(i, shadow);
    }
    for (const mesh of [this.torsos, this.heads, this.hairs, this.arms, this.legs, this.shadows]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    void dummy;
  }

  panicAt(x, z, radius = 26, duration = 8) {
    let scared = 0;
    for (const ped of this.peds) {
      if (ped.dead || ped.kind === 'sit') continue;
      const dx = ped.x - x;
      const dz = ped.z - z;
      const distance = Math.hypot(dx, dz);
      if (distance > radius) continue;
      const inv = distance > 0.01 ? 1 / distance : 0;
      ped.panicX = dx * inv + (inv === 0 ? 1 : 0);
      ped.panicZ = dz * inv;
      ped.panic = duration;
      scared += 1;
    }
    return scared;
  }

  nearest(x, z, maxDistance = 2.2) {
    let best = null;
    let bestDistance = maxDistance;
    for (const ped of this.peds) {
      if (ped.dead) continue;
      const distance = Math.hypot(ped.x - x, ped.z - z);
      if (distance < bestDistance) { bestDistance = distance; best = ped; }
    }
    return best;
  }

  kill(ped, direction = 1) {
    if (!ped || ped.dead) return;
    ped.dead = true;
    ped.deadT = 0;
    ped.deathDir = direction >= 0 ? 1 : -1;
    ped.panic = 0;
  }

  /** Car strike: pedestrians within the bumper radius are knocked down. */
  strike(x, z, radius = 1.9, speed = 10) {
    let hit = null;
    for (const ped of this.peds) {
      if (ped.dead) continue;
      if (Math.hypot(ped.x - x, ped.z - z) < radius) {
        this.kill(ped, x > ped.x ? -1 : 1);
        hit = ped;
        break;
      }
    }
    return hit;
  }

  aliveCount() {
    let count = 0;
    for (const ped of this.peds) if (!ped.dead) count += 1;
    return count;
  }
}
