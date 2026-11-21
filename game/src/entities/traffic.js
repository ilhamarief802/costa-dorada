// Traffic: 36 cars on eight lane circuits. Each circuit follows the road grid in one direction
// on the correct side of the centre line, so cars meet head-on in opposite lanes and turn at
// the junctions as the circuit rounds a corner. Every car is four instanced meshes plus two
// light strips and a soft blob shadow: 8 draw calls for the whole flow.
import config from '../core/config.js';
import Rng from '../core/rng.js';
import { contactShadowTexture } from '../core/assets.js';

const THREE = globalThis.THREE;

const CAR_COLORS = [0xb8443b, 0x2f6f7a, 0xd9a441, 0x4a5a70, 0xe6dcc8, 0x2f3138, 0x7d3a4c, 0x8a9a86, 0x9b5a37, 0x3f5e75];

function buildPath(points) {
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

function sample(path, distance) {
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

/** Rounded rectangle path. Clockwise paths sit lane metres inside the kerb line; reverse paths
 *  sit lane metres outside it, which puts both directions on their own right-hand side. */
function circuit(x1, z1, x2, z2, clockwise, lane) {
  const shrink = clockwise ? lane : -lane;
  const minX = x1 + shrink;
  const maxX = x2 - shrink;
  const minZ = z1 + shrink;
  const maxZ = z2 - shrink;
  const c = 5.5;
  const points = [
    [minX + c, minZ], [maxX - c, minZ], [maxX, minZ + c],
    [maxX, maxZ - c], [maxX - c, maxZ], [minX + c, maxZ],
    [minX, maxZ - c], [minX, minZ + c],
  ];
  if (!clockwise) points.reverse();
  return buildPath(points);
}

function nearestS(car, x, z) {
  const path = car.path;
  let best = 0;
  let bestDist = Infinity;
  const step = Math.max(1.5, path.total / 900);
  for (let s = 0; s < path.total; s += step) {
    const point = sample(path, s);
    const d = (point.x - x) * (point.x - x) + (point.z - z) * (point.z - z);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

export default class Traffic {
  constructor(plan) {
    this.plan = plan;
    this.group = new THREE.Group();
    this.group.name = 'traffic';
    this.rng = new Rng((plan.seed ^ 0x51ed270b) >>> 0);
    const xs = plan.roads.x;
    const zs = plan.roads.z;
    const lane = config.traffic.lane;
    // Eight loops: long avenues as well as tight downtown blocks. Alternating direction means
    // each corridor carries traffic both ways.
    this.paths = [
      circuit(xs[3], zs[3], xs[5], zs[7], true, lane),
      circuit(xs[1], zs[0], xs[4], zs[7], false, lane),
      circuit(xs[2], zs[1], xs[6], zs[5], true, lane),
      circuit(xs[0], zs[2], xs[3], zs[6], false, lane),
      circuit(xs[3], zs[0], xs[7], zs[3], true, lane),
      circuit(xs[0], zs[0], xs[2], zs[4], false, lane),
      circuit(xs[4], zs[2], xs[7], zs[7], false, lane),
      circuit(xs[2], zs[4], xs[6], zs[7], true, lane),
    ];
    this.cars = [];
    this.buildCars();
    this.buildMeshes();
    this.setPeriod('golden');
  }

  buildCars() {
    const rng = this.rng;
    const count = config.traffic.cars;
    for (let i = 0; i < count; i += 1) {
      const path = this.paths[i % this.paths.length];
      const perPath = Math.ceil(count / this.paths.length);
      const slot = Math.floor(i / this.paths.length);
      this.cars.push({
        path,
        s: (slot / perPath) * path.total + rng.float(0, 16),
        cruise: config.traffic.speed + rng.float(-1.4, 2.6),
        speed: config.traffic.speed * 0.6,
        heading: 0,
        x: 0,
        z: 0,
        ground: 0,
        color: CAR_COLORS[i % CAR_COLORS.length],
        tall: i % 7 === 0,
        wheel: rng.float(0, 6.28),
        braking: false,
        stolen: false,
        respawn: 0,
        index: i,
      });
    }
  }

  buildMeshes() {
    const total = this.cars.length;
    const bodyGeometry = new THREE.BoxGeometry(1.84, 0.56, 4.3);
    bodyGeometry.translate(0, 0.58, 0);
    const cabinGeometry = new THREE.BoxGeometry(1.58, 0.5, 2.0);
    cabinGeometry.translate(0, 1.06, -0.15);
    const wheelGeometry = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 8);
    wheelGeometry.rotateZ(Math.PI / 2);
    const lampGeometry = new THREE.BoxGeometry(0.34, 0.15, 0.07);
    const bodyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.34, metalness: 0.45 });
    const cabinMaterial = new THREE.MeshStandardMaterial({ color: 0x182026, roughness: 0.12, metalness: 0.7 });
    const tyreMaterial = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
    this.headMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.tailMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, total);
    this.cabins = new THREE.InstancedMesh(cabinGeometry, cabinMaterial, total);
    this.wheels = new THREE.InstancedMesh(wheelGeometry, tyreMaterial, total * 4);
    this.heads = new THREE.InstancedMesh(lampGeometry, this.headMaterial, total * 2);
    this.tails = new THREE.InstancedMesh(lampGeometry, this.tailMaterial, total * 2);

    const shadowGeometry = new THREE.PlaneGeometry(2.9, 5.1);
    shadowGeometry.rotateX(-Math.PI / 2);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: contactShadowTexture(),
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
    });
    this.shadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, total);

    const color = new THREE.Color();
    this.cars.forEach((car, index) => {
      color.setHex(car.color);
      this.bodies.setColorAt(index, color);
    });
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    for (const mesh of [this.bodies, this.cabins, this.wheels, this.heads, this.tails]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.shadows.receiveShadow = false;
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 1;
    this.group.add(this.shadows);
    this.dummy = new THREE.Object3D();
    this.lightDummy = new THREE.Object3D();
    this.color = new THREE.Color();
  }

  setPeriod(period) {
    this.night = period === 'night';
    const head = this.night ? 0xffe4b0 : 0x6d6250;
    const tail = this.night ? 0x9e2118 : 0x5a1916;
    for (let i = 0; i < this.cars.length; i += 1) {
      this.heads.setColorAt(i * 2, this.color.setHex(head));
      this.heads.setColorAt(i * 2 + 1, this.color.setHex(head));
      this.tails.setColorAt(i * 2, this.color.setHex(tail));
      this.tails.setColorAt(i * 2 + 1, this.color.setHex(tail));
    }
    if (this.heads.instanceColor) this.heads.instanceColor.needsUpdate = true;
    if (this.tails.instanceColor) this.tails.instanceColor.needsUpdate = true;
  }

  /** Place a few cars on the south avenue for the cover frame (and the title backdrop). */
  stageCover() {
    const placements = [
      [0, 22, 325.85], [8, 34, 325.85], [16, 44, 325.85],
      [1, 30, 332.15], [9, 42, 332.15], [6, 44, 312],
    ];
    for (const [index, x, z] of placements) {
      const car = this.cars[index];
      if (!car) continue;
      car.s = nearestS(car, x, z);
      car.speed = 0;
    }
    this.update(0, {});
  }

  nearestStealable(x, z, maxDistance = 4.4) {
    let best = null;
    let bestDistance = maxDistance;
    for (const car of this.cars) {
      if (car.stolen) continue;
      const distance = Math.hypot(car.x - x, car.z - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = car;
      }
    }
    return best;
  }

  /** The player takes this car: it vanishes from the flow and rejoins it far away shortly. */
  steal(car) {
    car.stolen = true;
    car.respawn = 7;
    return { x: car.x, z: car.z, yaw: car.heading };
  }

  update(dt, ctx = {}) {
    const cars = this.cars;
    const playerPos = ctx.playerPos;
    const stopRange = config.traffic.stopRange;
    for (let i = 0; i < cars.length; i += 1) {
      const car = cars[i];
      if (car.stolen) {
        car.respawn -= dt;
        if (car.respawn <= 0) {
          car.stolen = false;
          car.s = (car.s + car.path.total * 0.5) % car.path.total;
        }
        this.dummy.position.set(0, -40, 0);
        this.dummy.scale.set(0.001, 0.001, 0.001);
        this.dummy.updateMatrix();
        this.bodies.setMatrixAt(i, this.dummy.matrix);
        this.cabins.setMatrixAt(i, this.dummy.matrix);
        this.shadows.setMatrixAt(i, this.dummy.matrix);
        for (let w = 0; w < 4; w += 1) this.wheels.setMatrixAt(i * 4 + w, this.dummy.matrix);
        this.heads.setMatrixAt(i * 2, this.dummy.matrix);
        this.heads.setMatrixAt(i * 2 + 1, this.dummy.matrix);
        this.tails.setMatrixAt(i * 2, this.dummy.matrix);
        this.tails.setMatrixAt(i * 2 + 1, this.dummy.matrix);
        continue;
      }

      // Leader on the same circuit: follow its speed, keeping a two-car gap.
      let leaderGap = Infinity;
      let leaderSpeed = car.cruise;
      for (let j = 0; j < cars.length; j += 1) {
        if (i === j) continue;
        const other = cars[j];
        if (other.path !== car.path || other.stolen) continue;
        const gap = (other.s - car.s + car.path.total) % car.path.total;
        if (gap > 0.1 && gap < leaderGap) {
          leaderGap = gap;
          leaderSpeed = other.speed;
        }
      }
      let target = car.cruise;
      if (leaderGap < 24) {
        const gap = config.traffic.gap + Math.abs(car.speed) * 0.42;
        target = Math.min(target, leaderSpeed + (leaderGap - gap) * 1.35);
      }

      // Yield to a person or the player's car standing in the lane ahead.
      if (playerPos) {
        const aheadX = Math.sin(car.heading);
        const aheadZ = Math.cos(car.heading);
        const dx = playerPos.x - car.x;
        const dz = playerPos.z - car.z;
        const forward = dx * aheadX + dz * aheadZ;
        const lateral = Math.abs(dx * aheadZ - dz * aheadX);
        if (forward > 0 && forward < stopRange + 3 && lateral < 3.4) {
          target = Math.min(target, Math.max(0, (forward - 4.2) * 1.6));
        }
      }

      target = Math.max(target, 0);
      const accel = target < car.speed ? 9.5 : 4.2;
      car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), accel * dt);
      if (car.speed < 0.05) car.speed = 0;
      car.braking = target < car.cruise - 0.6 || car.speed < 0.35;
      car.s = (car.s + car.speed * dt) % car.path.total;

      const point = sample(car.path, car.s);
      car.x = point.x;
      car.z = point.z;
      car.heading = point.heading;
      car.ground = this.plan.heightAt(car.x, car.z);
      car.wheel += (car.speed / 0.32) * dt;

      const dummy = this.dummy;
      dummy.position.set(car.x, car.ground, car.z);
      dummy.rotation.set(0, car.heading, 0);
      dummy.scale.set(1, car.tall ? 1.12 : 1, 1);
      dummy.updateMatrix();
      this.bodies.setMatrixAt(i, dummy.matrix);
      this.cabins.setMatrixAt(i, dummy.matrix);
      this.shadows.setMatrixAt(i, dummy.matrix);

      for (let w = 0; w < 4; w += 1) {
        const lx = w % 2 === 0 ? -0.84 : 0.84;
        const lz = w < 2 ? 1.4 : -1.4;
        const rx = lx * Math.cos(car.heading) + lz * Math.sin(car.heading);
        const rz = -lx * Math.sin(car.heading) + lz * Math.cos(car.heading);
        dummy.position.set(car.x + rx, car.ground + 0.32 * (car.tall ? 1.12 : 1), car.z + rz);
        dummy.rotation.set(car.wheel, car.heading, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        this.wheels.setMatrixAt(i * 4 + w, dummy.matrix);
      }

      const placeLamp = (mesh, slot, lx, lz, y) => {
        const rx = lx * Math.cos(car.heading) + lz * Math.sin(car.heading);
        const rz = -lx * Math.sin(car.heading) + lz * Math.cos(car.heading);
        dummy.position.set(car.x + rx, car.ground + y + (car.tall ? 0.07 : 0), car.z + rz);
        dummy.rotation.set(0, car.heading, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(slot, dummy.matrix);
      };
      placeLamp(this.heads, i * 2, -0.63, 2.16, 0.62);
      placeLamp(this.heads, i * 2 + 1, 0.63, 2.16, 0.62);
      placeLamp(this.tails, i * 2, -0.66, -2.16, 0.66);
      placeLamp(this.tails, i * 2 + 1, 0.66, -2.16, 0.66);

      const brakeGlow = car.braking ? 1 : 0.34;
      const r = this.night ? 0.85 : 0.42;
      this.color.setRGB(r * brakeGlow + 0.1, 0.06 * brakeGlow, 0.045 * brakeGlow);
      this.tails.setColorAt(i * 2, this.color);
      this.tails.setColorAt(i * 2 + 1, this.color);
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.cabins.instanceMatrix.needsUpdate = true;
    this.wheels.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    this.tails.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
    if (this.tails.instanceColor) this.tails.instanceColor.needsUpdate = true;
  }
}
