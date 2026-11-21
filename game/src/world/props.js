// Street furniture: lamp standards, benches, bins, hydrants, parked cars and shore rocks.
// All repeats are instanced; the only per-frame work is the lamp glow fade at dusk.
import config from '../core/config.js';
import { glowTexture, contactShadowTexture } from '../core/assets.js';

const THREE = globalThis.THREE;

function unitBox() {
  return new THREE.BoxGeometry(1, 1, 1);
}

export default class Props {
  constructor(plan) {
    this.plan = plan;
    this.group = new THREE.Group();
    this.group.name = 'props';
    this.buildLamps();
    this.buildBenches();
    this.buildSmallFurniture();
    this.buildParkedCars();
    this.buildRocks();
    this.buildTrafficLights();
    this.buildPlanters();
    this.buildCafes();
    this.buildManholes();
    this.buildBlobShadows();
  }

  /** One instanced soft shadow sheet under every standing prop, so nothing floats. */
  buildBlobShadows() {
    const entries = [];
    const add = (x, z, sx, sz, yaw = 0, opacity = 0.34) => {
      entries.push({ x, z, sx, sz, yaw, opacity });
    };
    for (const car of this.plan.parked) add(car.x, car.z, 3.5, 5.3, car.yaw, 0.5);
    for (const bench of this.plan.benches) add(bench.x, bench.z, 2.5, 1.15, bench.yaw, 0.32);
    for (const lamp of this.plan.lamps) add(lamp.x, lamp.z, 0.95, 0.95, 0, 0.28);
    for (const bin of this.plan.bins) add(bin.x, bin.z, 0.95, 0.95, 0, 0.32);
    for (const hydrant of this.plan.hydrants) add(hydrant.x, hydrant.z, 0.75, 0.75, 0, 0.3);
    for (const rock of this.plan.rocks) add(rock.x, rock.z, 2.4 * rock.scale, 2.4 * rock.scale, rock.yaw, 0.3);
    for (const palm of this.plan.palms) add(palm.x, palm.z, 2.8 * palm.scale, 2.8 * palm.scale, palm.yaw, 0.26);
    if (!entries.length) return;
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, opacity: 0.4, depthWrite: false });
    const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    entries.forEach((entry, index) => {
      dummy.position.set(entry.x, this.plan.heightAt(entry.x, entry.z) + 0.028, entry.z);
      dummy.rotation.set(0, entry.yaw, 0);
      dummy.scale.set(entry.sx, 1, entry.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      color.setScalar(0.25 + entry.opacity);
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this.blobShadows = mesh;
  }

  buildLamps() {
    const lamps = this.plan.lamps;
    const poleGeometry = new THREE.CylinderGeometry(0.075, 0.13, 5.6, 6);
    poleGeometry.translate(0, 2.8, 0);
    const armGeometry = new THREE.BoxGeometry(1.7, 0.09, 0.09);
    armGeometry.translate(0.85, 0, 0);
    const headGeometry = new THREE.BoxGeometry(0.52, 0.16, 0.34);
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x26292a, roughness: 0.62, metalness: 0.45 });
    const armMaterial = new THREE.MeshStandardMaterial({ color: 0x2d3031, roughness: 0.6, metalness: 0.4 });
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0x3a342a, roughness: 0.4, emissive: 0xffc477, emissiveIntensity: 0.06 });
    const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, lamps.length);
    const arms = new THREE.InstancedMesh(armGeometry, armMaterial, lamps.length);
    const heads = new THREE.InstancedMesh(headGeometry, headMaterial, lamps.length);
    const dummy = new THREE.Object3D();
    const pools = [];
    lamps.forEach((lamp, index) => {
      const y = this.plan.heightAt(lamp.x, lamp.z);
      dummy.position.set(lamp.x, y, lamp.z);
      dummy.rotation.set(0, lamp.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poles.setMatrixAt(index, dummy.matrix);
      dummy.position.set(lamp.x, y + 5.55, lamp.z);
      dummy.updateMatrix();
      arms.setMatrixAt(index, dummy.matrix);
      dummy.position.set(lamp.x, y + 5.48, lamp.z);
      dummy.updateMatrix();
      heads.setMatrixAt(index, dummy.matrix);
      if (lamp.pool) {
        const dx = Math.cos(lamp.yaw) * 1.6;
        const dz = -Math.sin(lamp.yaw) * 1.6;
        pools.push({ x: lamp.x + dx, z: lamp.z + dz, y: this.plan.heightAt(lamp.x + dx, lamp.z + dz) + 0.035 });
      }
    });
    for (const mesh of [poles, arms, heads]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
    }
    poles.receiveShadow = true;
    this.group.add(poles);
    this.group.add(arms);
    this.group.add(heads);
    this.lampHeads = headMaterial;

    if (pools.length) {
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({
        map: glowTexture('rgba(255,196,120,0.9)', 'rgba(255,160,70,0)'),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, pools.length);
      const poolDummy = new THREE.Object3D();
      pools.forEach((pool, index) => {
        poolDummy.position.set(pool.x, pool.y, pool.z);
        poolDummy.scale.set(13, 1, 13);
        poolDummy.updateMatrix();
        mesh.setMatrixAt(index, poolDummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
      this.pools = material;
    }
  }

  buildBenches() {
    const benches = this.plan.benches;
    if (!benches.length) return;
    const seat = new THREE.BoxGeometry(2.2, 0.1, 0.62);
    const back = new THREE.BoxGeometry(2.2, 0.52, 0.08);
    const legs = new THREE.BoxGeometry(1.7, 0.44, 0.12);
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5b39, roughness: 0.9 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x2f3335, roughness: 0.7, metalness: 0.3 });
    const seats = new THREE.InstancedMesh(seat, wood, benches.length);
    const backs = new THREE.InstancedMesh(back, wood, benches.length);
    const feet = new THREE.InstancedMesh(legs, iron, benches.length);
    const dummy = new THREE.Object3D();
    benches.forEach((bench, index) => {
      const y = bench.y ?? config.slabHeight;
      dummy.position.set(bench.x, y + 0.48, bench.z);
      dummy.rotation.set(0, bench.yaw, 0);
      dummy.updateMatrix();
      seats.setMatrixAt(index, dummy.matrix);
      const backOffset = new THREE.Vector3(0, 0.32, -0.28).applyEuler(new THREE.Euler(0, bench.yaw, 0));
      dummy.position.set(bench.x + backOffset.x, y + 0.48 + backOffset.y, bench.z + backOffset.z);
      dummy.updateMatrix();
      backs.setMatrixAt(index, dummy.matrix);
      dummy.position.set(bench.x, y + 0.22, bench.z);
      dummy.updateMatrix();
      feet.setMatrixAt(index, dummy.matrix);
    });
    for (const mesh of [seats, backs, feet]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  buildSmallFurniture() {
    const bins = this.plan.bins;
    if (bins.length) {
      const geometry = new THREE.CylinderGeometry(0.27, 0.24, 0.92, 8);
      geometry.translate(0, 0.46, 0);
      const material = new THREE.MeshStandardMaterial({ color: 0x37503f, roughness: 0.8, metalness: 0.2 });
      const mesh = new THREE.InstancedMesh(geometry, material, bins.length);
      const dummy = new THREE.Object3D();
      bins.forEach((bin, index) => {
        dummy.position.set(bin.x, bin.y ?? config.slabHeight, bin.z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      this.group.add(mesh);
    }
    const hydrants = this.plan.hydrants;
    if (hydrants.length) {
      const geometry = new THREE.CylinderGeometry(0.16, 0.19, 0.62, 8);
      geometry.translate(0, 0.31, 0);
      const material = new THREE.MeshStandardMaterial({ color: 0xa63c2c, roughness: 0.62, metalness: 0.25 });
      const mesh = new THREE.InstancedMesh(geometry, material, hydrants.length);
      const capGeometry = new THREE.SphereGeometry(0.17, 8, 6);
      const cap = new THREE.InstancedMesh(capGeometry, material, hydrants.length);
      const baseGeometry = new THREE.CylinderGeometry(0.25, 0.28, 0.09, 10);
      baseGeometry.translate(0, 0.045, 0);
      const base = new THREE.InstancedMesh(baseGeometry, material, hydrants.length);
      const nozzleGeometry = new THREE.CylinderGeometry(0.075, 0.075, 0.24, 6);
      nozzleGeometry.rotateZ(Math.PI / 2);
      const nozzles = new THREE.InstancedMesh(nozzleGeometry, material, hydrants.length * 2);
      const dummy = new THREE.Object3D();
      hydrants.forEach((hydrant, index) => {
        dummy.position.set(hydrant.x, hydrant.y ?? config.slabHeight, hydrant.z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        base.setMatrixAt(index, dummy.matrix);
        dummy.position.y += 0.64;
        dummy.updateMatrix();
        cap.setMatrixAt(index, dummy.matrix);
        for (let side = 0; side < 2; side += 1) {
          dummy.position.set(hydrant.x + (side === 0 ? -0.18 : 0.18), (hydrant.y ?? config.slabHeight) + 0.42, hydrant.z);
          dummy.updateMatrix();
          nozzles.setMatrixAt(index * 2 + side, dummy.matrix);
        }
      });
      for (const item of [mesh, cap, base, nozzles]) {
        item.instanceMatrix.needsUpdate = true;
        item.castShadow = true;
        this.group.add(item);
      }
    }
  }

  buildParkedCars() {
    const cars = this.plan.parked;
    if (!cars.length) return;
    const bodyGeometry = new THREE.BoxGeometry(1.86, 0.58, 4.32);
    bodyGeometry.translate(0, 0.57, 0);
    const cabinGeometry = new THREE.BoxGeometry(1.62, 0.5, 2.05);
    cabinGeometry.translate(0, 1.08, -0.18);
    const wheelGeometry = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 10);
    wheelGeometry.rotateZ(Math.PI / 2);
    const bodyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.36, metalness: 0.45 });
    const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x171f26, roughness: 0.12, metalness: 0.7 });
    const tyreMaterial = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 });
    const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, cars.length);
    const cabins = new THREE.InstancedMesh(cabinGeometry, glassMaterial, cars.length);
    const wheels = new THREE.InstancedMesh(wheelGeometry, tyreMaterial, cars.length * 4);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const wheelOffsets = [
      [-0.86, 0.33, 1.42],
      [0.86, 0.33, 1.42],
      [-0.86, 0.33, -1.42],
      [0.86, 0.33, -1.42],
    ];
    cars.forEach((car, index) => {
      const y = this.plan.heightAt(car.x, car.z);
      dummy.position.set(car.x, y, car.z);
      dummy.rotation.set(0, car.yaw, 0);
      dummy.scale.set(1, car.tall ? 1.14 : 1, 1);
      dummy.updateMatrix();
      bodies.setMatrixAt(index, dummy.matrix);
      cabins.setMatrixAt(index, dummy.matrix);
      color.setHex(car.color);
      bodies.setColorAt(index, color);
      for (let w = 0; w < 4; w += 1) {
        const offset = wheelOffsets[w];
        const wx = offset[0] * Math.cos(car.yaw) + offset[2] * Math.sin(car.yaw);
        const wz = -offset[0] * Math.sin(car.yaw) + offset[2] * Math.cos(car.yaw);
        dummy.position.set(car.x + wx, y + offset[1] * (car.tall ? 1.14 : 1), car.z + wz);
        dummy.rotation.set(0, car.yaw, 0);
        dummy.scale.set(1, car.tall ? 1.14 : 1, 1);
        dummy.updateMatrix();
        wheels.setMatrixAt(index * 4 + w, dummy.matrix);
      }
    });
    bodies.instanceMatrix.needsUpdate = true;
    cabins.instanceMatrix.needsUpdate = true;
    wheels.instanceMatrix.needsUpdate = true;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    bodies.castShadow = true;
    cabins.castShadow = true;
    wheels.castShadow = true;
    bodies.receiveShadow = true;
    this.group.add(bodies);
    this.group.add(cabins);
    this.group.add(wheels);
  }

  buildRocks() {
    const rocks = this.plan.rocks;
    const geometry = new THREE.DodecahedronGeometry(1, 0);
    const material = new THREE.MeshStandardMaterial({ color: 0x7d6d58, roughness: 1 });
    const mesh = new THREE.InstancedMesh(geometry, material, rocks.length);
    const dummy = new THREE.Object3D();
    rocks.forEach((rock, index) => {
      dummy.position.set(rock.x, this.plan.heightAt(rock.x, rock.z) + 0.2, rock.z);
      dummy.rotation.set(0.4, rock.yaw, 0.2);
      dummy.scale.set(rock.scale, rock.scale * 0.62, rock.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  buildTrafficLights() {
    const signals = [
      { x: 36.6, z: 244, yaw: 0, facing: 0, state: 'red' },
      { x: 57.4, z: 244, yaw: Math.PI, facing: 0, state: 'red' },
      { x: 36.6, z: 226, yaw: 0, facing: Math.PI, state: 'green' },
      { x: 57.4, z: 226, yaw: Math.PI, facing: Math.PI, state: 'green' },
    ];
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x30363a, roughness: 0.55, metalness: 0.5 });
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0x191d21, roughness: 0.6, metalness: 0.3 });
    const poleGeometry = new THREE.CylinderGeometry(0.09, 0.12, 5.3, 6);
    poleGeometry.translate(0, 2.65, 0);
    const armGeometry = new THREE.BoxGeometry(3.3, 0.1, 0.1);
    armGeometry.translate(1.65, 0, 0);
    const headGeometry = new THREE.BoxGeometry(0.4, 1.08, 0.34);
    const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, signals.length);
    const arms = new THREE.InstancedMesh(armGeometry, poleMaterial, signals.length);
    const heads = new THREE.InstancedMesh(headGeometry, headMaterial, signals.length);
    const reds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.05), new THREE.MeshStandardMaterial({ color: 0x8c1c16, emissive: 0xff3424, emissiveIntensity: 0.5, roughness: 0.3 }), 2);
    const greens = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.05), new THREE.MeshStandardMaterial({ color: 0x1c5c36, emissive: 0x48e08c, emissiveIntensity: 0.45, roughness: 0.3 }), 2);
    const dummy = new THREE.Object3D();
    let redIndex = 0;
    let greenIndex = 0;
    signals.forEach((signal, index) => {
      const y = this.plan.heightAt(signal.x, signal.z);
      dummy.position.set(signal.x, y, signal.z);
      dummy.rotation.set(0, signal.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poles.setMatrixAt(index, dummy.matrix);
      dummy.position.set(signal.x + Math.cos(signal.yaw) * 1.65, y + 5.15, signal.z - Math.sin(signal.yaw) * 1.65);
      dummy.updateMatrix();
      arms.setMatrixAt(index, dummy.matrix);
      dummy.position.set(signal.x + Math.cos(signal.yaw) * 1.65, y + 4.7, signal.z - Math.sin(signal.yaw) * 1.65);
      dummy.updateMatrix();
      heads.setMatrixAt(index, dummy.matrix);
      this.trafficLampMaterials = { red: reds.material, green: greens.material };
      const lensX = signal.x + Math.cos(signal.yaw) * 1.65;
      const lensZ = signal.z - Math.sin(signal.yaw) * 1.65;
      if (signal.state === 'red') {
        dummy.position.set(lensX, y + 4.98, lensZ + (signal.facing === 0 ? 0.19 : -0.19));
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        reds.setMatrixAt(redIndex, dummy.matrix);
        redIndex += 1;
      } else {
        dummy.position.set(lensX, y + 4.42, lensZ + (signal.facing === 0 ? 0.19 : -0.19));
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        greens.setMatrixAt(greenIndex, dummy.matrix);
        greenIndex += 1;
      }
    });
    for (const mesh of [poles, arms, heads, reds, greens]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      this.group.add(mesh);
    }
  }

  buildPlanters() {
    const planters = this.plan.planters;
    if (!planters.length) return;
    const potGeometry = new THREE.CylinderGeometry(0.58, 0.46, 0.9, 12);
    potGeometry.translate(0, 0.45, 0);
    const potMaterial = new THREE.MeshStandardMaterial({ color: 0xa9553f, roughness: 0.9 });
    const trunkGeometry = new THREE.CylinderGeometry(0.065, 0.09, 1.15, 6);
    trunkGeometry.translate(0, 0.575, 0);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6a5138, roughness: 0.98 });
    const bushGeometry = new THREE.IcosahedronGeometry(0.78, 1);
    const bushMaterial = new THREE.MeshStandardMaterial({ color: 0x507b45, roughness: 0.95, flatShading: true });
    const shadowGeometry = new THREE.PlaneGeometry(1.7, 1.7);
    shadowGeometry.rotateX(-Math.PI / 2);
    const shadowMaterial = new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, opacity: 0.5, depthWrite: false });
    const pots = new THREE.InstancedMesh(potGeometry, potMaterial, planters.length);
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, planters.length);
    const bushes = new THREE.InstancedMesh(bushGeometry, bushMaterial, planters.length);
    const shadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, planters.length);
    const dummy = new THREE.Object3D();
    planters.forEach((planter, index) => {
      const y = planter.y ?? this.plan.heightAt(planter.x, planter.z);
      dummy.position.set(planter.x, y, planter.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pots.setMatrixAt(index, dummy.matrix);
      dummy.position.set(planter.x, y + 0.9, planter.z);
      dummy.updateMatrix();
      trunks.setMatrixAt(index, dummy.matrix);
      dummy.position.set(planter.x, y + 2.0, planter.z);
      dummy.rotation.set(0.2, index * 0.7, 0.1);
      dummy.scale.set(1, 1.15, 1);
      dummy.updateMatrix();
      bushes.setMatrixAt(index, dummy.matrix);
      dummy.position.set(planter.x, y + 0.02, planter.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      shadows.setMatrixAt(index, dummy.matrix);
    });
    for (const mesh of [pots, trunks, bushes]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    shadows.instanceMatrix.needsUpdate = true;
    this.group.add(shadows);
  }

  buildCafes() {
    const cafes = this.plan.cafes;
    if (!cafes.length) return;
    const metal = new THREE.MeshStandardMaterial({ color: 0x393d40, roughness: 0.5, metalness: 0.45 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0xe3d8c2, roughness: 0.9 });
    const tops = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.46, 0.46, 0.05, 14), cloth, cafes.length);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 0.72, 6), metal, cafes.length);
    const bases = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.28, 0.05, 10), metal, cafes.length);
    const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), metal, cafes.length * 3);
    const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.5, 0.06), metal, cafes.length * 3);
    const dummy = new THREE.Object3D();
    cafes.forEach((cafe, index) => {
      const y = cafe.y ?? config.slabHeight;
      dummy.position.set(cafe.x, y + 0.74, cafe.z);
      dummy.rotation.set(0, index, 0);
      dummy.updateMatrix();
      tops.setMatrixAt(index, dummy.matrix);
      dummy.position.set(cafe.x, y + 0.36, cafe.z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      poles.setMatrixAt(index, dummy.matrix);
      dummy.position.set(cafe.x, y + 0.025, cafe.z);
      dummy.updateMatrix();
      bases.setMatrixAt(index, dummy.matrix);
      for (let c = 0; c < 3; c += 1) {
        const angle = (c / 3) * Math.PI * 2 + index * 0.7;
        const cx = cafe.x + Math.cos(angle) * 0.95;
        const cz = cafe.z + Math.sin(angle) * 0.95;
        dummy.position.set(cx, y + 0.45, cz);
        dummy.rotation.set(0, -angle + Math.PI / 2, 0);
        dummy.updateMatrix();
        seats.setMatrixAt(index * 3 + c, dummy.matrix);
        const bx = cx - Math.cos(angle) * 0.2;
        const bz = cz - Math.sin(angle) * 0.2;
        dummy.position.set(bx, y + 0.72, bz);
        dummy.updateMatrix();
        backs.setMatrixAt(index * 3 + c, dummy.matrix);
      }
    });
    for (const mesh of [tops, poles, bases, seats, backs]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  buildManholes() {
    const manholes = this.plan.manholes;
    if (!manholes.length) return;
    const geometry = new THREE.CircleGeometry(0.52, 14);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({ color: 0x3c3a36, roughness: 0.62, metalness: 0.55 });
    const mesh = new THREE.InstancedMesh(geometry, material, manholes.length);
    const dummy = new THREE.Object3D();
    manholes.forEach((manhole, index) => {
      dummy.position.set(manhole.x, this.plan.heightAt(manhole.x, manhole.z) + 0.035, manhole.z);
      dummy.rotation.set(0, index * 0.9, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  setPeriod(period) {
    const night = period === 'night';
    if (this.pools) this.pools.opacity = night ? 0.55 : 0;
    this.lampHeads.emissiveIntensity = night ? 1.7 : 0.06;
  }
}
