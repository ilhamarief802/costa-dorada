// Combat: two hitscan weapons, muzzle flash, tracers, blood puffs, damage numbers and the
// health/armour pickups scattered through the city. Bullets stop at walls; pedestrians,
// mission enemies and police cruisers are all valid targets.
import config from '../core/config.js';
import Rng from '../core/rng.js';
import { contactShadowTexture, glowTexture } from '../core/assets.js';

const THREE = globalThis.THREE;

const TRACER_POOL = 20;
const BLOOD_POOL = 220;

export default class Combat {
  constructor({ plan, scene, camera, player, vehicle, traffic, pedestrians, police, missions, hud, events, state, input }) {
    this.plan = plan;
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.vehicle = vehicle;
    this.traffic = traffic;
    this.pedestrians = pedestrians;
    this.police = police;
    this.missions = missions;
    this.hud = hud;
    this.events = events;
    this.state = state;
    this.input = input;
    this.rng = new Rng((plan.seed ^ 0x1b7c4f29) >>> 0);
    this.group = new THREE.Group();
    this.group.name = 'combat';
    scene.add(this.group);
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.flashLife = 0;
    this.kick = 0;
    this.shots = 0;
    this.buildTracers();
    this.buildMuzzle();
    this.buildBlood();
    this.buildPickups();
    this.selectWeapon('pistol', true);
  }

  buildTracers() {
    const positions = new Float32Array(TRACER_POOL * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracers = new THREE.LineSegments(geometry, material);
    this.tracers.frustumCulled = false;
    this.tracerData = [];
    for (let i = 0; i < TRACER_POOL; i += 1) this.tracerData.push({ life: 0, a: new THREE.Vector3(), b: new THREE.Vector3() });
    this.tracerPositions = positions;
    this.group.add(this.tracers);
  }

  buildMuzzle() {
    const material = new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,240,190,1)', 'rgba(255,150,40,0)'),
      color: 0xffd28a,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.muzzle = new THREE.Sprite(material);
    this.muzzle.scale.set(0.75, 0.75, 1);
    this.muzzle.visible = false;
    this.group.add(this.muzzle);
  }

  buildBlood() {
    const positions = new Float32Array(BLOOD_POOL * 3);
    const colors = new Float32Array(BLOOD_POOL * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
    this.blood = new THREE.Points(geometry, material);
    this.blood.frustumCulled = false;
    for (let i = 0; i < BLOOD_POOL; i += 1) positions[i * 3 + 1] = -100;
    this.bloodPositions = positions;
    this.bloodColors = colors;
    this.bloodData = [];
    for (let i = 0; i < BLOOD_POOL; i += 1) this.bloodData.push({ life: 0, vx: 0, vy: 0, vz: 0 });
    this.group.add(this.blood);
  }

  buildPickups() {
    this.pickups = [];
    const spots = [];
    const blocks = this.plan.blocks;
    const chosen = [0, 6, 13, 20, 27, 34, 41, 48].map((i) => blocks[i % blocks.length]).filter(Boolean);
    chosen.forEach((block, i) => {
      spots.push({ x: block.x + (i % 2 === 0 ? 31.5 : -31.5), z: block.z + (i % 3 === 0 ? 31.5 : -31.5), kind: i % 3 === 2 ? 'armour' : 'health' });
    });
    spots.push({ x: this.plan.spawn.x + 6.5, z: this.plan.spawn.z - 5, kind: 'health' });
    spots.push({ x: this.plan.spawn.x - 7.5, z: this.plan.spawn.z - 6, kind: 'armour' });
    const healthMaterial = new THREE.MeshStandardMaterial({ color: 0xf3f1e2, roughness: 0.55 });
    const crossMaterial = new THREE.MeshStandardMaterial({ color: 0xd73a30, roughness: 0.5, emissive: 0x5c0d09, emissiveIntensity: 0.35 });
    const armourMaterial = new THREE.MeshStandardMaterial({ color: 0x2f5c9e, roughness: 0.4, metalness: 0.3, emissive: 0x0d2040, emissiveIntensity: 0.4 });
    const shadowMaterial = new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, opacity: 0.4, depthWrite: false });
    spots.forEach((spot) => {
      const group = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), spot.kind === 'health' ? healthMaterial : armourMaterial);
      box.position.y = 0.62;
      box.castShadow = true;
      group.add(box);
      if (spot.kind === 'health') {
        const a = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.13, 0.13), crossMaterial);
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.4, 0.13), crossMaterial);
        a.position.y = 0.62;
        b.position.y = 0.62;
        a.position.z = 0.32;
        b.position.z = 0.32;
        group.add(a, b);
      } else {
        const shield = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.1), new THREE.MeshStandardMaterial({ color: 0xe9edf3, roughness: 0.4 }));
        shield.position.set(0, 0.65, 0.32);
        group.add(shield);
      }
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), shadowMaterial);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.022;
      group.add(shadow);
      const y = this.plan.heightAt(spot.x, spot.z);
      group.position.set(spot.x, y + 0.36, spot.z);
      this.group.add(group);
      this.pickups.push({ ...spot, group, baseY: y + 0.36, active: true, timer: 0, phase: this.rng.float(0, 6.28) });
    });
  }

  selectWeapon(key, silent = false) {
    const spec = config.weapons[key];
    if (!spec) return;
    if (!this.state.ammo) this.state.ammo = {};
    if (!this.state.ammo[key]) this.state.ammo[key] = { ammo: spec.ammo, reserve: spec.reserve };
    this.state.weaponKey = key;
    this.spec = spec;
    this.cooldown = 0;
    if (!silent) this.hud.setWeapon(spec.name, this.state.ammo[key].ammo, this.state.ammo[key].reserve);
    this.hud.setWeapon(spec.name, this.state.ammo[key].ammo, this.state.ammo[key].reserve);
  }

  toggleWeapon() {
    const entries = Object.keys(config.weapons);
    const index = entries.indexOf(this.state.weaponKey);
    this.selectWeapon(entries[(index + 1) % entries.length]);
  }

  reload() {
    const key = this.state.weaponKey;
    const spec = config.weapons[key];
    const ammo = this.state.ammo[key];
    if (!ammo || ammo.ammo >= spec.ammo || ammo.reserve <= 0 || this.reloadTimer > 0) return;
    this.reloadTimer = key === 'smg' ? 1.45 : 1.0;
    this.hud.showPrompt('RELOADING', 'R');
  }

  finishReload() {
    const key = this.state.weaponKey;
    const spec = config.weapons[key];
    const ammo = this.state.ammo[key];
    const need = spec.ammo - ammo.ammo;
    const load = Math.min(need, ammo.reserve);
    ammo.ammo += load;
    ammo.reserve -= load;
    this.hud.setWeapon(spec.name, ammo.ammo, ammo.reserve);
    this.hud.showPrompt(null);
  }

  muzzlePoint(direction, out) {
    const yaw = Math.atan2(direction.x, direction.z);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    return out.set(
      this.player.pos.x + direction.x * 0.55 + rightX * 0.24,
      this.player.pos.y + 1.42,
      this.player.pos.z + direction.z * 0.55 + rightZ * 0.24,
    );
  }

  fire() {
    const key = this.state.weaponKey;
    const spec = config.weapons[key];
    const ammo = this.state.ammo[key];
    if (this.cooldown > 0 || this.reloadTimer > 0) return;
    if (ammo.ammo <= 0) {
      this.reload();
      return;
    }
    ammo.ammo -= 1;
    this.shots += 1;
    this.cooldown = spec.rate;
    this.hud.setWeapon(spec.name, ammo.ammo, ammo.reserve);

    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    // Converge the bullet on whatever the crosshair actually covers: trace from the camera
    // first, then send the round from the chest to that point. A flat 80 m aim point made
    // close targets miss below the reticle.
    const cameraHit = this.raycast(this.camera.position, camDir, spec.range);
    const aimDistance = cameraHit.target || cameraHit.world ? cameraHit.distance : 80;
    const aim = this.camera.position.clone().addScaledVector(camDir, aimDistance);
    const chest = new THREE.Vector3(this.player.pos.x, this.player.pos.y + 1.28, this.player.pos.z);
    const direction = aim.sub(chest).normalize();
    const spread = spec.spread;
    direction.x += this.rng.float(-spread, spread);
    direction.y += this.rng.float(-spread * 0.7, spread * 0.7);
    direction.z += this.rng.float(-spread, spread);
    direction.normalize();

    const hit = this.raycast(chest, direction, spec.range);
    const end = chest.clone().addScaledVector(direction, hit.distance);
    this.spawnTracer(this.muzzlePoint(direction, new THREE.Vector3()), end);
    const muzzle = this.muzzlePoint(direction, new THREE.Vector3());
    this.muzzle.position.copy(muzzle);
    this.muzzle.visible = true;
    this.flashLife = 0.055;

    if (hit.target) {
      if (hit.target.kind === 'ped') {
        this.pedestrians.kill(hit.target.ref, direction.x > 0 ? 1 : -1);
        this.spawnBlood(end, 12);
        this.hud.spawnDamage(end, spec.damage, false);
      } else if (hit.target.kind === 'enemy') {
        hit.target.hit(spec.damage);
        this.spawnBlood(end, 10);
        this.hud.spawnDamage(end, spec.damage, false);
      } else if (hit.target.kind === 'police') {
        hit.target.hit(spec.damage);
        this.spawnBlood(end, 6);
        this.hud.spawnDamage(end, spec.damage, true);
      } else {
        this.spawnSparks(end);
      }
    } else if (hit.world) {
      this.spawnSparks(end);
    }

    const witnesses = this.pedestrians.panicAt(this.player.pos.x, this.player.pos.z, 30, 8);
    const nearPeople = witnesses > 0;
    if (nearPeople) this.police.addWanted(this.state.wanted > 0 ? 1 : 2, 'gunfire');
    this.events.emit('gunshot', { x: this.player.pos.x, y: this.player.pos.y + 1.3, z: this.player.pos.z, witnesses });
    this.kick = 0.03;
  }

  raycast(origin, direction, range) {
    let bestDistance = range;
    let bestTarget = null;
    let world = false;
    const targets = [];
    for (const ped of this.pedestrians.peds) {
      if (ped.dead) continue;
      targets.push({ kind: 'ped', ref: ped, x: ped.x, y: ped.ground + 1.05, z: ped.z, radius: 0.58 });
    }
    if (this.missions?.getTargets) targets.push(...this.missions.getTargets());
    if (this.police?.getTargets) targets.push(...this.police.getTargets());
    const vx = { x: 0, y: 0, z: 0 };
    for (const target of targets) {
      vx.x = target.x - origin.x;
      vx.y = target.y - origin.y;
      vx.z = target.z - origin.z;
      const along = vx.x * direction.x + vx.y * direction.y + vx.z * direction.z;
      if (along < 0.3 || along > bestDistance) continue;
      const px = vx.x - direction.x * along;
      const py = vx.y - direction.y * along;
      const pz = vx.z - direction.z * along;
      const perpendicular = Math.hypot(px, py, pz);
      if (perpendicular <= target.radius) {
        bestDistance = along;
        bestTarget = target;
        world = false;
      }
    }
    for (const box of this.plan.colliders) {
      if (box.kind !== 'building' && box.kind !== 'pillar') continue;
      let tmin = 0;
      let tmax = bestDistance;
      let hit = true;
      for (const axis of ['x', 'y', 'z']) {
        const min = axis === 'x' ? box.minX : axis === 'y' ? box.minY : box.minZ;
        const max = axis === 'x' ? box.maxX : axis === 'y' ? box.maxY : box.maxZ;
        const o = origin[axis];
        const d = direction[axis];
        if (Math.abs(d) < 1e-8) {
          if (o < min || o > max) { hit = false; break; }
          continue;
        }
        let t1 = (min - o) / d;
        let t2 = (max - o) / d;
        if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) { hit = false; break; }
      }
      if (hit && tmin > 0.4 && tmin < bestDistance) {
        bestDistance = tmin;
        bestTarget = null;
        world = true;
      }
    }
    return { distance: bestDistance, target: bestTarget, world };
  }

  spawnTracer(a, b) {
    const slot = this.tracerData.find((tracer) => tracer.life <= 0) ?? this.tracerData[0];
    slot.life = 0.075;
    slot.a.copy(a);
    slot.b.copy(b);
  }

  spawnBlood(point, count) {
    for (let i = 0; i < count; i += 1) {
      const slot = this.bloodData.find((particle) => particle.life <= 0);
      if (!slot) break;
      const index = this.bloodData.indexOf(slot);
      slot.life = this.rng.float(0.45, 0.9);
      slot.vx = this.rng.float(-1.8, 1.8);
      slot.vy = this.rng.float(0.6, 3.2);
      slot.vz = this.rng.float(-1.8, 1.8);
      this.bloodPositions[index * 3] = point.x;
      this.bloodPositions[index * 3 + 1] = point.y;
      this.bloodPositions[index * 3 + 2] = point.z;
      this.bloodColors[index * 3] = 0.55;
      this.bloodColors[index * 3 + 1] = 0.05;
      this.bloodColors[index * 3 + 2] = 0.04;
    }
    this.blood.geometry.attributes.color.needsUpdate = true;
  }

  spawnSparks(point) {
    for (let i = 0; i < 4; i += 1) {
      const slot = this.bloodData.find((particle) => particle.life <= 0);
      if (!slot) break;
      const index = this.bloodData.indexOf(slot);
      slot.life = this.rng.float(0.18, 0.35);
      slot.vx = this.rng.float(-2.4, 2.4);
      slot.vy = this.rng.float(1.0, 3.0);
      slot.vz = this.rng.float(-2.4, 2.4);
      this.bloodPositions[index * 3] = point.x;
      this.bloodPositions[index * 3 + 1] = point.y;
      this.bloodPositions[index * 3 + 2] = point.z;
      this.bloodColors[index * 3] = 0.95;
      this.bloodColors[index * 3 + 1] = 0.7;
      this.bloodColors[index * 3 + 2] = 0.3;
    }
    this.blood.geometry.attributes.color.needsUpdate = true;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.kick = Math.max(0, this.kick - dt * 0.6);
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) this.muzzle.visible = false;
    }
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }
    if (this.state.mode === 'playing' && !this.vehicle.occupied) {
      if (this.input.consume('weapon1')) this.selectWeapon('pistol');
      if (this.input.consume('weapon2')) this.selectWeapon('smg');
      if (this.input.consume('reload')) this.reload();
      if (this.input.consumeFire()) this.fire();
      else if (this.spec.auto && this.input.isFiring()) this.fire();
    }

    // Tracers
    let write = 0;
    for (const tracer of this.tracerData) {
      if (tracer.life > 0) {
        tracer.life -= dt;
        this.tracerPositions[write * 6] = tracer.a.x;
        this.tracerPositions[write * 6 + 1] = tracer.a.y;
        this.tracerPositions[write * 6 + 2] = tracer.a.z;
        this.tracerPositions[write * 6 + 3] = tracer.b.x;
        this.tracerPositions[write * 6 + 4] = tracer.b.y;
        this.tracerPositions[write * 6 + 5] = tracer.b.z;
      } else {
        for (let k = 0; k < 6; k += 1) this.tracerPositions[write * 6 + k] = 0;
      }
      write += 1;
    }
    this.tracers.geometry.attributes.position.needsUpdate = true;

    // Blood and sparks
    const positions = this.bloodPositions;
    for (let i = 0; i < BLOOD_POOL; i += 1) {
      const particle = this.bloodData[i];
      if (particle.life <= 0) {
        positions[i * 3 + 1] = -100;
        continue;
      }
      particle.life -= dt;
      particle.vy -= 9.8 * dt;
      positions[i * 3] += particle.vx * dt;
      positions[i * 3 + 1] += particle.vy * dt;
      positions[i * 3 + 2] += particle.vz * dt;
      if (particle.life <= 0) positions[i * 3 + 1] = -100;
    }
    this.blood.geometry.attributes.position.needsUpdate = true;

    // Pickups
    for (const pickup of this.pickups) {
      if (!pickup.active) {
        pickup.timer -= dt;
        if (pickup.timer <= 0) {
          pickup.active = true;
          pickup.group.visible = true;
        }
        continue;
      }
      pickup.phase += dt;
      pickup.group.rotation.y += dt * 1.7;
      pickup.group.position.y = pickup.baseY + Math.sin(pickup.phase * 1.8) * 0.09;
      const distance = Math.hypot(this.player.pos.x - pickup.x, this.player.pos.z - pickup.z);
      if (!this.vehicle.occupied && distance < 1.35) {
        let taken = false;
        if (pickup.kind === 'health' && this.state.health < 1) {
          this.state.health = Math.min(1, this.state.health + 0.45);
          this.hud.setHealth(this.state.health);
          this.hud.spawnMessage('+ HEALTH', '#7ad67a');
          taken = true;
        } else if (pickup.kind === 'armour' && this.state.armour < 1) {
          this.state.armour = Math.min(1, this.state.armour + 0.5);
          this.hud.setArmour(this.state.armour);
          this.hud.spawnMessage('+ ARMOUR', '#7ab8e8');
          taken = true;
        }
        if (taken) {
          pickup.active = false;
          pickup.timer = 38;
          pickup.group.visible = false;
        }
      }
    }
  }

  addAmmo(key, amount) {
    const spec = config.weapons[key];
    if (!this.state.ammo[key]) this.state.ammo[key] = { ammo: spec.ammo, reserve: spec.reserve };
    this.state.ammo[key].reserve += amount;
    if (this.state.weaponKey === key) {
      this.hud.setWeapon(spec.name, this.state.ammo[key].ammo, this.state.ammo[key].reserve);
    }
  }
}
