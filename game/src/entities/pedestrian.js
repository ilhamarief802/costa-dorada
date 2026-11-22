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
/** The accessory colours: bags, caps and towels, in the same sun-faded range as the shirts. */
const ACCENTS = [0x2a2b2e, 0xb8462f, 0x35566b, 0xd8c9a4, 0x4d6b4a, 0xa8863c, 0x7a4a52];

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
  // Forearm and hand: a short sleeve cuff and a fist, so an arm reads as an arm at 15 m rather
  // than a stick. Instanced twice per person, hung off the same shoulder pivot.
  forearm: (() => {
    const geometry = new THREE.BoxGeometry(0.088, 0.3, 0.096);
    geometry.translate(0, -0.15, 0);
    return geometry;
  })(),
  hand: new THREE.SphereGeometry(0.052, 6, 5),
  // A shoulder cap: the jacket's deltoid, which is what gives a silhouette its human taper.
  shoulder: new THREE.SphereGeometry(0.083, 7, 6),
  // Accessories. A shopping bag hangs from a hand, a cap sits on the head, a towel is slung over
  // one shoulder; each person gets exactly one of them.
  bag: new THREE.BoxGeometry(0.2, 0.26, 0.11),
  cap: (() => {
    const geometry = new THREE.SphereGeometry(0.128, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
    geometry.scale(1, 0.72, 1);
    geometry.translate(0, 0.02, 0);
    return geometry;
  })(),
  capBrim: new THREE.BoxGeometry(0.19, 0.018, 0.09),
  towel: new THREE.BoxGeometry(0.1, 0.44, 0.035),
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
    this.forearms = make(G.forearm, skinMaterial, total * 2);
    this.hands = make(G.hand, skinMaterial, total * 2);
    this.shoulders = make(G.shoulder, clothMaterial, total * 2);
    this.legs = make(G.leg, trouserMaterial, total * 2);
    this.shoes = make(G.shoe, shoeMaterial, total * 2);

    // One accessory slot per person, whichever it is. The meshes are all allocated and each
    // person's accessory is chosen in `applyLook`; unused slots are collapsed to nothing.
    this.bags = make(G.bag, clothMaterial, total);
    this.caps = make(G.cap, clothMaterial, total);
    this.capBrims = make(G.capBrim, clothMaterial, total);
    this.towels = make(G.towel, clothMaterial, total);

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
      const accent = ACCENTS[i % ACCENTS.length];
      this.torsos.setColorAt(i, color.setHex(ped.shirt));
      this.hips.setColorAt(i, color.setHex(ped.trousers));
      this.legs.setColorAt(i * 2, color.setHex(ped.trousers));
      this.legs.setColorAt(i * 2 + 1, color.setHex(ped.trousers));
      this.arms.setColorAt(i * 2, color.setHex(ped.shirt));
      this.arms.setColorAt(i * 2 + 1, color.setHex(ped.shirt));
      this.forearms.setColorAt(i * 2, color.setHex(ped.skin));
      this.forearms.setColorAt(i * 2 + 1, color.setHex(ped.skin));
      this.shoulders.setColorAt(i * 2, color.setHex(ped.shirt));
      this.shoulders.setColorAt(i * 2 + 1, color.setHex(ped.shirt));
      this.heads.setColorAt(i, color.setHex(ped.skin));
      this.hairs.setColorAt(i, color.setHex(ped.hair));
      this.bags.setColorAt(i, color.setHex(accent));
      this.caps.setColorAt(i, color.setHex(accent));
      this.capBrims.setColorAt(i, color.setHex(accent));
      this.towels.setColorAt(i, color.setHex(accent));
    });
    for (const mesh of [
      this.torsos, this.hips, this.heads, this.hairs, this.arms, this.forearms, this.hands,
      this.shoulders, this.legs, this.shoes, this.bags, this.caps, this.capBrims, this.towels,
    ]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    void dummy;
  }

  /**
   * Pin a group of people to an explicit pose, for staging. `entries` are
   * {x, z, yaw, walk?, phase?, scale?, shirt?, accessory?, pose?}.
   *
   * The first `entries.length` free pedestrians are used, so call this after `releasePins`. Every
   * staged person gets their own height, shirt colour, stride phase and accessory, which is what
   * stops a staged crowd reading as one model copied twenty times.
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
      // Look and pose. These are properties of a staged person only; the walking crowd keeps the
      // look it was built with.
      if (entry.scale !== undefined) ped.scale = entry.scale;
      if (entry.shirt !== undefined) ped.shirt = entry.shirt;
      if (entry.ground !== undefined) ped.ground = entry.ground;
      ped.accessory = entry.accessory ?? null;
      ped.pose = entry.pose ?? 'walk';
      const index = this.peds.indexOf(ped);
      if (index >= 0) {
        const color = new THREE.Color();
        if (entry.shirt !== undefined) {
          this.torsos.setColorAt(index, color.setHex(ped.shirt));
          this.arms.setColorAt(index * 2, color.setHex(ped.shirt));
          this.arms.setColorAt(index * 2 + 1, color.setHex(ped.shirt));
          this.shoulders.setColorAt(index * 2, color.setHex(ped.shirt));
          this.shoulders.setColorAt(index * 2 + 1, color.setHex(ped.shirt));
          for (const mesh of [this.torsos, this.arms, this.shoulders]) {
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          }
        }
      }
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
        this.parkAll(i, dummy);
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
        this.parkAll(i, dummy);
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
      const stride = Math.max(gait, idle) * ped.strideScale;
      const swing = Math.sin(ped.phase) * 0.55 * stride;
      const bounce = Math.abs(Math.sin(ped.phase)) * 0.035 * gait;
      const scale = ped.scale * (ped.sit ? 0.94 : 1);
      const baseY = ped.ground + bounce - (ped.sit ? 0.26 : 0);
      const yaw = ped.yaw;
      const pose = ped.pose ?? 'walk';
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);

      // A staged vendor is folded over his cart and a shopkeeper leans in a doorway; both keep the
      // legs planted while the torso pitches. The lean is in the figure's own frame, so it reads
      // the same from any camera angle.
      const torsoPitch = pose === 'vendor' ? 0.92 : pose === 'shop' ? -0.22 : pose === 'argue' ? 0.06 : (ped.sit ? 0.16 : 0);
      // A mid-crossing figure is turned off the lens and caught with its legs apart.
      const legSpread = pose === 'cross' ? 0.38 : 0;
      // A person arguing or leaning braces their arms out from the body.
      const armOut = pose === 'argue' ? 0.42 : pose === 'vendor' ? 0.34 : pose === 'shop' ? 0.16 : 0;

      // Torso and hips. Hip joint sits at 0.78; the torso hangs above it.
      dummy.position.set(ped.x, baseY + (pose === 'vendor' ? 0.94 : 1.06) * scale, ped.z);
      dummy.rotation.set(torsoPitch, yaw, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      this.torsos.setMatrixAt(i, dummy.matrix);

      dummy.position.set(ped.x, baseY + 0.78 * scale, ped.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      this.hips.setMatrixAt(i, dummy.matrix);

      // Head and hair. A bent-over vendor looks down at the cart.
      const headBob = pose === 'vendor' ? -0.09 : 0;
      const headY = baseY + (1.5 + headBob) * scale;
      const headForward = pose === 'vendor' ? 0.22 * scale : 0;
      dummy.position.set(ped.x + headForward * sin, headY, ped.z + headForward * cos);
      dummy.rotation.set(torsoPitch * 0.5, yaw, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      this.heads.setMatrixAt(i, dummy.matrix);
      this.hairs.setMatrixAt(i, dummy.matrix);

      // Accessories. Exactly one per person: a bag hanging from the right hand, a cap on the
      // head, or a towel slung over the left shoulder. The other slots collapse to nothing.
      this.writeAccessory(i, ped.accessory ?? null, ped, dummy, { baseY, scale, yaw, cos, sin, headY, armOut, swing, pose, torsoPitch });

      // Arms swing opposite the legs, pivoting at the shoulder. Each arm is a shoulder cap, an
      // upper arm, a forearm and a fist, all hung off the same pivot so they move together.
      const shoulderY = baseY + 1.24 * scale;
      for (let side = 0; side < 2; side += 1) {
        const dirSign = side === 0 ? 1 : -1;
        const armSwing = swing * dirSign + (pose === 'vendor' ? dirSign * -0.55 : 0) + armOut * dirSign * 0.5;
        const offsetX = dirSign * (0.27 + armOut * 0.1) * scale;
        const wx = ped.x + offsetX * cos;
        const wz = ped.z - offsetX * sin;
        const pivotY = shoulderY - 0.2 * scale + (pose === 'vendor' ? -0.16 * scale : 0);

        // Shoulder cap.
        dummy.position.set(ped.x + dirSign * 0.2 * scale * cos, shoulderY - 0.02 * scale, ped.z - dirSign * 0.2 * scale * sin);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        this.shoulders.setMatrixAt(L + side, dummy.matrix);

        // Upper arm, hanging from the shoulder.
        dummy.position.set(wx, pivotY, wz);
        dummy.rotation.set(armSwing, yaw, 0);
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        this.arms.setMatrixAt(L + side, dummy.matrix);

        // Forearm continues past the elbow, so the arm has a bend instead of being one stick.
        const elbowDrop = 0.22 * scale;
        const elbowY = pivotY - elbowDrop * Math.cos(armSwing);
        const elbowReach = elbowDrop * Math.sin(armSwing);
        const ex = wx + elbowReach * sin;
        const ez = wz + elbowReach * cos;
        dummy.position.set(ex, elbowY, ez);
        dummy.rotation.set(armSwing * 1.35, yaw, 0);
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        this.forearms.setMatrixAt(L + side, dummy.matrix);

        // Fist at the end of the forearm.
        const wristDrop = 0.3 * scale;
        const wristY = elbowY - wristDrop * Math.cos(armSwing * 1.35);
        const wristReach = wristDrop * Math.sin(armSwing * 1.35);
        dummy.position.set(ex + wristReach * sin, wristY, ez + wristReach * cos);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        this.hands.setMatrixAt(L + side, dummy.matrix);

        // Legs swing from the hip socket, and the shoe rides the ankle.
        const hipX = dirSign * (0.1 + legSpread * 0.08) * scale;
        const lx = ped.x + hipX * cos;
        const lz = ped.z - hipX * sin;
        const legAngle = -armSwing * 1.15 + legSpread * dirSign;
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

      // Contact shadow under the feet: wide across the shoulders and darker where the soles meet
      // the paving, which is what stops a figure reading as cut out and pasted on.
      dummy.position.set(ped.x, ped.ground + 0.038, ped.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(scale * (pose === 'cross' ? 1.15 : 0.95), 1, scale * (pose === 'cross' ? 1.25 : 1.0));
      dummy.updateMatrix();
      this.shadows.setMatrixAt(i, dummy.matrix);
    }

    for (const mesh of [
      this.torsos, this.hips, this.heads, this.hairs, this.arms, this.forearms, this.hands,
      this.shoulders, this.legs, this.shoes, this.bags, this.caps, this.capBrims, this.towels,
      this.shadows,
    ]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Write the current `dummy` matrix into every part slot for person `index`. Used by the dead and
   * hidden branches, where the whole figure is one collapsed body rather than an articulated one.
   */
  parkAll(index, dummy) {
    const L = index * 2;
    this.torsos.setMatrixAt(index, dummy.matrix);
    this.hips.setMatrixAt(index, dummy.matrix);
    this.heads.setMatrixAt(index, dummy.matrix);
    this.hairs.setMatrixAt(index, dummy.matrix);
    this.arms.setMatrixAt(L, dummy.matrix);
    this.arms.setMatrixAt(L + 1, dummy.matrix);
    this.forearms.setMatrixAt(L, dummy.matrix);
    this.forearms.setMatrixAt(L + 1, dummy.matrix);
    this.hands.setMatrixAt(L, dummy.matrix);
    this.hands.setMatrixAt(L + 1, dummy.matrix);
    this.shoulders.setMatrixAt(L, dummy.matrix);
    this.shoulders.setMatrixAt(L + 1, dummy.matrix);
    this.legs.setMatrixAt(L, dummy.matrix);
    this.legs.setMatrixAt(L + 1, dummy.matrix);
    this.shoes.setMatrixAt(L, dummy.matrix);
    this.shoes.setMatrixAt(L + 1, dummy.matrix);
    this.bags.setMatrixAt(index, dummy.matrix);
    this.caps.setMatrixAt(index, dummy.matrix);
    this.capBrims.setMatrixAt(index, dummy.matrix);
    this.towels.setMatrixAt(index, dummy.matrix);
  }

  /**
   * Write one person's single accessory into its mesh slot, collapsing the other three. A bag
   * hangs from the near hand at hip height, a cap sits on the crown with its brim forward, a towel
   * is slung over the far shoulder and hangs down the back.
   */
  writeAccessory(index, accessory, ped, dummy, frame) {
    const { scale, yaw, cos, sin, headY, pose } = frame;
    const hide = (mesh) => {
      dummy.position.set(0, -90, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.001, 0.001, 0.001);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    };
    // A leaning or bent figure's bag swings forward of the hip.
    const bagForward = pose === 'vendor' ? 0.3 : pose === 'shop' ? 0.1 : 0.06;
    for (const [name, mesh] of [['bag', this.bags], ['cap', this.caps], ['towel', this.towels]]) {
      if (accessory === name) continue;
      hide(mesh);
    }
    if (accessory === 'bag') {
      const side = 0.34 * scale;
      dummy.position.set(ped.x + side * cos + bagForward * sin, frame.baseY + 0.62 * scale, ped.z - side * sin + bagForward * cos);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      this.bags.setMatrixAt(index, dummy.matrix);
      hide(this.caps);
      hide(this.capBrims);
      hide(this.towels);
    } else if (accessory === 'cap') {
      dummy.position.set(ped.x + (pose === 'vendor' ? 0.22 * scale * sin : 0), headY + 0.1 * scale, ped.z + (pose === 'vendor' ? 0.22 * scale * cos : 0));
      dummy.rotation.set(frame.torsoPitch * 0.5, yaw, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      this.caps.setMatrixAt(index, dummy.matrix);
      // The brim projects forward from the crown.
      dummy.position.set(ped.x + (0.1 * sin) + (pose === 'vendor' ? 0.22 * scale * sin : 0), headY + 0.085 * scale, ped.z + (0.1 * cos) + (pose === 'vendor' ? 0.22 * scale * cos : 0));
      dummy.rotation.set(frame.torsoPitch * 0.5, yaw, 0);
      dummy.updateMatrix();
      this.capBrims.setMatrixAt(index, dummy.matrix);
      hide(this.bags);
      hide(this.towels);
    } else if (accessory === 'towel') {
      const side = -0.24 * scale;
      dummy.position.set(ped.x + side * cos, frame.baseY + 1.18 * scale, ped.z - side * sin);
      dummy.rotation.set(0.12, yaw, 0.16);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      this.towels.setMatrixAt(index, dummy.matrix);
      hide(this.bags);
      hide(this.caps);
      hide(this.capBrims);
    } else {
      hide(this.bags);
      hide(this.caps);
      hide(this.capBrims);
      hide(this.towels);
    }
  }
}
