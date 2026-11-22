// Traffic: cars on circuits around the lattice, plus their lamps and contact shadows. Each of
// the four silhouettes (coupe, sedan, van, taxi) is one instanced paint mesh and one instanced
// trim mesh, so forty-odd moving cars cost eight draw calls for the bodies and two for the
// wheels. Cars follow each other, yield to whatever stands in their lane, and brake for
// junctions; a stolen car leaves the flow briefly and rejoins far away.
import config from '../core/config.js';
import Rng from '../core/rng.js';
import { buildCar, buildWheel } from './carkit.js';
import { contactShadowTexture, glowTexture } from '../core/assets.js';

const THREE = globalThis.THREE;

const BODY_COLOURS = [
  0xb8443b, 0x2f6f7a, 0xd9a441, 0x4a5a70, 0xe6dcc8, 0x2f3138, 0x7d3a4c,
  0x8a9a86, 0x9c4f2a, 0x37536b, 0xc7cbd0, 0x1f3b30, 0x8c2f2f, 0x5b5f6b,
];

function makePath(points) {
  const lengths = [];
  let total = 0;
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

/** The street circuits: a few long loops around the grid so cars cover the whole city. */
function buildPaths(plan) {
  const paths = [];
  const centres = [];
  for (let i = 0; i < 8; i += 1) centres.push((i - 3.5) * config.pitch);
  const lane = config.traffic.lane;
  const half = 322;

  // Four long north-south circuits, two in each direction.
  for (const centre of centres) {
    for (const dir of [1, -1]) {
      const x = centre + dir * lane * 1.5;
      paths.push(makePath([
        [x, half], [x, -half], [-x - dir * lane * 3, -half], [-x - dir * lane * 3, half],
      ]));
    }
  }
  // Four long east-west circuits.
  for (const centre of centres) {
    for (const dir of [1, -1]) {
      const z = centre + dir * lane * 1.5;
      paths.push(makePath([
        [-half, z], [half, z], [half, -z - dir * lane * 3], [-half, -z - dir * lane * 3],
      ]));
    }
  }
  return paths;
}

export default class Traffic {
  constructor(plan) {
    this.plan = plan;
    this.rng = new Rng((plan.seed ^ 0x51c9a7d3) >>> 0);
    this.group = new THREE.Group();
    this.group.name = 'traffic';
    this.paths = buildPaths(plan);
    this.cars = [];
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
    this.night = false;
    this.buildCars();
  }

  buildCars() {
    const rng = this.rng;
    const kinds = ['coupe', 'sedan', 'van', 'taxi'];
    const kits = {};
    for (const kind of kinds) kits[kind] = buildCar(kind);
    this.kits = kits;

    const perKind = {};
    for (const kind of kinds) perKind[kind] = [];
    for (let i = 0; i < config.traffic.cars; i += 1) {
      const path = this.paths[i % this.paths.length];
      const kind = kinds[i % kinds.length];
      const car = {
        path,
        s: rng.float(0, path.total),
        speed: 0,
        cruise: config.traffic.speed * rng.float(0.82, 1.18),
        heading: 0,
        x: 0,
        z: 0,
        ground: 0,
        wheel: 0,
        stolen: false,
        respawn: 0,
        braking: false,
        color: BODY_COLOURS[i % BODY_COLOURS.length],
        kind,
        tall: kind === 'van',
        meshIndex: perKind[kind].length,
      };
      perKind[kind].push(car);
      this.cars.push(car);
    }

    // One instanced paint mesh and one instanced trim mesh per silhouette.
    this.paintMeshes = {};
    this.trimMeshes = {};
    for (const kind of kinds) {
      const list = perKind[kind];
      const kit = kits[kind];
      if (!list.length) continue;
      const paintMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 0.24, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05,
        envMapIntensity: 1.8,
      });
      const paintMesh = new THREE.InstancedMesh(kit.paint, paintMaterial, list.length);
      paintMesh.castShadow = true;
      paintMesh.receiveShadow = true;
      paintMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      list.forEach((car, index) => {
        const colour = new THREE.Color(car.color);
        paintMesh.setColorAt(index, colour);
      });
      if (paintMesh.instanceColor) paintMesh.instanceColor.needsUpdate = true;
      this.group.add(paintMesh);
      this.paintMeshes[kind] = paintMesh;

      const trimMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x2f3945, roughness: 0.06, metalness: 0.94, clearcoat: 1, envMapIntensity: 2.6,
      });
      const trimMesh = new THREE.InstancedMesh(kit.trim, trimMaterial, list.length);
      trimMesh.castShadow = true;
      trimMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(trimMesh);
      this.trimMeshes[kind] = trimMesh;

      // Wheels: four per car, one instanced mesh over every wheel on this silhouette.
      const wheelGeometry = buildWheel(kit.spec.wheelRadius, 0.24);
      const rubber = new THREE.MeshStandardMaterial({ color: 0x0e0f12, roughness: 0.96 });
      const wheels = new THREE.InstancedMesh(wheelGeometry, rubber, list.length * 4);
      wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(wheels);
      this[`wheels_${kind}`] = wheels;
    }

    // Lamps: emissive head and tail cards, one instanced mesh for each across all cars.
    const headGeometry = new THREE.BoxGeometry(0.34, 0.1, 0.05);
    const tailGeometry = new THREE.BoxGeometry(0.34, 0.09, 0.05);
    this.heads = new THREE.InstancedMesh(
      headGeometry,
      new THREE.MeshBasicMaterial({ color: 0xfff0cc, toneMapped: false }),
      this.cars.length * 2,
    );
    this.tails = new THREE.InstancedMesh(
      tailGeometry,
      new THREE.MeshBasicMaterial({ color: 0xff3a20, toneMapped: false }),
      this.cars.length * 2,
    );
    this.heads.frustumCulled = false;
    this.tails.frustumCulled = false;
    this.heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.heads);
    this.group.add(this.tails);

    // Contact shadows: one instanced sheet under every car, sized per silhouette.
    const shadowGeometry = new THREE.PlaneGeometry(1, 1);
    shadowGeometry.rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(
      shadowGeometry,
      new THREE.MeshBasicMaterial({
        map: contactShadowTexture(), transparent: true, opacity: 0.72, depthWrite: false, color: 0x000000,
      }),
      this.cars.length,
    );
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 2;
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.shadows);

    // Brake-light bloom: one small additive card behind each car, lit only where a car is off the
    // throttle. A still frame with no lit brake light on a slowing car reads as a parking lot, so
    // this is what makes the jam read as traffic.
    const glowGeometry = new THREE.PlaneGeometry(1, 1);
    this.tailGlow = new THREE.InstancedMesh(
      glowGeometry,
      new THREE.MeshBasicMaterial({
        map: glowTexture('rgba(255,64,32,0.85)', 'rgba(255,40,16,0)'),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      this.cars.length,
    );
    this.tailGlow.frustumCulled = false;
    this.tailGlow.renderOrder = 3;
    this.tailGlow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.tailGlow);

    // Exhaust haze: one soft additive puff per car slot, parked under the world unless the car is
    // the one idling in the frame. Scaled to the model, so it reads as a plume, not a cloud.
    this.exhaust = new THREE.InstancedMesh(
      glowGeometry,
      new THREE.MeshBasicMaterial({
        map: glowTexture('rgba(206,198,182,0.5)', 'rgba(180,170,152,0)'),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      this.cars.length * 3,
    );
    this.exhaust.frustumCulled = false;
    this.exhaust.renderOrder = 3;
    this.exhaust.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.exhaust);
  }

  setPeriod(period) {
    this.night = period === 'night';
    this.heads.material.color.setHex(this.night ? 0xfff6e2 : 0xfff0cc);
  }

  /**
   * Pin traffic to explicit poses for a shot. Each entry is {x, z, heading, kind?, colour?}.
   * Pinned cars leave the circuit simulation entirely, so the frame is exactly what was asked
   * for; `releasePins` puts them back on their paths.
   */
  placeLine(entries) {
    this.releasePins();
    let cursor = 0;
    for (const entry of entries) {
      // Find the next free car of the requested silhouette, else any free car.
      let car = null;
      for (let i = 0; i < this.cars.length; i += 1) {
        const candidate = this.cars[(cursor + i) % this.cars.length];
        if (candidate.pinned || candidate.stolen) continue;
        if (entry.kind && candidate.kind !== entry.kind) continue;
        car = candidate;
        cursor = (cursor + i + 1) % this.cars.length;
        break;
      }
      if (!car) break;
      car.pinned = true;
      car.x = entry.x;
      car.z = entry.z;
      car.heading = entry.heading ?? 0;
      car.ground = this.plan.heightAt(car.x, car.z);
      car.speed = entry.speed ?? 0;
      car.braking = Boolean(entry.braking);
      car.exhaust = Boolean(entry.exhaust);
      if (entry.colour !== undefined) {
        car.color = entry.colour;
        const mesh = this.paintMeshes[car.kind];
        if (mesh && car.meshIndex !== undefined) {
          this.color.setHex(entry.colour);
          mesh.setColorAt(car.meshIndex, this.color);
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
      }
    }
    this.update(0, {});
  }

  releasePins() {
    for (const car of this.cars) {
      if (!car.pinned) continue;
      car.pinned = false;
      car.s = this.nearestS(car, car.x, car.z);
    }
    for (const car of this.cars) car.hidden = false;
  }

  /**
   * For a still frame: park every car that was not explicitly placed far below the world, so
   * nothing drives through the staged line between the staging and the render.
   */
  hideUnpinned() {
    for (const car of this.cars) car.hidden = !car.pinned;
  }

  nearestS(car, x, z) {
    let best = 0;
    let bestDistance = Infinity;
    const step = 6;
    for (let s = 0; s < car.path.total; s += step) {
      const point = sample(car.path, s);
      const distance = Math.hypot(point.x - x, point.z - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = s;
      }
    }
    return best;
  }

  /** Place selected cars on a chosen stretch of road, stopped, for the cover shot. */
  stageCover() {
    const placements = [
      [0, 22, 325.85], [8, 34, 325.85], [16, 44, 325.85],
      [1, 30, 332.15], [9, 42, 332.15], [6, 44, 312], [2, 33, 318], [10, 40, 318],
    ];
    for (const [index, x, z] of placements) {
      const car = this.cars[index];
      if (!car) continue;
      car.s = this.nearestS(car, x, z);
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
    const hide = (index) => {
      this.dummy.position.set(0, -40, 0);
      this.dummy.scale.set(0.001, 0.001, 0.001);
      this.dummy.updateMatrix();
      this.shadows.setMatrixAt(index, this.dummy.matrix);
      this.heads.setMatrixAt(index * 2, this.dummy.matrix);
      this.heads.setMatrixAt(index * 2 + 1, this.dummy.matrix);
      this.tails.setMatrixAt(index * 2, this.dummy.matrix);
      this.tails.setMatrixAt(index * 2 + 1, this.dummy.matrix);
    };

    for (let i = 0; i < cars.length; i += 1) {
      const car = cars[i];
      if (car.pinned) continue;
      if (car.stolen) {
        car.respawn -= dt;
        if (car.respawn <= 0) {
          car.stolen = false;
          car.s = (car.s + car.path.total * 0.5) % car.path.total;
        }
        hide(i);
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
    }

    // Push poses into the instanced buffers.
    const subgroups = { coupe: [], sedan: [], van: [], taxi: [] };
    for (const car of cars) subgroups[car.kind].push(car);
    for (const kind of Object.keys(subgroups)) {
      const list = subgroups[kind];
      const paintMesh = this.paintMeshes[kind];
      const trimMesh = this.trimMeshes[kind];
      const wheels = this[`wheels_${kind}`];
      if (!paintMesh) continue;
      for (let n = 0; n < list.length; n += 1) {
        const car = list[n];
        if (car.stolen || car.hidden) {
          this.dummy.position.set(0, -40, 0);
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.set(0.001, 0.001, 0.001);
          this.dummy.updateMatrix();
          paintMesh.setMatrixAt(n, this.dummy.matrix);
          trimMesh.setMatrixAt(n, this.dummy.matrix);
          for (let w = 0; w < 4; w += 1) wheels.setMatrixAt(n * 4 + w, this.dummy.matrix);
          continue;
        }
        const dummy = this.dummy;
        dummy.position.set(car.x, car.ground, car.z);
        dummy.rotation.set(0, car.heading, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        paintMesh.setMatrixAt(n, dummy.matrix);
        trimMesh.setMatrixAt(n, dummy.matrix);

        const kit = this.kits[kind];
        for (let w = 0; w < 4; w += 1) {
          const station = kit.wheels[w < 2 ? 0 : 1];
          const side = w % 2 === 0 ? -1 : 1;
          // The car sits at ground level; the wheel's own local offset carries the hub height.
          // Adding wheelRadius here as well would lift the wheels clear of the arches.
          dummy.position.set(car.x, car.ground, car.z);
          dummy.rotation.set(0, car.heading, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          const offset = new THREE.Matrix4().makeTranslation(
            side * station.x,
            kit.spec.wheelRadius,
            station.z,
          );
          const spin = new THREE.Matrix4().makeRotationX(-car.wheel);
          const local = new THREE.Matrix4().multiplyMatrices(offset, spin);
          const world = new THREE.Matrix4().multiplyMatrices(dummy.matrix, local);
          wheels.setMatrixAt(n * 4 + w, world);
        }
      }
      paintMesh.instanceMatrix.needsUpdate = true;
      trimMesh.instanceMatrix.needsUpdate = true;
      wheels.instanceMatrix.needsUpdate = true;
    }

    // Lamps and shadows for every car, in the flat arrays.
    const dummy = this.dummy;
    for (let i = 0; i < cars.length; i += 1) {
      const car = cars[i];
      if (car.stolen || car.hidden) {
        this.dummy.position.set(0, -40, 0);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(0.001, 0.001, 0.001);
        this.dummy.updateMatrix();
        this.shadows.setMatrixAt(i, this.dummy.matrix);
        this.heads.setMatrixAt(i * 2, this.dummy.matrix);
        this.heads.setMatrixAt(i * 2 + 1, this.dummy.matrix);
        this.tails.setMatrixAt(i * 2, this.dummy.matrix);
        this.tails.setMatrixAt(i * 2 + 1, this.dummy.matrix);
        this.tailGlow.setMatrixAt(i, this.dummy.matrix);
        for (let puff = 0; puff < 3; puff += 1) this.exhaust.setMatrixAt(i * 3 + puff, this.dummy.matrix);
        continue;
      }
      const kit = this.kits[car.kind];
      const cos = Math.cos(car.heading);
      const sin = Math.sin(car.heading);
      const placeLamp = (mesh, slot, lx, lz, y) => {
        const rx = lx * cos + lz * sin;
        const rz = -lx * sin + lz * cos;
        dummy.position.set(car.x + rx, car.ground + y, car.z + rz);
        dummy.rotation.set(0, car.heading, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(slot, dummy.matrix);
      };
      const lampY = kit.spec.lampY + 0.08;
      placeLamp(this.heads, i * 2, -0.62, kit.spec.nose - 0.02, lampY);
      placeLamp(this.heads, i * 2 + 1, 0.62, kit.spec.nose - 0.02, lampY);
      placeLamp(this.tails, i * 2, -0.6, kit.spec.tail + 0.02, lampY + 0.06);
      placeLamp(this.tails, i * 2 + 1, 0.6, kit.spec.tail + 0.02, lampY + 0.06);

      // Shadow: body-length blob on the road, with the tyre contact darker than the skirt.
      const length = Math.abs(kit.spec.nose - kit.spec.tail) + 1.1;
      dummy.position.set(car.x, car.ground + 0.042, car.z);
      dummy.rotation.set(0, car.heading, 0);
      dummy.scale.set(2.6, 1, length);
      dummy.updateMatrix();
      this.shadows.setMatrixAt(i, dummy.matrix);

      // Brake-light bloom: a small additive card hung just behind the tail lamps, present only on
      // a car that is slowing. Off-throttle cars in a jam light up; cruising ones do not.
      if (car.braking && !car.hidden) {
        const back = kit.spec.tail - 0.24;
        dummy.position.set(car.x + back * sin, car.ground + lampY + 0.06, car.z + back * cos);
        dummy.rotation.set(0, car.heading, 0);
        dummy.scale.set(1.5, 0.6, 1);
        dummy.updateMatrix();
      } else {
        dummy.position.set(0, -60, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.001, 0.001, 0.001);
        dummy.updateMatrix();
      }
      this.tailGlow.setMatrixAt(i, dummy.matrix);

      // Exhaust haze: three puffs stepped back from the tailpipe and drifting up, only on the car
      // the rig marked as idling. Each puff is a little larger and fainter than the last.
      for (let puff = 0; puff < 3; puff += 1) {
        if (car.exhaust && !car.hidden) {
          const back = kit.spec.tail - 0.35 - puff * 0.42;
          dummy.position.set(
            car.x + back * sin,
            car.ground + 0.34 + puff * 0.2,
            car.z + back * cos,
          );
          dummy.rotation.set(-Math.PI / 2, car.heading, 0);
          const size = 0.9 + puff * 0.55;
          dummy.scale.set(size, size, 1);
        } else {
          dummy.position.set(0, -60, 0);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(0.001, 0.001, 0.001);
        }
        dummy.updateMatrix();
        this.exhaust.setMatrixAt(i * 3 + puff, dummy.matrix);
      }

      const brakeGlow = car.braking ? 1 : 0.5;
      const r = this.night ? 0.9 : 0.5 * brakeGlow;
      this.color.setRGB(r + 0.12, 0.05 * brakeGlow, 0.04 * brakeGlow);
      this.tails.setColorAt(i * 2, this.color);
      this.tails.setColorAt(i * 2 + 1, this.color);
    }

    this.heads.instanceMatrix.needsUpdate = true;
    this.tails.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.tailGlow.instanceMatrix.needsUpdate = true;
    this.exhaust.instanceMatrix.needsUpdate = true;
    if (this.tails.instanceColor) this.tails.instanceColor.needsUpdate = true;
  }
}
