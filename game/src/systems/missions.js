// The story chain: eight missions, each a short sequence of stages (meet, steal, drive, shoot,
// escape, deliver). A beacon and minimap diamond mark the objective, a HUD arrow points at it,
// enemies shoot back, and any failed stage/expired timer offers a restart.
import config from '../core/config.js';
import Rng from '../core/rng.js';
import { glowTexture } from '../core/assets.js';
import { clamp, rayBox, shortestAngle, resolveCircleBox } from '../core/math.js';

const THREE = globalThis.THREE;

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

function blockCenter(plan, ix, iz) {
  // plan.blocks is pushed bx-major (bx outer, bz inner), so the flat index is ix*grid+iz.
  const block = plan.blocks[ix * config.grid + iz] ?? plan.blocks[0];
  return { x: block.x, z: block.z };
}

export default class Missions {
  constructor({ plan, scene, player, vehicle, traffic, pedestrians, police, hud, events, state, seed }) {
    this.plan = plan;
    this.scene = scene;
    this.player = player;
    this.vehicle = vehicle;
    this.traffic = traffic;
    this.pedestrians = pedestrians;
    this.police = police;
    this.hud = hud;
    this.events = events;
    this.state = state;
    this.rng = new Rng((seed ^ 0x37c1a5ef) >>> 0);
    this.group = new THREE.Group();
    this.group.name = 'missions';
    scene.add(this.group);
    this.enemies = [];
    this.marker = { x: 0, z: 0, active: false };
    this.index = 0;
    this.stage = 0;
    this.active = false;
    this.failed = false;
    this.complete = false;
    this.timer = null;
    this.stageTimer = 0;
    this.nextTimer = 0;
    this.stealFlag = false;
    this.elapsed = 0;
    this.buildBeacon();
    this.definitions = this.buildDefinitions();
    this.setHudIdle();
  }

  buildDefinitions() {
    const plan = this.plan;
    const plaza = blockCenter(plan, 1, 4);
    const park = blockCenter(plan, 5, 3);
    const downtown = { x: 47, z: -47 };
    const marina = { x: 268, z: 412 };
    const dock = { x: 302, z: 330 };
    const north = { x: 0, z: -235 };
    const west = { x: -235, z: 0 };
    const east = { x: 235, z: 0 };
    const avenue = blockCenter(plan, 3, 5);
    return [
      {
        chapter: 'CHAPTER I', title: 'SUNSET RUN', reward: 1200,
        stages: [{ type: 'reach', x: marina.x, z: marina.z, radius: 8, text: 'Meet Rafa at the marina before sundown.' }],
      },
      {
        chapter: 'CHAPTER I', title: 'SALT IN THE ENGINE', reward: 1500,
        stages: [
          { type: 'steal', text: 'Boost any car on the street (F beside it).' },
          { type: 'reach', x: dock.x, z: dock.z, radius: 9, needVehicle: true, text: 'Drive the stolen car to the marina lock-up.' },
        ],
      },
      {
        chapter: 'CHAPTER II', title: 'THE GREEN ROOM', reward: 2000,
        stages: [
          { type: 'kill', x: park.x, z: park.z, count: 5, radius: 26, text: 'Shoot out the crew holding the park.' },
        ],
      },
      {
        chapter: 'CHAPTER II', title: 'PINK SLIP', reward: 1800,
        stages: [
          { type: 'deliver', x: plaza.x, z: plaza.z, radius: 8, needVehicle: true, timer: 110, text: 'Deliver the package to the plaza before the timer runs out.' },
        ],
      },
      {
        chapter: 'CHAPTER III', title: 'HEAT EXCHANGE', reward: 2400,
        stages: [
          { type: 'escape', heat: 3, text: 'Lose the police. Break line of sight and keep moving.' },
        ],
      },
      {
        chapter: 'CHAPTER III', title: 'NIGHT SHIFT', reward: 2600,
        stages: [
          { type: 'steal', text: 'Take a car without attracting attention (F).' },
          { type: 'reach', x: marina.x, z: marina.z, radius: 8, needVehicle: true, text: 'Run the car down to the marina.' },
        ],
      },
      {
        chapter: 'CHAPTER IV', title: 'THE LONG WAY', reward: 3000,
        stages: [
          { type: 'reach', x: north.x, z: north.z, radius: 10, needVehicle: true, text: 'Checkpoint one: the north boulevard.' },
          { type: 'reach', x: west.x, z: west.z, radius: 10, needVehicle: true, text: 'Checkpoint two: the west blocks.' },
          { type: 'reach', x: east.x, z: east.z, radius: 10, needVehicle: true, text: 'Checkpoint three: the east strip.' },
        ],
      },
      {
        chapter: 'FINALE', title: 'COSTA DORADA', reward: 6000,
        stages: [
          { type: 'kill', x: downtown.x, z: downtown.z, count: 6, radius: 28, text: 'Take the tower crew apart.' },
          { type: 'steal', text: 'Steal a getaway car before the police seal the block.' },
          { type: 'escape', heat: 4, needVehicle: true, text: 'Escape the city. Lose the pursuit for good.' },
        ],
      },
    ];
  }

  buildBeacon() {
    this.beacon = new THREE.Group();
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.9, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.12, 8, 32), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    const inner = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.07, 6, 24), ringMaterial);
    inner.rotation.x = -Math.PI / 2;
    const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xffc759, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.5, 26, 12, 1, true), beamMaterial);
    beam.position.y = 13;
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), new THREE.MeshBasicMaterial({ color: 0xffe2a0, toneMapped: false }));
    diamond.position.y = 2.3;
    this.beacon.add(ring, inner, beam, diamond);
    this.beaconRing = ring;
    this.beaconInner = inner;
    this.beaconDiamond = diamond;
    this.group.add(this.beacon);
    this.beacon.visible = false;
  }

  setHudIdle() {
    this.hud.setMission('CHAPTER I', 'SUNSET RUN', 'Meet Rafa at the marina.');
  }

  notifySteal() {
    if (!this.active) return;
    const stage = this.currentStage();
    if (stage && stage.type === 'steal') this.stealFlag = true;
  }

  currentStage() {
    const mission = this.definitions[this.index];
    return mission ? mission.stages[this.stage] : null;
  }

  currentMission() {
    return this.definitions[this.index] ?? null;
  }

  activate(index, stage = 0, quiet = false) {
    this.clearEnemies();
    this.index = clamp(index, 0, this.definitions.length - 1);
    this.stage = clamp(stage, 0, this.definitions[this.index].stages.length - 1);
    this.active = true;
    this.failed = false;
    this.complete = false;
    this.stealFlag = false;
    this.stageTimer = 0;
    this.enterStage(quiet);
    if (!quiet) this.events.emit('mission-started', { index: this.index });
  }

  enterStage(quiet = false) {
    const stage = this.currentStage();
    const mission = this.currentMission();
    if (!stage) return;
    this.stealFlag = false;
    this.marker.active = Boolean(stage.x !== undefined && stage.z !== undefined);
    if (stage.x !== undefined) {
      this.marker.x = stage.x;
      this.marker.z = stage.z;
      this.beacon.position.set(stage.x, this.plan.heightAt(stage.x, stage.z), stage.z);
      this.beacon.visible = true;
      this.hud.minimap?.setMission({ x: stage.x, z: stage.z, color: 0xffc759 });
    } else {
      this.beacon.visible = false;
      this.hud.minimap?.setMission(null);
    }
    this.stageTimer = stage.timer ?? 0;
    this.hud.setMission(mission.chapter, mission.title, stage.text);
    this.hud.setTimer(stage.timer ?? null);
    if (stage.type === 'escape') {
      this.police.setWanted(stage.heat ?? 3);
    }
    if (stage.type === 'kill') this.spawnEnemies(stage);
    if (!quiet) this.events.emit('stage-started', { index: this.index, stage: this.stage });
  }

  spawnEnemies(stage) {
    this.clearEnemies();
    const count = stage.count ?? 4;
    for (let i = 0; i < count; i += 1) {
      let x = stage.x + this.rng.float(-stage.radius * 0.6, stage.radius * 0.6);
      let z = stage.z + this.rng.float(-stage.radius * 0.6, stage.radius * 0.6);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const colliders = this.plan.queryColliders(x, z, 1.2, []);
        const blocked = colliders.some((box) => box.kind === 'building' && resolveCircleBox(x, z, 0.7, box));
        if (!blocked) break;
        x = stage.x + this.rng.float(-stage.radius * 0.8, stage.radius * 0.8);
        z = stage.z + this.rng.float(-stage.radius * 0.8, stage.radius * 0.8);
      }
      this.spawnEnemy(x, z);
    }
  }

  spawnEnemy(x, z) {
    const group = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: 0x5a1e1e, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xb87a52, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.3), shirt);
    body.position.y = 1.12;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.26), skin);
    head.position.y = 1.6;
    head.castShadow = true;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.8, 0.2), dark);
    legL.position.set(-0.14, 0.4, 0);
    const legR = legL.clone();
    legR.position.x = 0.14;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x17191c, metalness: 0.5, roughness: 0.4 }));
    gun.position.set(0.32, 1.2, 0.3);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,236,180,1)', 'rgba(255,140,40,0)'), color: 0xffcf7a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    flash.scale.set(0.5, 0.5, 1);
    flash.visible = false;
    group.add(body, head, legL, legR, gun, flash);
    const ground = this.plan.heightAt(x, z);
    group.position.set(x, ground, z);
    this.group.add(group);
    this.enemies.push({
      group, flash, x, z, ground, hp: 100, alive: true,
      yaw: this.rng.float(0, 6.28), wait: this.rng.float(0.4, 1.6), flashLife: 0, deadT: 0,
      walk: this.rng.float(0, 6.28),
    });
  }

  clearEnemies() {
    for (const enemy of this.enemies) this.group.remove(enemy.group);
    this.enemies.length = 0;
  }

  getTargets() {
    const list = [];
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      list.push({
        kind: 'enemy', x: enemy.x, y: enemy.ground + 1.15, z: enemy.z, radius: 0.6,
        hit: (damage) => {
          enemy.hp -= damage;
          if (enemy.hp <= 0) {
            enemy.alive = false;
            enemy.deadT = 0;
            enemy.group.rotation.z = Math.PI / 2;
            enemy.group.position.y = enemy.ground + 0.1;
          }
        },
      });
    }
    return list;
  }

  aliveEnemies() {
    return this.enemies.filter((enemy) => enemy.alive).length;
  }

  updateEnemies(dt, playerPos) {
    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        enemy.deadT += dt;
        if (enemy.deadT > 8) enemy.group.visible = false;
        continue;
      }
      const toX = playerPos.x - enemy.x;
      const toZ = playerPos.z - enemy.z;
      const distance = Math.hypot(toX, toZ);
      const targetYaw = Math.atan2(toX, toZ);
      enemy.yaw += shortestAngle(enemy.yaw, targetYaw) * Math.min(1, dt * 5);
      enemy.walk += dt * 2;
      enemy.group.rotation.y = enemy.yaw;
      enemy.group.position.y = enemy.ground + Math.abs(Math.sin(enemy.walk)) * 0.02;

      if (enemy.flashLife > 0) {
        enemy.flashLife -= dt;
        if (enemy.flashLife <= 0) enemy.flash.visible = false;
      }
      if (distance < 34 && distance > 2) {
        enemy.wait -= dt;
        if (enemy.wait <= 0) {
          enemy.wait = 1.15 + this.rng.float(0, 0.9);
          enemy.flash.visible = true;
          enemy.flashLife = 0.05;
          enemy.flash.position.set(0.32, 1.2, 0.55);
          const eye = { x: enemy.x, y: enemy.ground + 1.5, z: enemy.z };
          const chest = { x: playerPos.x, y: playerPos.y + 1.15, z: playerPos.z };
          if (this.hasLineOfSight(eye, chest)) {
            const hits = this.rng.chance(0.55);
            if (hits) this.events.emit('player-damaged', { amount: 4 + this.rng.int(0, 4), x: enemy.x, z: enemy.z });
          }
        }
      }
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
      if (rayBox(from, direction, box, length - 0.4) < length - 0.4) return false;
    }
    return true;
  }

  stageComplete() {
    const stage = this.currentStage();
    const mission = this.currentMission();
    if (!stage || !mission) return;
    const next = this.stage + 1;
    if (next < mission.stages.length) {
      this.stage = next;
      this.enterStage();
      return;
    }
    this.active = false;
    this.marker.active = false;
    this.beacon.visible = false;
    this.hud.minimap?.setMission(null);
    this.state.money += mission.reward;
    this.hud.setMoney(this.state.money);
    this.hud.setTimer(null);
    this.hud.spawnMessage(`MISSION COMPLETE  +$${mission.reward.toLocaleString('en-US')}`, '#ffd77a');
    this.events.emit('mission-complete', { index: this.index, reward: mission.reward });
    if (this.index >= this.definitions.length - 1) {
      this.complete = true;
      this.hud.setMission('FINALE', 'COSTA DORADA', 'The city is yours. Free roam.');
      this.hud.spawnMessage('STORY COMPLETE', '#ffd77a');
      return;
    }
    this.nextTimer = 7;
    this.hud.setMission(mission.chapter, mission.title, 'Mission complete. Next job incoming...');
  }

  fail(text) {
    if (!this.active || this.failed) return;
    this.active = false;
    this.failed = true;
    this.hud.setTimer(null);
    this.hud.showFail(this.currentMission()?.title ?? 'MISSION', text ?? 'Mission failed.');
    this.events.emit('mission-failed', { index: this.index, stage: this.stage });
  }

  restart() {
    if (!this.failed) return;
    this.failed = false;
    this.activate(this.index, 0, true);
    this.hud.hideFail();
    this.state.health = 1;
    this.state.armour = Math.max(this.state.armour, 0.4);
    this.hud.setHealth(1);
    this.hud.setArmour(this.state.armour);
    this.police.setWanted(0);
    this.events.emit('mission-restarted', { index: this.index });
  }

  reset() {
    this.clearEnemies();
    this.index = 0;
    this.stage = 0;
    this.active = false;
    this.failed = false;
    this.complete = false;
    this.stealFlag = false;
    this.hud.hideFail();
    this.setHudIdle();
    this.hud.setTimer(null);
    this.hud.minimap?.setMission(null);
    this.beacon.visible = false;
  }

  progress() {
    return { index: this.index, stage: this.stage };
  }

  restore(index, stage) {
    this.activate(index, stage, true);
  }

  update(dt, ctx = {}) {
    this.elapsed += dt;
    const playerPos = ctx.playerPos ?? this.player.pos;

    if (this.marker.active) {
      this.beacon.rotation.y += dt * 0.7;
      this.beaconRing.scale.setScalar(1 + Math.sin(this.elapsed * 2.1) * 0.06);
      this.beaconDiamond.rotation.y += dt * 1.4;
      this.beaconDiamond.position.y = 2.3 + Math.sin(this.elapsed * 2.4) * 0.16;
      if (this.hud.setWaypoint) {
        const dx = this.marker.x - playerPos.x;
        const dz = this.marker.z - playerPos.z;
        const bearing = Math.atan2(dx, dz);
        const relative = shortestAngle(ctx.heading ?? this.player.yaw, bearing);
        this.hud.setWaypoint(relative, Math.hypot(dx, dz));
      }
    } else if (this.hud.setWaypoint) {
      this.hud.setWaypoint(0, 0, false);
    }

    if (!this.active) {
      this.updateEnemies(dt, playerPos);
      if (this.nextTimer > 0) {
        this.nextTimer -= dt;
        if (this.nextTimer <= 0) this.activate(this.index + 1, 0);
      }
      return;
    }

    this.updateEnemies(dt, playerPos);
    const stage = this.currentStage();
    if (!stage) return;

    if (this.stageTimer > 0) {
      this.stageTimer -= dt;
      this.hud.setTimer(this.stageTimer);
      if (this.stageTimer <= 0) {
        this.fail('Out of time.');
        return;
      }
    }

    if (stage.type === 'reach' || stage.type === 'deliver') {
      const distance = Math.hypot(playerPos.x - stage.x, playerPos.z - stage.z);
      if (distance < (stage.radius ?? 8)) {
        if (stage.needVehicle && !this.vehicle.occupied) {
          this.hud.showPromptOnce?.('GET IN A VEHICLE', 1.5);
        } else {
          this.stageComplete();
        }
      }
    } else if (stage.type === 'steal') {
      if (this.stealFlag) this.stageComplete();
    } else if (stage.type === 'kill') {
      if (this.aliveEnemies() === 0) this.stageComplete();
    } else if (stage.type === 'escape') {
      if (this.state.wanted === 0) this.stageComplete();
    }
  }

  stageShot() {
    const point = blockCenter(this.plan, 1, 4);
    this.activate(2, 0, true);
    this.index = 2;
    this.stage = 0;
    this.active = true;
    this.marker.x = point.x;
    this.marker.z = point.z;
    this.marker.active = true;
    this.beacon.position.set(point.x, this.plan.heightAt(point.x, point.z), point.z);
    this.beacon.visible = true;
    this.hud.setMission('CHAPTER II', 'THE GREEN ROOM', 'Shoot out the crew holding the park.');
    this.clearEnemies();
    for (let i = 0; i < 4; i += 1) {
      this.spawnEnemy(point.x + Math.cos(i * 1.3) * 6, point.z + Math.sin(i * 1.3) * 6);
    }
    this.updateEnemies(0, this.player.pos);
    this.hud.minimap?.setMission({ x: point.x, z: point.z, color: 0xffc759 });
    return point;
  }
}
