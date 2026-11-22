// Police and the wanted level. One to five stars raise the heat: cruisers spawn off-screen and
// drive at the player with flashing bars and a two-tone siren, three stars bring a roadblock,
// four add a helicopter with a searchlight. Breaking line of sight for long enough clears it.
import config from '../core/config.js';
import Rng from '../core/rng.js';
import { clamp, dampAngle, rayBox, resolveCircleBox } from '../core/math.js';
import { buildCar as kitBuildCar } from '../entities/carkit.js';
import { contactShadowTexture } from '../core/assets.js';

const THREE = globalThis.THREE;

function buildCruiser() {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xf2f0e6, roughness: 0.34, metalness: 0.3 });
  const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0x16376b, roughness: 0.45, metalness: 0.25 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x131c24, roughness: 0.1, metalness: 0.7 });
  const tyreMaterial = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.95 });
  const chromeMaterial = new THREE.MeshStandardMaterial({ color: 0xcbc6b8, roughness: 0.2, metalness: 0.9 });

  // Rounded shell from the shared kit, so a cruiser reads as the same car family.
  const kit = kitBuildCar('cruiser');
  const paint = new THREE.Mesh(kit.paint, bodyMaterial);
  paint.castShadow = true;
  paint.receiveShadow = true;
  group.add(paint);
  group.add(new THREE.Mesh(kit.trim, chromeMaterial));

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.24, 2.4), stripeMaterial);
  stripe.position.set(0, 0.72, 0.1);
  stripe.castShadow = true;
  group.add(stripe);

  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.42, 1.9), glassMaterial);
  glass.position.set(0, 1.16, -0.22);
  group.add(glass);

  const pushBar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 0.14), chromeMaterial);
  pushBar.position.set(0, 0.5, 2.28);
  group.add(pushBar);

  const wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.27, 12);
  wheelGeometry.rotateZ(Math.PI / 2);
  for (const sx of [-0.9, 0.9]) {
    for (const sz of [-1.44, 1.44]) {
      const wheel = new THREE.Mesh(wheelGeometry, tyreMaterial);
      wheel.position.set(sx, 0.34, sz);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }

  // Light bar: two lenses either side, plus a shadow-casting spine and roof fins.
  const redMaterial = new THREE.MeshBasicMaterial({ color: 0xff2a1e, toneMapped: false });
  const blueMaterial = new THREE.MeshBasicMaterial({ color: 0x2a5dff, toneMapped: false });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.1, 0.24), new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.6 }));
  bar.position.set(0, 1.4, 0.4);
  group.add(bar);
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.26), redMaterial);
  red.position.set(-0.34, 1.47, 0.4);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.26), blueMaterial);
  blue.position.set(0.34, 1.47, 0.4);
  group.add(red, blue);

  // Working spot lamps, so the bar actually throws light down the road.
  const lamp = new THREE.SpotLight(0xbfd4ff, 0, 46, 0.5, 0.55, 1.4);
  lamp.position.set(0, 1.5, 0.4);
  lamp.target.position.set(0, 0, 12);
  group.add(lamp);
  group.add(lamp.target);

  // Contact shadow, so the cruiser sits on the road rather than hovering over it.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.1, 5.1),
    new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, opacity: 0.86, depthWrite: false, color: 0x000000 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.05;
  shadow.renderOrder = 2;
  group.add(shadow);

  return { group, redMaterial, blueMaterial, lamp };
}

/**
 * A police box truck for roadblocks: a cab-over cab, a tall cargo body, a light bar and a
 * ground-hugging blob shadow. Built from the same materials as a cruiser so the two read as one
 * force; the nose points along local +Z, the way every vehicle in the game does.
 */
function buildTruck() {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xece9df, roughness: 0.42, metalness: 0.22 });
  const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0x1a3f74, roughness: 0.48, metalness: 0.2 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x121b22, roughness: 0.1, metalness: 0.7 });
  const tyreMaterial = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.95 });
  const chromeMaterial = new THREE.MeshStandardMaterial({ color: 0xc6c1b4, roughness: 0.25, metalness: 0.85 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.28, 6.3), stripeMaterial);
  chassis.position.set(0, 0.62, 0);
  group.add(chassis);

  const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.34, 2.4, 4.45), bodyMaterial);
  cargo.position.set(0, 1.92, -1.0);
  cargo.castShadow = true;
  cargo.receiveShadow = true;
  group.add(cargo);

  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.24, 1.62, 2.1), bodyMaterial);
  cab.position.set(0, 1.5, 2.06);
  cab.castShadow = true;
  group.add(cab);

  const windscreen = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.72, 0.08), glassMaterial);
  windscreen.position.set(0, 1.78, 3.1);
  group.add(windscreen);

  const band = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.42, 4.5), stripeMaterial);
  band.position.set(0, 1.28, -1.0);
  group.add(band);

  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 0.1), chromeMaterial);
  grille.position.set(0, 0.95, 3.12);
  group.add(grille);

  const wheelGeometry = new THREE.CylinderGeometry(0.46, 0.46, 0.32, 12);
  wheelGeometry.rotateZ(Math.PI / 2);
  for (const sx of [-1.02, 1.02]) {
    for (const sz of [-2.15, 2.1]) {
      const wheel = new THREE.Mesh(wheelGeometry, tyreMaterial);
      wheel.position.set(sx, 0.46, sz);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }

  // Light bar on the cab roof.
  const redMaterial = new THREE.MeshBasicMaterial({ color: 0xff2a1e, toneMapped: false });
  const blueMaterial = new THREE.MeshBasicMaterial({ color: 0x2a5dff, toneMapped: false });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.1, 0.26), new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.6 }));
  bar.position.set(0, 2.36, 2.2);
  group.add(bar);
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.14, 0.28), redMaterial);
  red.position.set(-0.4, 2.43, 2.2);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.14, 0.28), blueMaterial);
  blue.position.set(0.4, 2.43, 2.2);
  group.add(red, blue);

  const lamp = new THREE.SpotLight(0xbfd4ff, 0, 50, 0.55, 0.6, 1.4);
  lamp.position.set(0, 1.4, 3.0);
  lamp.target.position.set(0, 0, 16);
  group.add(lamp, lamp.target);

  // Tyre contact shadow, laid 4 cm above the road plate so it never z-fights the tarmac.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 7.4),
    new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, opacity: 0.82, depthWrite: false, color: 0x000000 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  shadow.renderOrder = 2;
  group.add(shadow);

  return { group, redMaterial, blueMaterial, lamp };
}

export default class Police {
  constructor({ plan, scene, player, vehicle, traffic, hud, events, state, seed }) {
    this.plan = plan;
    this.scene = scene;
    this.player = player;
    this.vehicle = vehicle;
    this.traffic = traffic;
    this.hud = hud;
    this.events = events;
    this.state = state;
    this.rng = new Rng((seed ^ 0x6d3f91b7) >>> 0);
    this.group = new THREE.Group();
    this.group.name = 'police';
    scene.add(this.group);
    this.cruisers = [];
    this.roadblocks = [];
    this.helicopter = null;
    this.spawnTimer = 0;
    this.roadblockTimer = 0;
    this.sightTimer = 0;
    this.losTimer = 0;
    this.losVisible = false;
    this.elapsed = 0;
    this.siren = null;
    this.sirenOn = false;
    this.audio = null;
    this.state.wanted = this.state.wanted ?? 0;
    this.stars = 0;
    this.emitWanted();
  }

  unlockAudio() {
    if (this.audio) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      this.audio = new AudioContext();
    } catch {
      this.audio = null;
    }
  }

  startSiren() {
    if (!this.audio || this.sirenOn) return;
    const context = this.audio;
    if (context.state === 'suspended') context.resume().catch(() => {});
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 700;
    gain.gain.value = 0.0001;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    gain.gain.linearRampToValueAtTime(0.018, context.currentTime + 0.6);
    this.siren = { oscillator, gain };
    this.sirenOn = true;
  }

  stopSiren() {
    if (!this.siren) return;
    const { oscillator, gain } = this.siren;
    const now = this.audio.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.linearRampToValueAtTime(0.0001, now + 0.25);
    oscillator.stop(now + 0.3);
    this.siren = null;
    this.sirenOn = false;
  }

  emitWanted() {
    this.stars = clamp(this.state.wanted | 0, 0, 5);
    this.hud.setWanted?.(this.stars);
    this.events.emit('wanted', this.stars);
  }

  addWanted(amount, reason = '') {
    const before = this.state.wanted | 0;
    this.state.wanted = clamp(before + Math.max(1, amount), 1, 5);
    this.sightTimer = 0;
    if (this.state.wanted !== before) {
      this.emitWanted();
      this.events.emit('crime', { level: this.state.wanted, reason });
    }
    this.ensureCruisers();
  }

  setWanted(level, quiet = false) {
    this.state.wanted = clamp(level | 0, 0, 5);
    this.sightTimer = 0;
    if (!quiet) this.emitWanted();
    else this.stars = this.state.wanted;
    if (this.state.wanted === 0) this.dismantle();
    else this.ensureCruisers();
  }

  dismantle() {
    for (const cruiser of this.cruisers) this.group.remove(cruiser.group);
    this.cruisers.length = 0;
    this.clearRoadblocks();
    if (this.helicopter) this.helicopter.group.visible = false;
    this.stopSiren();
  }

  clearRoadblocks() {
    for (const block of this.roadblocks) this.group.remove(block.group);
    this.roadblocks.length = 0;
  }

  spawnCruiser(x, z, yaw, parked = false) {
    const model = buildCruiser();
    const cruiser = {
      ...model,
      pos: new THREE.Vector3(x, this.plan.heightAt(x, z), z),
      yaw,
      speed: 0,
      hp: 180,
      alive: true,
      parked,
      fireTimer: this.rng.float(0.6, 1.8),
      flash: 0,
      hitFlash: 0,
    };
    this.group.add(model.group);
    this.cruisers.push(cruiser);
    return cruiser;
  }

  nearestRoad(value, axis) {
    const list = axis === 'x' ? this.plan.roads.x : this.plan.roads.z;
    let best = list[0];
    let bestDistance = Infinity;
    for (const road of list) {
      const distance = Math.abs(value - road);
      if (distance < bestDistance) { bestDistance = distance; best = road; }
    }
    return best;
  }

  spawnOffscreen(playerPos) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = this.rng.float(0, Math.PI * 2);
      const distance = config.police.spawnDistance + this.rng.float(-18, 26);
      let x = playerPos.x + Math.cos(angle) * distance;
      let z = playerPos.z + Math.sin(angle) * distance;
      if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) x = this.nearestRoad(x, 'x');
      else z = this.nearestRoad(z, 'z');
      x = clamp(x, -310, 310);
      z = clamp(z, -310, 330);
      if (Math.hypot(x - playerPos.x, z - playerPos.z) < 120) continue;
      const colliders = this.plan.queryColliders(x, z, 2.6, []);
      const blocked = colliders.some((box) => (box.kind === 'building' || box.kind === 'pillar') && resolveCircleBox(x, z, 1.7, box));
      if (!blocked) {
        return this.spawnCruiser(x, z, Math.atan2(playerPos.x - x, playerPos.z - z));
      }
    }
    return this.spawnCruiser(clamp(playerPos.x + 130, -300, 300), 329, -Math.PI / 2);
  }

  ensureCruisers() {
    const want = Math.min(config.police.maxCruisers, Math.max(1, this.state.wanted));
    let active = this.cruisers.filter((cruiser) => cruiser.alive).length;
    while (active < want) {
      const playerPos = this.vehicle.occupied ? this.vehicle.pos : this.player.pos;
      this.spawnOffscreen(playerPos);
      active += 1;
    }
  }

  hasLineOfSight(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 0.1) return true;
    const direction = { x: dx / length, y: dy / length, z: dz / length };
    for (const box of this.plan.colliders) {
      if (box.kind !== 'building' && box.kind !== 'pillar') continue;
      const hit = rayBox(from, direction, box, length - 0.5);
      if (hit < length - 0.5) return false;
    }
    return true;
  }

  damagePlayer(amount, x, z) {
    if (this.state.mode !== 'playing') return;
    this.events.emit('player-damaged', { amount, x, z });
  }

  update(dt, ctx = {}) {
    this.elapsed += dt;
    if (this.state.wanted <= 0) {
      this.stopSiren();
      return;
    }
    const playerPos = this.vehicle.occupied ? this.vehicle.pos : this.player.pos;
    this.spawnTimer -= dt;
    if (this.cruisers.filter((c) => c.alive).length < Math.min(config.police.maxCruisers, this.state.wanted) && this.spawnTimer <= 0) {
      this.spawnOffscreen(playerPos);
      this.spawnTimer = 2.6;
    }

    // Refresh line of sight a few times a second, not every frame.
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.24;
      this.losVisible = false;
      for (const cruiser of this.cruisers) {
        if (!cruiser.alive) continue;
        const distance = cruiser.pos.distanceTo(playerPos);
        if (distance < config.police.loseDistance) {
          const eye = { x: cruiser.pos.x, y: cruiser.pos.y + 1.6, z: cruiser.pos.z };
          if (this.hasLineOfSight(eye, { x: playerPos.x, y: playerPos.y + 1.2, z: playerPos.z })) {
            this.losVisible = true;
            break;
          }
        }
      }
      if (this.losVisible) this.sightTimer = 0;
      else this.sightTimer += 0.24;
      if (this.sightTimer > config.police.loseTime) {
        if (this.state.wanted <= 2) this.setWanted(0);
        else this.setWanted(this.state.wanted - 1);
        this.sightTimer = 0;
        this.events.emit('pursuit-lost');
      }
    }

    let near = false;
    for (const cruiser of this.cruisers) {
      if (!cruiser.alive) continue;
      const distance = cruiser.pos.distanceTo(playerPos);
      if (distance < 55) near = true;
      this.updateCruiser(cruiser, dt, playerPos, ctx);
    }
    if (near) this.startSiren();
    for (const block of this.roadblocks) {
      for (const cruiser of block.cruisers) {
        if (cruiser.alive) this.updateCruiser(cruiser, dt, playerPos, ctx, true);
      }
      for (const light of block.lights) {
        light.material.color.setHex(Math.sin(this.elapsed * 9 + block.phase) > 0 ? 0xff3020 : 0x2a5dff);
      }
    }

    if (this.state.wanted >= config.police.roadblockLevel) {
      this.roadblockTimer -= dt;
      if (this.roadblockTimer <= 0 && !this.roadblocks.some((block) => block.pos.distanceTo(playerPos) < 190)) {
        this.spawnRoadblock(playerPos);
        this.roadblockTimer = 26;
      }
    }
    if (this.state.wanted >= config.police.helicopterLevel) this.updateHelicopter(dt, playerPos);
    else if (this.helicopter) this.helicopter.group.visible = false;
  }

  updateCruiser(cruiser, dt, target, ctx, roadblock = false) {
    if (!cruiser.alive) return;
    cruiser.flash = (cruiser.flash + dt) % 0.42;
    const on = cruiser.flash < 0.15;
    const flip = Math.sin(this.elapsed * 7 + cruiser.pos.x * 0.03) > 0;
    cruiser.redMaterial.color.setHex(on && flip ? 0xff2418 : 0x3a0b08);
    cruiser.blueMaterial.color.setHex(on && !flip ? 0x2a5dff : 0x0a123a);
    cruiser.hitFlash = Math.max(0, cruiser.hitFlash - dt);

    const dx = target.x - cruiser.pos.x;
    const dz = target.z - cruiser.pos.z;
    const distance = Math.hypot(dx, dz);
    if (!roadblock && !cruiser.parked) {
      const desired = Math.atan2(dx, dz);
      cruiser.yaw = dampAngle(cruiser.yaw, desired, 2.6, dt);
      const targetSpeed = distance > 12 ? config.police.speed + Math.min(6, this.state.wanted * 1.2) : 0;
      cruiser.speed += clamp(targetSpeed - cruiser.speed, -18 * dt, 9 * dt);
      const step = cruiser.speed * dt;
      const forwardX = Math.sin(cruiser.yaw);
      const forwardZ = Math.cos(cruiser.yaw);
      let moved = false;
      for (const offset of [0, 0.55, -0.55, 1.15, -1.15, 1.9, -1.9]) {
        const yaw = cruiser.yaw + offset;
        const nx = cruiser.pos.x + Math.sin(yaw) * step;
        const nz = cruiser.pos.z + Math.cos(yaw) * step;
        const blockers = this.plan.queryColliders(nx, nz, 2.2, []);
        let blocked = false;
        for (const box of blockers) {
          if (box.kind !== 'building' && box.kind !== 'pillar') continue;
          if (resolveCircleBox(nx, nz, 1.55, box)) { blocked = true; break; }
        }
        if (!blocked) {
          cruiser.pos.x = nx;
          cruiser.pos.z = nz;
          cruiser.yaw = yaw;
          moved = true;
          break;
        }
      }
      if (!moved) cruiser.speed *= 0.7;
      cruiser.pos.y = this.plan.heightAt(cruiser.pos.x, cruiser.pos.z);
      cruiser.group.position.copy(cruiser.pos);
      cruiser.group.rotation.y = cruiser.yaw;
      // Wheels are children without a handle; the whole group rolls, good enough at speed.
      cruiser.group.rotation.z = Math.sin(this.elapsed * 18) * Math.min(0.02, cruiser.speed * 0.0008);
    } else if (roadblock) {
      cruiser.group.position.copy(cruiser.pos);
      cruiser.group.rotation.y = cruiser.yaw;
    }

    if (cruiser.hp <= 0 && cruiser.alive) {
      cruiser.alive = false;
      cruiser.group.visible = false;
      this.events.emit('cruiser-down');
      return;
    }

    if (distance < config.police.shootRange) {
      const eye = { x: cruiser.pos.x, y: cruiser.pos.y + 1.55, z: cruiser.pos.z };
      const chest = { x: target.x, y: target.y + 1.2, z: target.z };
      if (this.hasLineOfSight(eye, chest)) {
        cruiser.fireTimer -= dt;
        if (cruiser.fireTimer <= 0) {
          cruiser.fireTimer = config.police.shootDelay + this.rng.float(0, 0.7);
          const accuracy = this.rng.float(0.32, 0.68);
          this.damagePlayer(5 + Math.round(accuracy * 9), cruiser.pos.x, cruiser.pos.z);
          this.events.emit('police-shot', { x: cruiser.pos.x, y: cruiser.pos.y + 1.4, z: cruiser.pos.z });
        }
      }
    }
    void ctx;
  }

  /**
   * Two police trucks nose-to-nose across the carriageway, a striped barrier bar spanning the gap
   * between their front bumpers, and a cone line in front. Everything is seated on
   * `plan.heightAt` so no part of the block hovers, and the whole assembly is built at an explicit
   * centre so a shot can place it without the simulation ever moving it.
   */
  buildRoadblock(centerX, centerZ, axis = 'x') {
    const ground = this.plan.heightAt(centerX, centerZ);
    const group = new THREE.Group();
    group.name = 'roadblock';
    // Built around its own centre and then placed, so the same block can close a north-south road
    // (axis 'x', trucks facing each other across world X) or an east-west one (axis 'z').
    group.position.set(centerX, ground, centerZ);
    group.rotation.y = axis === 'z' ? Math.PI / 2 : 0;
    const cruisers = [];
    // Half-gap between the trucks' noses, measured along the road's cross axis (world X).
    const NOSE_GAP = 2.9;
    const TRUCK_X = NOSE_GAP / 2 + 3.2;
    for (const sign of [-1, 1]) {
      const model = buildTruck();
      const x = TRUCK_X * sign;
      const cruiser = {
        ...model,
        pos: new THREE.Vector3(x, 0, 0),
        // Nose points at the other truck: +X for the west truck, -X for the east one.
        yaw: sign < 0 ? Math.PI / 2 : -Math.PI / 2,
        speed: 0,
        hp: 240,
        alive: true,
        parked: true,
        fireTimer: this.rng.float(0.5, 1.4),
        flash: 0,
        hitFlash: 0,
      };
      cruiser.group.position.copy(cruiser.pos);
      cruiser.group.rotation.y = cruiser.yaw;
      group.add(cruiser.group);
      cruisers.push(cruiser);
    }

    // The bar itself: alternating red/white panels on two steel posts, feet flat on the road.
    const panelMaterials = [
      new THREE.MeshStandardMaterial({ color: 0xc22d21, roughness: 0.55, emissive: 0x2a0603, emissiveIntensity: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0xf2efe4, roughness: 0.5, emissive: 0x2a2820, emissiveIntensity: 0.35 }),
    ];
    const span = NOSE_GAP + 0.4;
    const panels = 7;
    for (let i = 0; i < panels; i += 1) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(span / panels, 0.34, 0.14),
        panelMaterials[i % 2],
      );
      panel.position.set(-span / 2 + (i + 0.5) * (span / panels), 1.0, 0);
      panel.castShadow = true;
      group.add(panel);
    }
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.6, metalness: 0.5 });
    const footMaterial = new THREE.MeshStandardMaterial({ color: 0x23272a, roughness: 0.9 });
    for (const sign of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), postMaterial);
      post.position.set(sign * (span / 2 - 0.06), 0.5, 0);
      group.add(post);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.07, 0.5), footMaterial);
      foot.position.set(sign * (span / 2 - 0.06), 0.035, 0);
      group.add(foot);
    }

    // Cones on the near side of the block, so the closure reads before the trucks do.
    const lights = [];
    const cones = [];
    const coneMaterial = new THREE.MeshStandardMaterial({ color: 0xe4581f, roughness: 0.8 });
    for (let i = -3; i <= 3; i += 1) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.62, 8), coneMaterial);
      cone.position.set(i * 1.55, 0.31, 4.2);
      group.add(cone);
      cones.push(cone);
      if (i % 2 === 0) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
        lamp.position.set(cone.position.x, cone.position.y + 0.45, cone.position.z);
        group.add(lamp);
        lights.push(lamp);
      }
    }

    const block = { group, cruisers, lights, cones, phase: this.rng.float(0, 6), pos: new THREE.Vector3(centerX, 0, centerZ) };
    this.group.add(group);
    return block;
  }

  spawnRoadblock(playerPos) {
    const forward = this.vehicle.occupied ? { x: Math.sin(this.vehicle.yaw), z: Math.cos(this.vehicle.yaw) } : { x: 0, z: 1 };
    const centerX = playerPos.x + forward.x * 78;
    const centerZ = playerPos.z + forward.z * 78;
    // The block is laid across the road the player is on, centred on that road's own centre line,
    // and kept inside the city so a player near the promenade is not given a block in the sea.
    const northSouth = Math.abs(forward.x) < Math.abs(forward.z);
    const x = northSouth ? this.nearestRoad(centerX, 'x') : clamp(centerX, -config.cityHalf + 8, config.cityHalf - 8);
    const z = northSouth ? clamp(centerZ, -config.cityHalf + 8, config.cityHalf - 8) : this.nearestRoad(centerZ, 'z');
    const block = this.buildRoadblock(x, z, northSouth ? 'x' : 'z');
    this.roadblocks.push(block);
    this.events.emit('roadblock');
  }

  updateHelicopter(dt, playerPos) {
    if (!this.helicopter) {
      const group = new THREE.Group();
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x1d2a36, roughness: 0.46, metalness: 0.45 });
      const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.7, metalness: 0.3 });

      // Fuselage: a lofted pod, rounded at the nose, tapering into the tail boom.
      const pod = new THREE.SphereGeometry(1.0, 14, 10);
      pod.scale(1.35, 1.0, 2.3);
      const body = new THREE.Mesh(pod, bodyMaterial);
      body.castShadow = true;
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 4.6, 8), bodyMaterial);
      boom.rotation.x = Math.PI / 2;
      boom.position.set(0, 0.16, -3.4);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.7), darkMaterial);
      fin.position.set(0, 0.66, -5.5);
      const stabiliser = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 1.5), darkMaterial);
      stabiliser.position.set(0, 0.2, -5.1);

      // Glass cockpit bubble at the nose.
      const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.82, 12, 9),
        new THREE.MeshStandardMaterial({ color: 0x0d1620, roughness: 0.08, metalness: 0.8 }),
      );
      canopy.scale.set(1.22, 0.82, 0.72);
      canopy.position.set(0, -0.02, 1.44);

      // Main rotor: a hub and four blades, spun in the update.
      const rotor = new THREE.Group();
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.2, 8), darkMaterial);
      rotor.add(hub);
      for (let i = 0; i < 4; i += 1) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.045, 3.7), darkMaterial);
        blade.position.z = 1.85;
        const holder = new THREE.Group();
        holder.rotation.y = (i / 4) * Math.PI * 2;
        holder.add(blade);
        rotor.add(holder);
      }
      rotor.position.set(0, 0.88, 0);

      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.42, 6), darkMaterial);
      mast.position.set(0, 0.66, 0);

      const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 0.14), darkMaterial);
      tailRotor.position.set(0.16, 0.7, -5.45);

      // Skids.
      const skidGeometry = new THREE.BoxGeometry(0.1, 0.1, 2.6);
      const strutGeometry = new THREE.BoxGeometry(0.08, 0.5, 0.08);
      for (const side of [-1, 1]) {
        const skid = new THREE.Mesh(skidGeometry, darkMaterial);
        skid.position.set(side * 0.86, -1.02, 0.1);
        group.add(skid);
        for (const along of [-0.7, 0.7]) {
          const strut = new THREE.Mesh(strutGeometry, darkMaterial);
          strut.position.set(side * 0.86, -0.78, along);
          group.add(strut);
        }
      }

      // Searchlight: the lamp, plus a translucent cone standing in for the beam.
      const light = new THREE.SpotLight(0xffffff, 0, 90, 0.42, 0.45, 1.2);
      light.position.set(0, -0.9, 0.7);
      const target = new THREE.Object3D();
      const beamGeometry = new THREE.ConeGeometry(4.2, 26, 18, 1, true);
      beamGeometry.translate(0, -13, 0);
      const beam = new THREE.Mesh(
        beamGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xdce8ff,
          transparent: true,
          opacity: 0.1,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      beam.position.set(0, -0.9, 0.7);
      beam.rotation.x = 0.16;

      group.add(body, boom, fin, stabiliser, canopy, mast, rotor, tailRotor, light, target, beam);
      light.target = target;
      group.add(target);
      this.group.add(group);
      this.helicopter = { group, rotor, tailRotor, light, target, beam, angle: 0 };
    }
    const heli = this.helicopter;
    heli.group.visible = true;
    heli.angle += dt * 0.45;
    const radius = 46;
    const x = playerPos.x + Math.cos(heli.angle) * radius;
    const z = playerPos.z + Math.sin(heli.angle) * radius;
    const y = playerPos.y + 34;
    heli.group.position.set(x, y, z);
    heli.group.lookAt(playerPos.x, playerPos.y + 0.5, playerPos.z);
    heli.rotor.rotation.y += dt * 26;
    heli.tailRotor.rotation.x += dt * 30;
    heli.light.intensity = 2.8;
    heli.target.position.set(playerPos.x, playerPos.y + 0.3, playerPos.z);
    heli.target.updateMatrixWorld();
    // The beam leans from the lamp to the target so it always reads as a searchlight.
    const beam = heli.beam;
    const dx = playerPos.x - x;
    const dy = playerPos.y - 0.3 - (y - 0.9);
    const dz = playerPos.z - z;
    beam.rotation.set(0, 0, 0);
    beam.lookAt(playerPos.x, playerPos.y + 0.3, playerPos.z);
    beam.rotateX(-Math.PI / 2);
    const reach = Math.hypot(dx, dy, dz);
    beam.scale.set(1, Math.max(0.4, reach / 26), 1);
  }

  getTargets() {
    const targets = [];
    for (const cruiser of this.cruisers) {
      if (!cruiser.alive) continue;
      targets.push({
        x: cruiser.pos.x,
        y: cruiser.pos.y + 0.8,
        z: cruiser.pos.z,
        radius: 2.1,
        kind: 'police',
        hit: (damage) => {
          cruiser.hp -= damage;
          cruiser.hitFlash = 0.12;
          if (cruiser.hp <= 0) {
            cruiser.alive = false;
            cruiser.group.visible = false;
            this.events.emit('cruiser-down');
          }
        },
      });
    }
    return targets;
  }

  /**
   * The chase frame: three cruisers packed behind the hero car, the middle one slewed sideways
   * across the lane, the helicopter overhead. Poses are absolute so the shot is repeatable.
   */
  stageChase(playerPos) {
    this.setWanted(4, true);
    this.losVisible = true;
    // setWanted has already spawned chase cruisers off-screen; remove those groups from the
    // scene as well as the array, or they stay behind as orphaned grey bodies on the road.
    for (const cruiser of this.cruisers) this.group.remove(cruiser.group);
    this.cruisers.length = 0;
    // Absolute poses relative to the hero: a left flanker level with the door, a broadside car
    // slewed across the near lane, and a third filling the lane behind the hero. Every one sits
    // *ahead* of the camera (lower Z) — a cruiser parked on the lens would fill the frame with
    // a grey slab and intersect the near plane.
    const ring = [
      [playerPos.x - 3.2, playerPos.z - 2.5, Math.PI + 0.12],
      [playerPos.x + 3.5, playerPos.z - 1.0, Math.PI - 1.18],
      [playerPos.x - 0.4, playerPos.z - 6.5, Math.PI + 0.24],
    ];
    for (const [x, z, yaw] of ring) this.spawnCruiser(x, z, yaw);
    // The roadblock the hero is running into, 33 m down the avenue: two trucks nose-to-nose with
    // a striped barrier between them, parked across the lane.
    this.clearRoadblocks();
    const block = this.buildRoadblock(this.nearestRoad(playerPos.x, 'x'), playerPos.z - 33, 'x');
    for (const truck of block.cruisers) {
      truck.redMaterial.color.setHex(0xff2e22);
      truck.blueMaterial.color.setHex(0x2f66ff);
      if (truck.lamp) truck.lamp.intensity = 6;
    }
    this.roadblocks.push(block);
    this.emitWanted();
    this.updateHelicopter(0.016, playerPos);
    for (const cruiser of this.cruisers) {
      cruiser.group.position.copy(cruiser.pos);
      cruiser.group.rotation.y = cruiser.yaw;
      cruiser.redMaterial.color.setHex(0xff2e22);
      cruiser.blueMaterial.color.setHex(0x2f66ff);
      if (cruiser.lamp) cruiser.lamp.intensity = 6;
    }
    // Put the helicopter high and just behind the pack, silhouetted against the sky with its
    // searchlight raking down across the road.
    if (this.helicopter) {
      const heli = this.helicopter;
      const hx = playerPos.x - 7;
      const hy = playerPos.y + 15;
      const hz = playerPos.z + 22;
      heli.group.position.set(hx, hy, hz);
      heli.group.lookAt(playerPos.x, playerPos.y + 1, playerPos.z);
      heli.rotor.rotation.y = 0.7;
      heli.light.intensity = 9;
      // Aim the lamp at the road just ahead of the hero so the beam lands in frame.
      const aimX = playerPos.x + 1;
      const aimZ = playerPos.z + 4;
      heli.target.position.set(aimX, playerPos.y + 0.4, aimZ);
      heli.target.updateMatrixWorld();
      if (heli.beam) {
        heli.beam.lookAt(aimX, playerPos.y + 0.4, aimZ);
        heli.beam.rotateX(-Math.PI / 2);
        const reach = Math.hypot(aimX - hx, playerPos.y + 0.4 - (hy - 0.9), aimZ - hz);
        const s = Math.max(0.55, reach / 26);
        heli.beam.scale.set(s * 1.15, s, s * 1.15);
      }
    }
  }
}
