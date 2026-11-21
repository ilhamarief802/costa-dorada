// Side activities: a taxi rank, a street race against three AI cars, and a stunt ramp that pays
// for airtime. Each is started from a glowing marker in the world with F, then runs its own
// objective, timer and payout on the HUD.
import config from '../core/config.js';
import Rng from '../core/rng.js';
import { contactShadowTexture } from '../core/assets.js';

const THREE = globalThis.THREE;

function ring(color) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false });
  const outer = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.1, 8, 28), material);
  outer.rotation.x = -Math.PI / 2;
  const inner = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.06, 6, 22), material);
  inner.rotation.x = -Math.PI / 2;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.3, 12, 10, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  beam.position.y = 6;
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), new THREE.MeshBasicMaterial({ color: 0xfff2cc, toneMapped: false }));
  diamond.position.y = 1.9;
  group.add(outer, inner, beam, diamond);
  group.userData.diamond = diamond;
  group.userData.ring = outer;
  return group;
}

function buildRacePath(plan) {
  const xs = plan.roads.x;
  const zs = plan.roads.z;
  const points = [
    [xs[5] + 3.2, zs[7] - 3.2], [xs[5] + 3.2, zs[1] - 3.2], [xs[3] + 3.2, zs[1] - 3.2],
    [xs[3] + 3.2, zs[3] - 3.2], [xs[2] + 3.2, zs[3] - 3.2], [xs[2] + 3.2, zs[1] - 3.2],
    [xs[1] + 3.2, zs[1] - 3.2], [xs[1] + 3.2, zs[5] - 3.2], [xs[4] + 3.2, zs[5] - 3.2],
    [xs[4] + 3.2, zs[7] - 3.2],
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
  return { x: path.points[0][0], z: path.points[0][1], heading: 0 };
}

export default class Activities {
  constructor({ plan, scene, player, vehicle, hud, events, state, seed }) {
    this.plan = plan;
    this.scene = scene;
    this.player = player;
    this.vehicle = vehicle;
    this.hud = hud;
    this.events = events;
    this.state = state;
    this.rng = new Rng((seed ^ 0x4ad17c3b) >>> 0);
    this.group = new THREE.Group();
    this.group.name = 'activities';
    scene.add(this.group);
    this.active = null;
    this.raceCars = [];
    this.elapsed = 0;
    this.buildMarkers();
    this.buildRamp();
    this.racePath = buildRacePath(plan);
  }

  buildMarkers() {
    this.markers = [
      { kind: 'taxi', x: 62, z: 338.4, color: 0xf0b93f, label: 'TAXI RANK' },
      { kind: 'race', x: 0, z: 329, color: 0xe0543f, label: 'STREET RACE' },
      { kind: 'stunt', x: 172, z: 338.2, color: 0x58b8c6, label: 'STUNT JUMP' },
    ];
    for (const marker of this.markers) {
      const group = ring(marker.color);
      const y = this.plan.heightAt(marker.x, marker.z);
      group.position.set(marker.x, y + 0.06, marker.z);
      this.group.add(group);
      marker.group = group;
      marker.y = y;
      marker.phase = this.rng.float(0, 6.28);
    }
  }

  buildRamp() {
    const group = new THREE.Group();
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(9.5, 0.45, 5.4),
      new THREE.MeshStandardMaterial({ color: 0x9a938a, roughness: 0.85 }),
    );
    deck.position.y = 0.62;
    deck.rotation.z = -0.2;
    deck.castShadow = true;
    deck.receiveShadow = true;
    const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xe0b23c, roughness: 0.7 });
    for (let i = 0; i < 4; i += 1) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 5.3), stripeMaterial);
      stripe.position.set(-3.4 + i * 2.1, 1.35 - i * 0.15, 0);
      stripe.rotation.z = -0.2;
      group.add(stripe);
    }
    group.add(deck);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(10.4, 6.2),
      new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, opacity: 0.5, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    group.add(shadow);
    const y = this.plan.heightAt(172, 338.2);
    group.position.set(172, y, 338.2);
    this.group.add(group);
    this.ramp = group;
  }

  nearestMarker(pos, maxDistance = 4.2) {
    let best = null;
    let bestDistance = maxDistance;
    for (const marker of this.markers) {
      const distance = Math.hypot(pos.x - marker.x, pos.z - marker.z);
      if (distance < bestDistance) { bestDistance = distance; best = marker; }
    }
    return best;
  }

  start(kind) {
    if (this.active) return false;
    if (kind === 'taxi') {
      const dest = { x: -188, z: -94 };
      this.active = { kind, title: 'TAXI FARE', objective: 'Pick up the fare, then drive to the drop-off.', dest, timer: 100, phase: 'drive' };
      this.hud.setActivity('TAXI FARE', 'Drive the passenger to the drop-off.');
    } else if (kind === 'race') {
      const checkpoints = [];
      for (let i = 1; i <= 6; i += 1) checkpoints.push(samplePath(this.racePath, (this.racePath.total * i) / 6));
      this.active = { kind, title: 'STREET RACE', checkpoint: 0, checkpoints, timer: 150, finished: false };
      this.spawnRaceCars();
      this.hud.setActivity('STREET RACE', 'Hit checkpoint 1 of 6. Beat the pack.');
      this.hud.minimap?.setActivity({ x: checkpoints[0].x, z: checkpoints[0].z, color: 0xe0543f });
    } else if (kind === 'stunt') {
      this.active = { kind, title: 'STUNT JUMP', timer: 70, armed: true };
      this.hud.setActivity('STUNT JUMP', 'Hit the ramp at speed. Cash for air.');
    }
    this.hud.setActivityTimer(this.active.timer);
    this.events.emit('activity-started', { kind });
    return true;
  }

  spawnRaceCars() {
    this.raceCars.length = 0;
    const colors = [0xd94b3a, 0x3f7a9e, 0xe0b24a];
    for (let i = 0; i < 3; i += 1) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.56, 4.2), new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.35, metalness: 0.4 }));
      body.position.y = 0.58;
      body.castShadow = true;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.48, 1.9), new THREE.MeshStandardMaterial({ color: 0x151c22, roughness: 0.2, metalness: 0.5 }));
      cabin.position.set(0, 1.05, -0.1);
      group.add(body, cabin);
      this.group.add(group);
      this.raceCars.push({
        group,
        s: i === 0 ? 0 : this.racePath.total - i * 6,
        speed: 15.5 + i * 0.55,
        yaw: 0,
        lap: 0,
      });
    }
  }

  updateRace(dt) {
    const activity = this.active;
    if (!activity || activity.kind !== 'race') return;
    for (const car of this.raceCars) {
      const previous = car.s;
      car.s = (car.s + car.speed * dt) % this.racePath.total;
      if (car.s < previous) car.lap += 1;
      const point = samplePath(this.racePath, car.s);
      car.group.position.set(point.x, this.plan.heightAt(point.x, point.z), point.z);
      car.group.rotation.y = point.heading;
    }
    if (this.raceCars.some((car) => car.lap >= 1)) {
      this.finishRace(false);
      return;
    }
    if (!this.vehicle.occupied) return;
    const playerPos = this.vehicle.pos;
    const target = activity.checkpoints[activity.checkpoint];
    if (target && Math.hypot(playerPos.x - target.x, playerPos.z - target.z) < 11) {
      activity.checkpoint += 1;
      if (activity.checkpoint >= activity.checkpoints.length) {
        this.finishRace(true);
      } else {
        const next = activity.checkpoints[activity.checkpoint];
        this.hud.setActivity('STREET RACE', `Checkpoint ${activity.checkpoint + 1} of ${activity.checkpoints.length}.`);
        this.hud.minimap?.setActivity({ x: next.x, z: next.z, color: 0xe0543f });
      }
    }
  }

  finishRace(won) {
    const activity = this.active;
    if (!activity) return;
    if (won) {
      this.state.money += 900;
      this.hud.setMoney(this.state.money);
      this.hud.spawnMessage('RACE WON  +$900', '#ffd77a');
      this.events.emit('activity-complete', { kind: 'race', reward: 900 });
    } else {
      this.hud.spawnMessage('RACE LOST', '#e0836e');
    }
    this.end();
  }

  updateTaxi(dt) {
    const activity = this.active;
    if (!activity || activity.kind !== 'taxi') return;
    const playerPos = this.vehicle.occupied ? this.vehicle.pos : this.player.pos;
    if (this.vehicle.occupied) {
      const distance = Math.hypot(playerPos.x - activity.dest.x, playerPos.z - activity.dest.z);
      if (distance < 9) {
        const bonus = Math.round(Math.max(0, activity.timer) * 3.5);
        const reward = 260 + bonus;
        this.state.money += reward;
        this.hud.setMoney(this.state.money);
        this.hud.spawnMessage(`FARE PAID  +$${reward}`, '#ffd77a');
        this.events.emit('activity-complete', { kind: 'taxi', reward });
        this.end();
      }
    }
  }

  updateStunt() {
    const activity = this.active;
    if (!activity || activity.kind !== 'stunt' || !this.vehicle.occupied) return;
    const distance = Math.hypot(this.vehicle.pos.x - 172, this.vehicle.pos.z - 338.2);
    if (distance < 5.6 && this.vehicle.speedKmh > 26) {
      activity.armed = false;
      this.state.money += 500;
      this.hud.setMoney(this.state.money);
      this.hud.spawnMessage('STUNT JUMP  +$500', '#8ad8e4');
      this.events.emit('stunt-jump', { speed: this.vehicle.speedKmh });
      if (typeof this.vehicle.launch === 'function') this.vehicle.launch(8.5);
      this.end();
    }
  }

  end() {
    this.active = null;
    this.hud.setActivity(null);
    this.hud.setActivityTimer(null);
    this.hud.minimap?.setActivity(null);
    for (const car of this.raceCars) this.group.remove(car.group);
    this.raceCars.length = 0;
  }

  update(dt) {
    this.elapsed += dt;
    for (const marker of this.markers) {
      marker.phase += dt;
      const d = marker.group.userData.diamond;
      if (d) {
        d.rotation.y += dt * 1.5;
        d.position.y = 1.9 + Math.sin(marker.phase * 2) * 0.12;
      }
      const r = marker.group.userData.ring;
      if (r) r.scale.setScalar(1 + Math.sin(marker.phase * 1.7) * 0.05);
    }

    if (!this.active) {
      if (this.hud.setActivityTimer) this.hud.setActivityTimer(null);
      return;
    }
    this.active.timer -= dt;
    this.hud.setActivityTimer(Math.max(0, this.active.timer));
    if (this.active.timer <= 0) {
      if (this.active.kind === 'race') this.finishRace(false);
      else {
        this.hud.spawnMessage('ACTIVITY FAILED', '#e0836e');
        this.end();
      }
      return;
    }
    if (this.active.kind === 'race') this.updateRace(dt);
    else if (this.active.kind === 'taxi') this.updateTaxi(dt);
    else if (this.active.kind === 'stunt') this.updateStunt();
  }

  prompt(pos) {
    if (this.active) return null;
    const marker = this.nearestMarker(pos);
    if (!marker) return null;
    return { text: `START ${marker.label}`, key: 'F', kind: marker.kind };
  }
}
