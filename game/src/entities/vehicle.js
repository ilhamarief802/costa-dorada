// The hero coupe. The shell comes from the shared car kit (a lofted, rounded body with a real
// bonnet, glass house, arches and chrome), and this class owns the driving model: a bicycle
// approximation with lateral grip, handbrake drift, suspension pitch and wheel spin. It also
// carries the pieces every car in the game needs — contact shadow, lit tail lamps and a soft
// headlight spill on the road.
import config from '../core/config.js';
import { clamp, damp } from '../core/math.js';
import { buildCar, buildWheel } from './carkit.js';
import { contactShadowTexture, glowTexture, plateTexture, headlightConeTexture } from '../core/assets.js';

const THREE = globalThis.THREE;

export default class Vehicle {
  constructor(plan, options = {}) {
    this.plan = plan;
    this.paint = options.paint ?? 0xc03028;
    this.kind = options.kind ?? 'coupe';
    this.pos = new THREE.Vector3(plan.heroCar.x, plan.heightAt(plan.heroCar.x, plan.heroCar.z), plan.heroCar.z);
    this.prev = this.pos.clone();
    this.yaw = plan.heroCar.yaw;
    this.prevYaw = this.yaw;
    this.vx = 0;
    this.vz = 0;
    this.steer = 0;
    this.wheelSpin = 0;
    this.occupied = false;
    this.bounce = 0;
    this.bounceVel = 0;
    this.pitch = 0;
    this.roll = 0;
    this.lastForward = 0;
    this.collisionTimer = 0;
    this.airY = 0;
    this.airV = 0;
    this.nearest = [];
    this.speedKmh = 0;
    this.night = false;
    this.braking = false;
    this.buildModel();
    this.syncTransform();
  }

  buildModel() {
    const kit = buildCar(this.kind);
    this.spec = kit.spec;

    const paint = THREE.MeshPhysicalMaterial
      ? new THREE.MeshPhysicalMaterial({
        color: this.paint, roughness: 0.28, metalness: 0.62, clearcoat: 1, clearcoatRoughness: 0.06,
        envMapIntensity: 1.15,
      })
      : new THREE.MeshStandardMaterial({ color: this.paint, roughness: 0.26, metalness: 0.55 });
    paint.envMap = null;
    const trim = new THREE.MeshPhysicalMaterial({
      color: 0x1b1f24, roughness: 0.22, metalness: 0.86, clearcoat: 0.7, clearcoatRoughness: 0.14,
      envMapIntensity: 1.4,
    });
    this.paintMaterial = paint;

    this.group = new THREE.Group();
    this.group.name = 'hero-car';
    this.body = new THREE.Group();
    this.group.add(this.body);

    const shell = new THREE.Mesh(kit.paint, paint);
    shell.castShadow = true;
    shell.receiveShadow = true;
    this.body.add(shell);

    const glassAndTrim = new THREE.Mesh(kit.trim, trim);
    glassAndTrim.castShadow = true;
    this.body.add(glassAndTrim);

    // Lamp cards: emissive quads on the nose and tail so the car reads as switched on.
    const headMaterial = new THREE.MeshBasicMaterial({ color: 0xfff4d8, toneMapped: false });
    const tailMaterial = new THREE.MeshBasicMaterial({ color: 0xff2a18, toneMapped: false });
    this.tailMaterial = tailMaterial;
    this.headLamps = [];
    this.tailLamps = [];
    const lampY = this.spec.lampY + 0.08;
    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.03), headMaterial);
      head.position.set(side * 0.62, lampY, this.spec.nose + 0.005);
      this.body.add(head);
      this.headLamps.push(head);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.03), tailMaterial);
      tail.position.set(side * 0.6, lampY + 0.06, this.spec.tail - 0.005);
      this.body.add(tail);
      this.tailLamps.push(tail);
    }

    // Number plate.
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.15),
      new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.7 }),
    );
    plate.position.set(0, lampY - 0.16, this.spec.tail - 0.06);
    plate.rotation.y = Math.PI;
    this.body.add(plate);

    // Wheels.
    const wheelGeometry = buildWheel(this.spec.wheelRadius, 0.26);
    const rubber = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.95, metalness: 0.05 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc8c2b2, roughness: 0.2, metalness: 0.95 });
    this.wheelGroups = [];
    for (const station of kit.wheels) {
      for (const side of [-1, 1]) {
        const steerGroup = new THREE.Group();
        steerGroup.position.set(side * station.x, this.spec.wheelRadius, station.z);
        const tyre = new THREE.Mesh(wheelGeometry, rubber);
        tyre.castShadow = true;
        steerGroup.add(tyre);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(this.spec.wheelRadius * 0.66, this.spec.wheelRadius * 0.66, 0.28, 12), chrome);
        hub.rotation.z = Math.PI / 2;
        steerGroup.add(hub);
        this.body.add(steerGroup);
        this.wheelGroups.push({ group: steerGroup, front: station.z > 0 });
      }
    }

    // Contact shadow: a long soft blob plus two tight pads under the axles.
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(2.9, 5.3),
      new THREE.MeshBasicMaterial({
        map: contactShadowTexture(), transparent: true, opacity: 0.72, depthWrite: false, color: 0x000000,
      }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.045;
    contact.renderOrder = 2;
    this.group.add(contact);
    this.contact = contact;

    // Headlight spill: two soft cones of light laid on the road ahead.
    this.spill = [];
    const spillMaterial = new THREE.MeshBasicMaterial({
      map: headlightConeTexture(), transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, color: 0xffd9a0,
    });
    this.spillMaterial = spillMaterial;
    for (const side of [-1, 1]) {
      const cone = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 9), spillMaterial);
      cone.rotation.x = -Math.PI / 2;
      cone.position.set(side * 0.6, 0.06, this.spec.nose + 4.2);
      cone.renderOrder = 3;
      this.group.add(cone);
      this.spill.push(cone);
    }

    // Headlamp halos, only switched on at night.
    this.haloMaterial = new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,246,214,0.95)', 'rgba(255,196,110,0)'),
      color: 0xffe6b8, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.halos = [];
    for (const side of [-1, 1]) {
      const halo = new THREE.Sprite(this.haloMaterial);
      halo.scale.set(1.5, 1.5, 1);
      halo.position.set(side * 0.62, lampY, this.spec.nose + 0.12);
      this.group.add(halo);
      this.halos.push(halo);
    }
  }

  setPeriod(period) {
    this.night = period === 'night';
    this.spillMaterial.opacity = this.night ? 0.5 : 0;
    this.haloMaterial.opacity = this.night ? 0.85 : 0;
  }

  focus(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + 1.15, this.pos.z);
  }

  distanceToPlayer(player) {
    return Math.hypot(this.pos.x - player.pos.x, this.pos.z - player.pos.z);
  }

  stage(x, z, yaw) {
    this.pos.set(x, this.plan.heightAt(x, z), z);
    this.prev.copy(this.pos);
    this.yaw = yaw;
    this.prevYaw = yaw;
    this.vx = 0;
    this.vz = 0;
    this.steer = 0;
    this.airY = 0;
    this.airV = 0;
    this.speedKmh = 0;
    this.bounce = 0;
    this.bounceVel = 0;
    this.pitch = 0;
    this.roll = 0;
    this.syncTransform();
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  occupy() { this.occupied = true; }

  /** Settle the body for a still frame: no interpolation, wheels on the ground, level trim. */
  setHeadingForShot() {
    this.prev.copy(this.pos);
    this.prevYaw = this.yaw;
    this.pitch = 0;
    this.roll = 0;
    this.bounce = 0;
    this.bounceVel = 0;
    this.airY = 0;
    this.airV = 0;
    this.syncTransform();
    this.group.updateMatrixWorld(true);
  }

  /**
   * Where the driver steps out: 1.9 m out along the car's left flank. Local -X is the left side,
   * so the world offset is (-cos(yaw), +sin(yaw)) — the same basis the headlights use.
   */
  exitPoint(out = new THREE.Vector3()) {
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    const x = this.pos.x - cos * 1.9;
    const z = this.pos.z + sin * 1.9;
    return out.set(x, this.plan.heightAt(x, z) + 0.02, z);
  }

  release() {
    this.occupied = false;
    this.speedKmh = 0;
  }

  launch(power = 8) {
    this.airV = power;
    this.airY = 0.05;
  }

  /** One driving step. `driven` false means the car is parked: it still settles, never moves. */
  update(dt, input, driven) {
    this.prev.copy(this.pos);
    this.prevYaw = this.yaw;

    const spec = config.vehicle;
    let throttle = 0;
    let brake = 0;
    let steerInput = 0;
    if (driven && input) {
      throttle = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);
      brake = input.isDown('sprint') ? 1 : 0;
      steerInput = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    }

    // Forward speed in the body frame.
    const forwardX = Math.sin(this.yaw);
    const forwardZ = Math.cos(this.yaw);
    let forward = this.vx * forwardX + this.vz * forwardZ;
    const lateralX = forwardZ;
    const lateralZ = -forwardX;
    let lateral = this.vx * lateralX + this.vz * lateralZ;

    const maxSpeed = brake ? Math.max(2, spec.maxSpeed * 0.32) : spec.maxSpeed;
    if (throttle > 0) forward += spec.engineForce * throttle * dt;
    if (throttle < 0) forward += (forward > 0.5 ? -spec.brakeForce : spec.reverseForce * throttle) * dt;
    if (brake) forward -= Math.sign(forward) * spec.brakeForce * 0.75 * dt;
    forward -= forward * spec.drag * dt;
    forward = clamp(forward, -spec.reverseSpeed, maxSpeed);

    // Steering: rear wheels track a circle, the yaw rate follows the speed.
    this.steer = damp(this.steer, steerInput * spec.steerMax, spec.steerSpeed * 3, dt);
    const grip = brake ? spec.driftGrip : spec.grip;
    if (Math.abs(forward) > 0.3) {
      const yawRate = (forward / spec.wheelBase) * Math.tan(this.steer);
      this.yaw += yawRate * dt;
    }
    lateral *= Math.exp(-grip * dt);

    const newForwardX = Math.sin(this.yaw);
    const newForwardZ = Math.cos(this.yaw);
    const newLateralX = newForwardZ;
    const newLateralZ = -newForwardX;
    this.vx = newForwardX * forward + newLateralX * lateral;
    this.vz = newForwardZ * forward + newLateralZ * lateral;

    let nextX = this.pos.x + this.vx * dt;
    let nextZ = this.pos.z + this.vz * dt;

    // Building collision: push out and scrub the speed.
    for (const box of this.plan.queryColliders(nextX, nextZ, spec.radius + 1.6, this.nearest)) {
      if (box.kind !== 'building' && box.kind !== 'pillar' && box.kind !== 'prop') continue;
      const resolved = this.resolveBox(nextX, nextZ, spec.radius, box);
      if (resolved) {
        nextX = resolved.x;
        nextZ = resolved.z;
        this.vx *= 0.25;
        this.vz *= 0.25;
        forward *= 0.2;
        this.collisionTimer = 0.4;
      }
    }

    const curb = this.stepCurb(nextX, nextZ);
    if (curb) {
      nextX = curb.x;
      nextZ = curb.z;
    }

    this.pos.x = nextX;
    this.pos.z = nextZ;
    this.pos.y = this.plan.heightAt(this.pos.x, this.pos.z);

    // Airborne arc from launch pads and kerbs.
    if (this.airY > 0 || this.airV !== 0) {
      this.airV -= spec.gravity * dt * 0.6;
      this.airY += this.airV * dt;
      if (this.airY <= 0) {
        this.airY = 0;
        this.airV = 0;
        this.bounceVel = -3.2;
      }
    }
    // Suspension bounce spring.
    this.bounceVel += -this.bounce * 42 * dt - this.bounceVel * 7 * dt;
    this.bounce += this.bounceVel * dt;

    // Body attitude: nose lifts under power, squats under braking, rolls into the turn.
    const accel = (forward - this.lastForward) / Math.max(dt, 0.0001);
    this.lastForward = forward;
    this.pitch = damp(this.pitch, clamp(-accel * 0.006, -0.06, 0.06), 5, dt);
    this.roll = damp(this.roll, clamp(-this.steer * forward * 0.0022, -0.055, 0.055), 6, dt);
    this.braking = Boolean(brake || (throttle < 0 && forward > 0.4));

    this.wheelSpin += (forward / this.spec.wheelRadius) * dt;
    this.speedKmh = Math.abs(forward) * 3.6;
    this.syncTransform();
  }

  resolveBox(x, z, radius, box) {
    const closestX = clamp(x, box.minX, box.maxX);
    const closestZ = clamp(z, box.minZ, box.maxZ);
    const dx = x - closestX;
    const dz = z - closestZ;
    const distance = Math.hypot(dx, dz);
    if (distance > radius) return null;
    if (distance > 1e-4) {
      const push = (radius - distance) / distance;
      return { x: x + dx * push, z: z + dz * push };
    }
    return { x: box.maxX + radius, z };
  }

  /** Kerbs are low enough to mount but not to drive through cleanly. */
  stepCurb(x, z) {
    for (const box of this.plan.queryColliders(x, z, 1.4, [])) {
      if (box.kind !== 'curb') continue;
      if (x > box.minX - 1 && x < box.maxX + 1 && z > box.minZ - 1 && z < box.maxZ + 1) {
        this.bounceVel += 1.4;
      }
    }
    return null;
  }

  syncTransform() {
    this.group.position.set(this.pos.x, this.pos.y + this.airY, this.pos.z);
    this.group.rotation.y = this.yaw;
    this.body.position.y = this.bounce * 0.05;
    this.body.rotation.x = this.pitch;
    this.body.rotation.z = this.roll - (this.bounce * 0.02);
    for (const wheel of this.wheelGroups) {
      wheel.group.rotation.y = wheel.front ? this.steer * 0.8 : 0;
      wheel.group.children[0].rotation.x = -this.wheelSpin;
      wheel.group.children[1].rotation.x = -this.wheelSpin;
    }
    if (this.tailMaterial) {
      const glow = this.night ? (this.braking ? 1 : 0.72) : 0.34;
      this.tailMaterial.color.setRGB(0.55 * glow + 0.2, 0.03, 0.02);
    }
  }

  /** Interpolated pose for rendering between two fixed steps. */
  render(alpha) {
    const x = this.prev.x + (this.pos.x - this.prev.x) * alpha;
    const z = this.prev.z + (this.pos.z - this.prev.z) * alpha;
    let delta = this.yaw - this.prevYaw;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    this.group.position.set(x, this.pos.y + this.airY, z);
    this.group.rotation.y = this.prevYaw + delta * alpha;
    for (const wheel of this.wheelGroups) {
      wheel.group.children[0].rotation.x = -this.wheelSpin;
      wheel.group.children[1].rotation.x = -this.wheelSpin;
    }
  }
}
