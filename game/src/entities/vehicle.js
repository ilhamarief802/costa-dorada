// The hero coupe: a tapered shell, tinted greenhouse, steerable front wheels and a simple
// bicycle-model arcade physics step with lateral grip, handbrake drift and suspension pitch.
import config from '../core/config.js';
import { clamp, damp, angleLerp, resolveCircleBox } from '../core/math.js';
import { glowTexture, contactShadowTexture, plateTexture } from '../core/assets.js';

const THREE = globalThis.THREE;

function taperedBox(w, h, d, topScaleX, topScaleZ, topShiftZ = 0) {
  const geometry = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    if (position.getY(i) > 0) {
      position.setX(i, position.getX(i) * topScaleX);
      position.setZ(i, position.getZ(i) * topScaleZ + topShiftZ);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

export default class Vehicle {
  constructor(plan, options = {}) {
    this.plan = plan;
    this.paint = options.paint ?? 0xb94438;
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
    this.buildModel();
    this.syncTransform();
  }

  buildModel() {
    const paint = THREE.MeshPhysicalMaterial
      ? new THREE.MeshPhysicalMaterial({ color: this.paint, roughness: 0.32, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.1 })
      : new THREE.MeshStandardMaterial({ color: this.paint, roughness: 0.28, metalness: 0.55 });
    const paintDark = new THREE.MeshStandardMaterial({ color: 0x8f2f27, roughness: 0.4, metalness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x141c22, roughness: 0.08, metalness: 0.85 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.18, metalness: 0.9 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.96 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x1c1e21, roughness: 0.55, metalness: 0.4 });
    const lens = new THREE.MeshStandardMaterial({ color: 0xfff2cf, emissive: 0xffd28a, emissiveIntensity: 0.6, roughness: 0.1 });
    const tail = new THREE.MeshStandardMaterial({ color: 0x8c1f1c, emissive: 0xff2a1c, emissiveIntensity: 0.35, roughness: 0.3 });

    this.group = new THREE.Group();
    this.group.name = 'hero-car';
    this.wheels = new THREE.Group();
    this.group.add(this.wheels);
    this.body = new THREE.Group();
    this.group.add(this.body);

    const hull = new THREE.Mesh(taperedBox(1.94, 0.52, 4.42, 0.98, 0.92, 0), paint);
    hull.position.y = 0.64;
    this.body.add(hull);

    const lowerSkirt = new THREE.Mesh(taperedBox(1.86, 0.26, 4.3, 1.02, 1.0, 0), trim);
    lowerSkirt.position.y = 0.42;
    this.body.add(lowerSkirt);

    const cabin = new THREE.Mesh(taperedBox(1.66, 0.56, 2.42, 0.8, 0.62, -0.14), glass);
    cabin.position.set(0, 1.05, -0.18);
    this.body.add(cabin);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.07, 1.32), paint);
    roof.position.set(0, 1.34, -0.28);
    this.body.add(roof);

    const hood = new THREE.Mesh(taperedBox(1.82, 0.1, 1.32, 0.92, 0.94, 0.04), paint);
    hood.position.set(0, 0.91, 1.42);
    this.body.add(hood);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.09, 1.1), paint);
    deck.position.set(0, 0.92, -1.5);
    this.body.add(deck);

    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.24, 0.2), trim);
    frontBumper.position.set(0, 0.48, 2.18);
    this.body.add(frontBumper);
    const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.24, 0.2), trim);
    rearBumper.position.set(0, 0.48, -2.18);
    this.body.add(rearBumper);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.16, 0.06), trim);
    grille.position.set(0, 0.62, 2.26);
    this.body.add(grille);

    const headlightGeometry = new THREE.BoxGeometry(0.36, 0.14, 0.07);
    for (const side of [-1, 1]) {
      const light = new THREE.Mesh(headlightGeometry, lens);
      light.position.set(side * 0.62, 0.76, 2.23);
      this.body.add(light);
      const rear = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.06), tail);
      rear.position.set(side * 0.6, 0.8, -2.22);
      this.body.add(rear);
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.12), paintDark);
      mirror.position.set(side * 1.0, 1.02, 0.66);
      this.body.add(mirror);
    }

    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.7 }));
    plate.position.set(0, 0.58, -2.29);
    plate.rotation.y = Math.PI;
    this.body.add(plate);

    const wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.27, 14);
    wheelGeometry.rotateZ(Math.PI / 2);
    const hubGeometry = new THREE.CylinderGeometry(0.17, 0.17, 0.29, 10);
    hubGeometry.rotateZ(Math.PI / 2);
    const chromeMaterial = new THREE.MeshStandardMaterial({ color: 0xc9c3b3, roughness: 0.25, metalness: 0.85 });
    this.wheelGroups = [];
    this.wheelMeshes = [];
    for (const side of [-1, 1]) {
      for (const axle of [-1, 1]) {
        const steerGroup = new THREE.Group();
        steerGroup.position.set(side * 0.86, 0.35, axle * 1.46);
        const wheel = new THREE.Mesh(wheelGeometry, rubber);
        wheel.castShadow = true;
        steerGroup.add(wheel);
        const hub = new THREE.Mesh(hubGeometry, chromeMaterial);
        steerGroup.add(hub);
        this.wheels.add(steerGroup);
        this.wheelGroups.push({ group: steerGroup, front: axle > 0 });
        this.wheelMeshes.push(wheel);
        this.wheelMeshes.push(hub);
      }
    }

    this.body.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });

    this.headlightSprites = [];
    for (const side of [-1, 1]) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture('rgba(255,235,190,0.95)', 'rgba(255,190,110,0)'),
        color: 0xffe3ac,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }));
      sprite.scale.set(1.6, 1.6, 1);
      sprite.position.set(side * 0.62, 0.76, 2.3);
      this.body.add(sprite);
      this.headlightSprites.push(sprite.material);
    }

    this.tailSprites = [];
    for (const side of [-1, 1]) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture('rgba(255,70,52,0.9)', 'rgba(180,20,12,0)'),
        color: 0xff4b33,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }));
      sprite.scale.set(1.1, 1.1, 1);
      sprite.position.set(side * 0.6, 0.8, -2.32);
      this.body.add(sprite);
      this.tailSprites.push(sprite.material);
    }

    this.spots = [];
    for (const side of [-1, 1]) {
      const spot = new THREE.SpotLight(0xffe1b0, 1.3, 52, 0.46, 0.55, 1.1);
      spot.position.set(side * 0.62, 0.78, 2.2);
      spot.target.position.set(side * 0.35, 0.1, 16);
      this.body.add(spot);
      this.body.add(spot.target);
      this.spots.push(spot);
    }

    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(3.8, 6.1),
      new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, opacity: 0.92, depthWrite: false }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.038;
    this.group.add(contact);
    this.contact = contact;

    this.wheelShadows = [];
    for (const side of [-1, 1]) {
      for (const axle of [-1, 1]) {
        const patch = new THREE.Mesh(
          new THREE.PlaneGeometry(0.95, 1.35),
          new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, opacity: 0.8, depthWrite: false }),
        );
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(side * 0.86, 0.042, axle * 1.46);
        this.group.add(patch);
        this.wheelShadows.push(patch);
      }
    }
  }

  syncTransform() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  setPeriod(period) {
    const night = period === 'night';
    for (const spot of this.spots) spot.intensity = night ? 3.4 : 0.5;
    for (const material of this.headlightSprites) material.opacity = night ? 0.85 : 0.2;
    for (const material of this.tailSprites) material.opacity = night ? 0.95 : 0.32;
  }

  distanceToPlayer(player) {
    return Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
  }

  occupy() {
    this.occupied = true;
  }

  release() {
    this.occupied = false;
    this.vx = 0;
    this.vz = 0;
    this.steer = 0;
  }

  exitPoint(out = new THREE.Vector3()) {
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    const x = this.pos.x - rightX * 1.95;
    const z = this.pos.z - rightZ * 1.95;
    return out.set(x, this.plan.heightAt(x, z), z);
  }

  update(dt, input, driving) {
    this.prev.copy(this.pos);
    this.prevYaw = this.yaw;
    const forwardX = Math.sin(this.yaw);
    const forwardZ = Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    let forwardSpeed = this.vx * forwardX + this.vz * forwardZ;
    let lateral = this.vx * rightX + this.vz * rightZ;

    let throttle = 0;
    let steerInput = 0;
    let handbrake = false;
    if (driving) {
      throttle = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);
      steerInput = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
      handbrake = input.isDown('jump');
    }

    const speedFactor = clamp(Math.abs(forwardSpeed) / config.vehicle.maxSpeed, 0, 1);
    const steerTarget = steerInput * config.vehicle.steerMax * (1 - speedFactor * 0.62);
    this.steer = damp(this.steer, steerTarget, config.vehicle.steerSpeed * 2.4, dt);

    if (throttle > 0) {
      if (forwardSpeed < -0.4) forwardSpeed += config.vehicle.brakeForce * dt;
      else forwardSpeed += config.vehicle.engineForce * dt * (1 - speedFactor * 0.82);
    } else if (throttle < 0) {
      if (forwardSpeed > 0.4) forwardSpeed -= config.vehicle.brakeForce * dt;
      else forwardSpeed -= config.vehicle.reverseForce * dt * (1 - clamp(-forwardSpeed / config.vehicle.reverseSpeed, 0, 1) * 0.85);
    } else {
      const rolling = 1.1 * dt;
      if (Math.abs(forwardSpeed) < rolling) forwardSpeed = 0;
      else forwardSpeed -= Math.sign(forwardSpeed) * rolling;
    }

    forwardSpeed -= forwardSpeed * Math.abs(forwardSpeed) * 0.0016 * dt;
    if (handbrake) forwardSpeed *= Math.exp(-1.4 * dt);
    forwardSpeed = clamp(forwardSpeed, -config.vehicle.reverseSpeed, config.vehicle.maxSpeed);

    const grip = handbrake ? config.vehicle.driftGrip : config.vehicle.grip;
    lateral *= Math.exp(-grip * dt);

    const yawRate = (forwardSpeed / config.vehicle.wheelBase) * Math.tan(this.steer) * (handbrake ? 1.3 : 1);
    this.yaw += yawRate * dt;
    this.wheelSpin += (forwardSpeed / 0.35) * dt;

    this.vx = forwardX * forwardSpeed + rightX * lateral;
    this.vz = forwardZ * forwardSpeed + rightZ * lateral;
    this.pos.x += this.vx * dt;
    this.pos.z += this.vz * dt;

    this.resolveCollisions(dt);
    const ground = this.plan.heightAt(this.pos.x, this.pos.z);
    this.airV -= 24 * dt;
    this.airY = Math.max(0, this.airY + this.airV * dt);
    if (this.airY <= 0) this.airV = 0;
    this.pos.y = damp(this.pos.y, ground + this.airY, 18, dt);
    if (this.airY <= 0.01 && Math.abs(this.pos.y - ground) > 0.4) this.pos.y = ground;

    const forwardAccel = (forwardSpeed - this.lastForward) / Math.max(dt, 0.0001);
    this.lastForward = forwardSpeed;
    this.bounceVel += (-this.bounce * 120 - this.bounceVel * 11) * dt + forwardAccel * 0.0004;
    this.bounce += this.bounceVel * dt;
    this.bounce = clamp(this.bounce, -0.08, 0.08);
    const pitchTarget = clamp(-forwardAccel * 0.0016, -0.055, 0.055);
    const rollTarget = clamp(-lateral * 0.0045 - forwardSpeed * this.steer * 0.0025, -0.06, 0.06);
    this.pitch = damp(this.pitch, pitchTarget, 8, dt);
    this.roll = damp(this.roll, rollTarget, 8, dt);

    this.animateWheels();
  }

  resolveCollisions(dt) {
    const boxes = this.plan.queryColliders(this.pos.x, this.pos.z, 3.2, this.nearest);
    let hit = false;
    for (const box of boxes) {
      if (box.kind === 'curb') continue;
      if (this.pos.y > box.maxY - 0.05) continue;
      if (this.pos.y + 0.7 < box.minY) continue;
      const resolved = resolveCircleBox(this.pos.x, this.pos.z, config.vehicle.radius, box);
      if (resolved) {
        this.pos.x = resolved.x;
        this.pos.z = resolved.z;
        hit = true;
      }
    }
    if (hit) {
      this.vx *= 0.28;
      this.vz *= 0.28;
      this.lastForward *= 0.3;
      this.collisionTimer = 0.35;
      this.bounceVel += 0.55;
    }
    this.collisionTimer = Math.max(0, this.collisionTimer - dt);
  }

  animateWheels() {
    for (let i = 0; i < this.wheelGroups.length; i += 1) {
      const entry = this.wheelGroups[i];
      entry.group.rotation.y = entry.front ? this.steer : 0;
      const mesh = this.wheelMeshes[i * 2];
      const hub = this.wheelMeshes[i * 2 + 1];
      mesh.rotation.x = this.wheelSpin;
      hub.rotation.x = this.wheelSpin;
    }
    this.body.position.y = this.bounce + Math.sin(this.wheelSpin * 1.7) * clamp(Math.abs(this.lastForward) / 40, 0, 1) * 0.012;
    this.body.rotation.x = this.pitch;
    this.body.rotation.z = this.roll;
  }

  stage(x, z, yaw) {
    this.pos.set(x, this.plan.heightAt(x, z), z);
    this.prev.copy(this.pos);
    this.yaw = yaw;
    this.prevYaw = yaw;
    this.vx = 0;
    this.vz = 0;
    this.steer = 0;
    this.lastForward = 0;
    this.bounce = 0;
    this.bounceVel = 0;
    this.pitch = 0;
    this.roll = 0;
    this.airY = 0;
    this.airV = 0;
    this.syncTransform();
    this.animateWheels();
  }

  /** Kick the coupe into the air (stunt ramp, scripted jumps). */
  launch(power) {
    this.airV = Math.max(this.airV, power);
    this.airY = Math.max(this.airY, 0.08);
  }

  get speedKmh() {
    return Math.hypot(this.vx, this.vz) * 3.6;
  }

  focus(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + 1.25, this.pos.z);
  }

  render(alpha) {
    this.group.position.lerpVectors(this.prev, this.pos, alpha);
    this.group.rotation.y = angleLerp(this.prevYaw, this.yaw, alpha);
  }
}
