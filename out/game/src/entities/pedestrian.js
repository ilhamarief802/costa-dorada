// Pedestrians: almost a hundred people on the block perimeters and zebra crossings. Seven
// instanced parts per person (jacket, hips, head, hair, two arms, two legs) plus one instanced
// blob shadow, so the whole crowd costs nine draw calls. Walkers swing opposite limbs from the
// hip and shoulder, some sit on benches or lean in a doorway, and gunfire sends everyone within
// earshot sprinting away from the noise.
import config from '../core/config.js';
import Rng from '../core/rng.js';
import { contactShadowTexture } from '../core/assets.js';
import { resolveCircleBox } from '../core/math.js';

const THREE = globalThis.THREE;

const SHIRTS = [
  0xe8e0cf, 0xc75b4a, 0x3f6f86, 0xd8a95a, 0x5b7d58, 0x8b5a7a, 0xe2b7a0,
  0x384b5e, 0xb04b62, 0xcfc3a4, 0x6f8f96, 0xd97b4a, 0xf0d14e, 0x2f5a44,
];
const SKINS = [0xe8b98f, 0xc98d62, 0x9d6644, 0x6f4530, 0xf0c9a4, 0xb8794f];
const TROUSERS = [0x2f3540, 0x4a4f57, 0x7c6b53, 0x2b3a4a, 0x5a4a3e, 0x27302f, 0xd8d2c4];
const HAIRS = [0x2a1c14, 0x4a3220, 0x171717, 0x6b4a2a, 0x9a8d7a, 0xc9a66b];

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

// Part geometries, built once and shared by the whole crowd. Figures face +Z.
const G = {
  // Jacket: tapered torso with shoulders wider than the waist.
  torso: (() => {
    const geometry = new THREE.BoxGeometry(0.46, 0.62, 0.27, 1, 2, 1);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      if (y > 0.1) position.setX(i, position.getX(i) * 1.12);
      if (y < -0.1) position.setX(i, position.getX(i) * 0.9);
    }
    geometry.computeVertexNormals();
    return geometry;
  })(),
  hips: new THREE.BoxGeometry(0.36, 0.24, 0.24),
  head: new THREE.SphereGeometry(0.115, 10, 8),
  hair: (() => {
    const geometry = new THREE.SphereGeometry(0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
    geometry.translate(0, 0.022, -0.006);
    return geometry;
  })(),
  arm: new THREE.BoxGeometry(0.105, 0.44, 0.11),
  // Legs run from the hip socket at 0.78 down to a sole at 0.0, so feet touch the pavement.
  leg: (() => {
    const geometry = new THREE.BoxGeometry(0.135, 0.78, 0.15);
    geometry.translate(0, -0.39, 0);
    return geometry;
  })(),
  // A shoe box at the ankle, so a foot reads against the paving.
  shoe: new THREE.BoxGeometry(0.15, 0.09, 0.24),
};

function ring(count, extra) {
  return { count, extra };
}

export default class Pedestrians {
  constructor(plan) {
    this.plan = plan;
    this.group = new THREE.Group();
    this.group.name = 'pedestrians';
    this.rng = new Rng((plan.seed ^ 0x2f7b1a3d) >>> 0);
    this.peds = [];
    this.dummy = new THREE.Object3D();
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
        scale: rng.float(0.92, 1.08),
        phase: rng.float(0, Math.PI * 2),
        stride: rng.float(1.0, 1.35),
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
        pause: 0,
        t: 0,
        dir: 1,
        sit: 0,
        lean: 0,
        pinned: false,
        strideScale: 1,
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
  }

  buildMeshes() {
    const total = this.peds.length;
    const skinMaterial = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
    const hairMaterial = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
    const clothMaterial = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0 });
    const trouserMaterial = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
    const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.78, metalness: 0.04 });
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    const make = (geometry, material, count) => {
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    };

    this.torsos = make(G.torso, clothMaterial, total);
    this.hips = make(G.hips, trouserMaterial, total);
    this.heads = make(G.head, skinMaterial, total);
    this.hairs = make(G.hair, hairMaterial, total);
    this.arms = make(G.arm, clothMaterial, total * 2);
    this.legs = make(G.leg, trouserMaterial, total * 2);
    this.shoes = make(G.shoe, shoeMaterial, total * 2);

    const shadowGeometry = new THREE.PlaneGeometry(1.1, 1.1);
    shadowGeometry.rotateX(-Math.PI / 2);
    this.shadows = make(
      shadowGeometry,
      new THREE.MeshBasicMaterial({
        map: contactShadowTexture(), transparent: true, opacity: 0.62, depthWrite: false, color: 0x000000,
      }),
      total,
    );
    this.shadows.renderOrder = 2;

    // Per-instance colours, set once.
    this.peds.forEach((ped, i) => {
      this.torsos.setColorAt(i, color.setHex(ped.shirt));
      this.hips.setColorAt(i, color.setHex(ped.trousers));
      this.legs.setColorAt(i * 2, color.setHex(ped.trousers));
      this.legs.setColorAt(i * 2 + 1, color.setHex(ped.trousers));
      this.arms.setColorAt(i * 2, color.setHex(ped.shirt));
      this.arms.setColorAt(i * 2 + 1, color.setHex(ped.shirt));
      this.heads.setColorAt(i, color.setHex(ped.skin));
      this.hairs.setColorAt(i, color.setHex(ped.hair));
    });
    for (const mesh of [this.torsos, this.hips, this.heads, this.hairs, this.arms, this.legs, this.shoes]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    void dummy;
  }

  /**
   * Pin a group of people to an explicit pose, for staging. `entries` are {x, z, yaw, walk?}.
   * The first `entries.length` free pedestrians are used, so call this after `releasePins`.
   */
  place(entries) {
    this.releasePins();
    let cursor = 0;
    for (const entry of entries) {
      let ped = null;
      for (let i = 0; i < this.peds.length; i += 1) {
        const candidate = this.peds[(cursor + i) % this.peds.length];
        if (candidate.pinned || candidate.dead) continue;
        ped = candidate;
        cursor = (cursor + i + 1) % this.peds.length;
        break;
      }
      if (!ped) break;
      ped.pinned = true;
      ped.x = entry.x;
      ped.z = entry.z;
      ped.yaw = entry.yaw ?? 0;
      ped.ground = entry.ground ?? this.plan.heightAt(ped.x, ped.z);
      ped.phase = entry.phase ?? this.rng.float(0, Math.PI * 2);
      ped.strideScale = entry.walk ?? 1;
      ped.sit = 0;
      ped.lean = 0;
      ped.panic = 0;
      ped.pause = 0;
    }
    this.update(0);
  }

  /** Give the whole crowd back to its paths; pinned people resume where they were put. */
  releasePins() {
    for (const ped of this.peds) {
      ped.pinned = false;
      ped.hidden = false;
    }
  }

  /**
   * For a still frame: keep only the people who were explicitly placed. The rest are moved far
   * below the world so no stray walker wanders through the composition while it is being staged.
   */
  hideUnpinned() {
    for (const ped of this.peds) ped.hidden = !ped.pinned;
    this.update(0);
  }

  /** A fan of walkers along a street, facing along it: the cover-shot crowd. */
  stageCover() {
    const entries = [];
    const rng = this.rng;
    for (let i = 0; i < 26; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const along = 290 + (i >> 1) * 3.1;
      const across = side * (9.4 + rng.float(0, 3.4));
      entries.push({ x: 28 + across, z: along, yaw: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2, walk: rng.float(0.7, 1.3) });
    }
    // A knot on the zebra crossing, mid-stride.
    for (let i = 0; i < 8; i += 1) {
      entries.push({ x: 20 + i * 2.2, z: 316 + (i % 2) * 1.4, yaw: Math.PI, walk: 1.2 });
    }
    this.place(entries);
  }

  /**
   * A bullet found this person. `ref` is the pedestrian object the combat system hit; the fall
   * direction is the sign of the shot's lateral travel.
   */
  kill(ref, fallDir = 1) {
    if (!ref || ref.dead) return;
    ref.dead = true;
    ref.deadT = 0;
    ref.deathDir = fallDir >= 0 ? 1 : -1;
    ref.panic = 0;
  }

  /**
   * Everyone within `radius` of a noise drops what they are doing and runs away from it. Returns
   * how many heard, which the caller uses to decide whether a crime was witnessed.
   */
  panicAt(x, z, radius = 30, force = 8) {
    let heard = 0;
    for (const ped of this.peds) {
      if (ped.dead) continue;
      const dx = ped.x - x;
      const dz = ped.z - z;
      const distance = Math.hypot(dx, dz);
      if (distance > radius) continue;
      const length = distance || 1;
      ped.panicX = (dx / length) * force;
      ped.panicZ = (dz / length) * force;
      ped.panic = 3.4;
      heard += 1;
    }
    return heard;
  }

  /** The nearest living pedestrian to a point, for target selection. */
  nearest(x, z, maxDistance = 4) {
    let best = null;
    let bestDistance = maxDistance;
    for (const ped of this.peds) {
      if (ped.dead) continue;
      const distance = Math.hypot(ped.x - x, ped.z - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = ped;
      }
    }
    return best;
  }

  strike(x, z, radius, speed) {
    let hit = null;
    for (const ped of this.peds) {
      if (ped.dead) continue;
      const distance = Math.hypot(ped.x - x, ped.z - z);
      if (distance < radius) {
        ped.dead = true;
        ped.deadT = 0;
        ped.deathDir = this.rng.chance(0.5) ? 1 : -1;
        if (!hit) hit = { x: ped.x, z: ped.z };
      }
    }
    return hit;
  }

  /** Everyone within earshot runs directly away from a point. */
  scatter(x, z, radius = 26) {
    for (const ped of this.peds) {
      const distance = Math.hypot(ped.x - x, ped.z - z);
      if (distance > radius) continue;
      ped.panic = this.rng.float(2.4, 4.4);
      const angle = Math.atan2(ped.x - x, ped.z - z) + this.rng.float(-0.4, 0.4);
      ped.panicX = Math.sin(angle);
      ped.panicZ = Math.cos(angle);
    }
  }

  update(dt) {
    const peds = this.peds;
    const dummy = this.dummy;
    for (let i = 0; i < peds.length; i += 1) {
      const ped = peds[i];
      const L = i * 2;

      if (ped.dead) {
        ped.deadT += dt;
        // Fall: tip over around the feet and lie still.
        const fall = Math.min(1, ped.deadT * 2.6);
        dummy.position.set(ped.x, ped.ground + 0.05, ped.z);
        dummy.rotation.set(Math.PI / 2 * fall, ped.yaw, 0);
        dummy.scale.set(ped.scale, ped.scale, ped.scale);
        dummy.updateMatrix();
        this.torsos.setMatrixAt(i, dummy.matrix);
        this.hips.setMatrixAt(i, dummy.matrix);
        this.heads.setMatrixAt(i, dummy.matrix);
        this.hairs.setMatrixAt(i, dummy.matrix);
        this.arms.setMatrixAt(L, dummy.matrix);
        this.arms.setMatrixAt(L + 1, dummy.matrix);
        this.legs.setMatrixAt(L, dummy.matrix);
        this.legs.setMatrixAt(L + 1, dummy.matrix);
        this.shoes.setMatrixAt(L, dummy.matrix);
        this.shoes.setMatrixAt(L + 1, dummy.matrix);
        dummy.position.set(ped.x, ped.ground + 0.04, ped.z);
        dummy.rotation.set(0, ped.yaw, 0);
        dummy.scale.set(1.5, 1, 1.1);
        dummy.updateMatrix();
        this.shadows.setMatrixAt(i, dummy.matrix);
        continue;
      }

      // Pinned away for a still frame: park the parts far below the world.
      if (ped.hidden) {
        dummy.position.set(0, -90, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.001, 0.001, 0.001);
        dummy.updateMatrix();
        this.torsos.setMatrixAt(i, dummy.matrix);
        this.hips.setMatrixAt(i, dummy.matrix);
        this.heads.setMatrixAt(i, dummy.matrix);
        this.hairs.setMatrixAt(i, dummy.matrix);
        this.arms.setMatrixAt(L, dummy.matrix);
        this.arms.setMatrixAt(L + 1, dummy.matrix);
        this.legs.setMatrixAt(L, dummy.matrix);
        this.legs.setMatrixAt(L + 1, dummy.matrix);
        this.shoes.setMatrixAt(L, dummy.matrix);
        this.shoes.setMatrixAt(L + 1, dummy.matrix);
        this.shadows.setMatrixAt(i, dummy.matrix);
        continue;
      }

      // Motion: panic overrides path, pinned people stand still.
      let moving = 0;
      if (ped.panic > 0) {
        ped.panic -= dt;
        ped.x += ped.panicX * ped.speed * 2.4 * dt;
        ped.z += ped.panicZ * ped.speed * 2.4 * dt;
        ped.yaw = Math.atan2(ped.panicX, ped.panicZ);
        moving = ped.speed * 2.4;
        ped.phase += dt * 13;
      } else if (!ped.pinned) {
        if (ped.kind === 'walk') {
          ped.t += ped.speed * ped.dir * dt;
          const point = samplePath(ped.path, ped.t);
          ped.x = point.x;
          ped.z = point.z;
          ped.yaw = point.heading + (ped.dir > 0 ? 0 : Math.PI);
          moving = ped.speed;
          ped.phase += dt * ped.speed * 3.1;
        } else if (ped.kind === 'cross') {
          ped.t += ped.speed * ped.dir * dt * 0.06;
          if (ped.t > 1) { ped.t = 1; ped.dir = -1; }
          if (ped.t < 0) { ped.t = 0; ped.dir = 1; }
          ped.x = ped.ax + (ped.bx - ped.ax) * ped.t;
          ped.z = ped.az + (ped.bz - ped.az) * ped.t;
          ped.yaw = Math.atan2(ped.bx - ped.ax, ped.bz - ped.az) * (ped.dir > 0 ? 1 : -1);
          moving = ped.speed;
          ped.phase += dt * ped.speed * 3.1;
        }
        if (ped.kind !== 'sit' && ped.kind !== 'lean') ped.ground = this.plan.heightAt(ped.x, ped.z);
      } else {
        ped.phase += dt * 1.4;
      }

      // Keep off the inside of buildings.
      if (moving > 0) {
        const nearby = this.plan.queryColliders(ped.x, ped.z, 0.5, []);
        for (const box of nearby) {
          if (box.kind !== 'building') continue;
          const push = resolveCircleBox(ped.x, ped.z, 0.42, box);
          if (push) { ped.x = push.x; ped.z = push.z; }
        }
      }

      const gait = Math.min(1, moving * 0.6);
      // Even at rest there is a slow idle sway, so a still figure is never perfectly rigid.
      const idle = 0.1 + Math.sin(ped.phase * 0.9) * 0.05;
      const swing = Math.sin(ped.phase) * 0.55 * Math.max(gait, idle) * ped.strideScale;
      const bounce = Math.abs(Math.sin(ped.phase)) * 0.035 * gait;
      const scale = ped.scale * (ped.sit ? 0.94 : 1);
      const baseY = ped.ground + bounce - (ped.sit ? 0.26 : 0);
      const yaw = ped.yaw;

      // Torso and hips. Hip joint sits at 0.78; the torso hangs above it.
      dummy.position.set(ped.x, baseY + 1.06 * scale, ped.z);
      dummy.rotation.set(ped.sit ? 0.16 : 0, yaw, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      this.torsos.setMatrixAt(i, dummy.matrix);

      dummy.position.set(ped.x, baseY + 0.78 * scale, ped.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      this.hips.setMatrixAt(i, dummy.matrix);

      // Head and hair.
      dummy.position.set(ped.x, baseY + 1.5 * scale, ped.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      this.heads.setMatrixAt(i, dummy.matrix);
      this.hairs.setMatrixAt(i, dummy.matrix);

      // Arms swing opposite the legs, pivoting at the shoulder.
      const shoulderY = baseY + 1.24 * scale;
      for (let side = 0; side < 2; side += 1) {
        const dirSign = side === 0 ? 1 : -1;
        const armSwing = swing * dirSign;
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        const offsetX = dirSign * 0.27 * scale;
        const wx = ped.x + offsetX * cos;
        const wz = ped.z - offsetX * sin;
        dummy.position.set(wx, shoulderY - 0.2 * scale, wz);
        dummy.rotation.set(armSwing, yaw, 0);
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        this.arms.setMatrixAt(L + side, dummy.matrix);

        // Legs swing from the hip socket, and the shoe rides the ankle.
        const hipX = dirSign * 0.1 * scale;
        const lx = ped.x + hipX * cos;
        const lz = ped.z - hipX * sin;
        const legAngle = -armSwing * 1.15;
        dummy.position.set(lx, baseY + 0.78 * scale, lz);
        dummy.rotation.set(legAngle, yaw, 0);
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        this.legs.setMatrixAt(L + side, dummy.matrix);

        // The shoe is placed at the leg's end, forward of the ankle when the leg swings.
        const swingReach = Math.sin(legAngle) * 0.78 * scale;
        dummy.position.set(lx, baseY + 0.05 * scale, lz + swingReach * Math.cos(yaw));
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        this.shoes.setMatrixAt(L + side, dummy.matrix);
      }

      // Contact shadow under the feet.
      dummy.position.set(ped.x, ped.ground + 0.04, ped.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(scale * 0.9, 1, scale * 0.9);
      dummy.updateMatrix();
      this.shadows.setMatrixAt(i, dummy.matrix);
    }

    for (const mesh of [this.torsos, this.hips, this.heads, this.hairs, this.arms, this.legs, this.shoes, this.shadows]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
