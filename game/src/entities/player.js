// The protagonist on foot. A hand-built humanoid of primitives, animated from speed, with
// arcade movement (sprint, jump, crouch) and a circle-vs-AABB collision pass against the plan.
import config from '../core/config.js';
import { clamp, damp, dampAngle, angleLerp, resolveCircleBox } from '../core/math.js';
import { contactShadowTexture } from '../core/assets.js';

const THREE = globalThis.THREE;

const SKIN = 0xb47c58;
const JACKET = 0xdccaa8;
const SHIRT = 0xb8453a;
const TROUSERS = 0x2f3a46;
const SHOE = 0x1b1d20;
const HAIR = 0x241a14;

function box(w, h, d, material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

export default class Player {
  constructor(plan) {
    this.plan = plan;
    this.pos = new THREE.Vector3(plan.spawn.x, plan.heightAt(plan.spawn.x, plan.spawn.z), plan.spawn.z);
    this.prev = this.pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = plan.spawn.yaw;
    this.prevYaw = this.yaw;
    this.grounded = true;
    this.crouching = false;
    this.speed = 0;
    this.phase = 0;
    this.time = 0;
    this.visible = true;
    this.nearest = [];
    this.buildModel();
  }

  buildModel() {
    this.group = new THREE.Group();
    this.group.name = 'player';
    const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.72 });
    const jacket = new THREE.MeshStandardMaterial({ color: JACKET, roughness: 0.86 });
    const shirt = new THREE.MeshStandardMaterial({ color: SHIRT, roughness: 0.85 });
    const trousers = new THREE.MeshStandardMaterial({ color: TROUSERS, roughness: 0.92 });
    const shoe = new THREE.MeshStandardMaterial({ color: SHOE, roughness: 0.7 });
    const hair = new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.3, metalness: 0.3 });

    this.body = new THREE.Group();
    this.group.add(this.body);

    const pelvis = box(0.36, 0.24, 0.24, trousers);
    pelvis.position.y = 0.92;
    this.body.add(pelvis);

    this.torso = new THREE.Group();
    this.torso.position.y = 1.1;
    this.body.add(this.torso);
    const chest = box(0.46, 0.6, 0.27, jacket);
    chest.position.y = 0.16;
    this.torso.add(chest);
    const panel = box(0.24, 0.46, 0.03, shirt);
    panel.position.set(0, 0.14, 0.145);
    this.torso.add(panel);
    const collar = box(0.2, 0.07, 0.16, shirt);
    collar.position.set(0, 0.45, 0.02);
    this.torso.add(collar);
    const neck = box(0.1, 0.1, 0.1, skin);
    neck.position.y = 0.5;
    this.torso.add(neck);

    this.head = new THREE.Group();
    this.head.position.y = 0.63;
    this.torso.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 10), skin);
    skull.scale.set(0.92, 1.05, 0.94);
    this.head.add(skull);
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.152, 12, 8), hair);
    hairCap.scale.set(0.98, 0.72, 1.02);
    hairCap.position.set(0, 0.055, -0.012);
    this.head.add(hairCap);
    const backHair = box(0.22, 0.14, 0.1, hair);
    backHair.position.set(0, 0.01, -0.1);
    this.head.add(backHair);
    const glasses = box(0.21, 0.055, 0.035, dark);
    glasses.position.set(0, 0.015, 0.135);
    this.head.add(glasses);
    const nose = box(0.035, 0.05, 0.05, skin);
    nose.position.set(0, -0.035, 0.14);
    this.head.add(nose);

    const arm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.285, 0.34, 0);
      this.torso.add(shoulder);
      const upper = box(0.13, 0.32, 0.15, jacket);
      upper.position.y = -0.15;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.31;
      shoulder.add(elbow);
      const lower = box(0.11, 0.28, 0.12, skin);
      lower.position.y = -0.14;
      elbow.add(lower);
      const hand = box(0.1, 0.11, 0.12, skin);
      hand.position.y = -0.3;
      elbow.add(hand);
      return { shoulder, elbow };
    };
    this.armL = arm(-1);
    this.armR = arm(1);

    const leg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.135, 0.92, 0);
      this.body.add(hip);
      const thigh = box(0.175, 0.44, 0.2, trousers);
      thigh.position.y = -0.2;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);
      const shin = box(0.15, 0.4, 0.17, trousers);
      shin.position.y = -0.2;
      knee.add(shin);
      const boot = box(0.17, 0.12, 0.29, shoe);
      boot.position.set(0, -0.43, 0.05);
      knee.add(boot);
      return { hip, knee };
    };
    this.legL = leg(-1);
    this.legR = leg(1);

    this.torso.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    this.body.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });

    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(1.35, 1.35),
      new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, opacity: 0.5, depthWrite: false }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.03;
    this.group.add(contact);

    this.syncTransform();
  }

  syncTransform() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
  }

  reset() {
    this.pos.set(this.plan.spawn.x, this.plan.heightAt(this.plan.spawn.x, this.plan.spawn.z), this.plan.spawn.z);
    this.prev.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.yaw = this.plan.spawn.yaw;
    this.prevYaw = this.yaw;
    this.grounded = true;
    this.crouching = false;
    this.phase = 0;
    this.syncTransform();
  }

  setVisible(visible) {
    this.visible = visible;
    this.group.visible = visible;
  }

  focus(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + (this.crouching ? 1.02 : 1.46), this.pos.z);
  }

  update(dt, input, cameraYaw) {
    this.prev.copy(this.pos);
    this.prevYaw = this.yaw;
    this.time += dt;

    const axis = input.axis();
    const wishX = Math.sin(cameraYaw) * axis.z + Math.cos(cameraYaw) * axis.x;
    const wishZ = Math.cos(cameraYaw) * axis.z - Math.sin(cameraYaw) * axis.x;
    const wishLength = Math.hypot(wishX, wishZ);
    const sprinting = input.isDown('sprint') && !input.isDown('crouch');
    const targetSpeed = input.isDown('crouch') ? config.player.crouchSpeed : sprinting ? config.player.runSpeed : config.player.walkSpeed;
    this.crouching = input.isDown('crouch') && this.grounded;

    const accel = this.grounded ? config.player.accel : config.player.airAccel;
    const targetX = wishLength > 0 ? (wishX / wishLength) * targetSpeed : 0;
    const targetZ = wishLength > 0 ? (wishZ / wishLength) * targetSpeed : 0;
    this.vel.x = damp(this.vel.x, targetX, accel, dt);
    this.vel.z = damp(this.vel.z, targetZ, accel, dt);

    if (this.grounded && input.consume('jump')) {
      this.vel.y = config.player.jumpSpeed;
      this.grounded = false;
    }
    this.vel.y -= config.player.gravity * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.resolveCollisions();

    this.pos.y += this.vel.y * dt;
    const ground = this.plan.heightAt(this.pos.x, this.pos.z);
    if (this.grounded && this.pos.y < ground && ground - this.pos.y <= config.player.stepHeight) {
      this.pos.y = ground;
    }
    if (this.pos.y <= ground) {
      if (this.vel.y < -9) this.vel.y = 0;
      else this.vel.y = 0;
      this.pos.y = ground;
      this.grounded = true;
    } else if (this.pos.y > ground + 0.06) {
      this.grounded = false;
    }

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.speed > 0.4) {
      const desired = Math.atan2(this.vel.x, this.vel.z);
      this.yaw = dampAngle(this.yaw, desired, 14, dt);
    }
    this.animate(dt);
  }

  resolveCollisions() {
    const boxes = this.plan.queryColliders(this.pos.x, this.pos.z, 1.2, this.nearest);
    for (const box of boxes) {
      if (box.kind === 'curb') continue;
      if (this.pos.y + 0.05 >= box.maxY) continue;
      if (this.pos.y + config.player.height <= box.minY) continue;
      const resolved = resolveCircleBox(this.pos.x, this.pos.z, config.player.radius, box);
      if (resolved) {
        this.pos.x = resolved.x;
        this.pos.z = resolved.z;
      }
    }
  }

  animate(dt) {
    const runFactor = clamp(this.speed / config.player.runSpeed, 0, 1);
    const moving = this.speed > 0.25;
    if (moving) this.phase += dt * (6.2 + this.speed * 1.1);
    const swing = Math.sin(this.phase);
    const stride = (0.35 + runFactor * 0.42) * clamp(this.speed / 3.2, 0, 1);
    const lean = runFactor * 0.13;
    const crouch = this.crouching ? 1 : 0;

    const targetHipL = this.grounded ? swing * stride : -0.35;
    const targetHipR = this.grounded ? -swing * stride : 0.25;
    const targetKneeL = this.grounded ? Math.max(0, -swing) * stride * 1.7 : 0.75;
    const targetKneeR = this.grounded ? Math.max(0, swing) * stride * 1.7 : 0.35;
    this.legL.hip.rotation.x = damp(this.legL.hip.rotation.x, targetHipL, 18, dt);
    this.legR.hip.rotation.x = damp(this.legR.hip.rotation.x, targetHipR, 18, dt);
    this.legL.knee.rotation.x = damp(this.legL.knee.rotation.x, targetKneeL, 18, dt);
    this.legR.knee.rotation.x = damp(this.legR.knee.rotation.x, targetKneeR, 18, dt);

    const armSwing = moving ? swing * (0.4 + runFactor * 0.55) : Math.sin(this.time * 1.6) * 0.04;
    this.armL.shoulder.rotation.x = damp(this.armL.shoulder.rotation.x, -armSwing, 16, dt);
    this.armR.shoulder.rotation.x = damp(this.armR.shoulder.rotation.x, armSwing, 16, dt);
    this.armL.elbow.rotation.x = damp(this.armL.elbow.rotation.x, 0.18 + runFactor * 0.5, 12, dt);
    this.armR.elbow.rotation.x = damp(this.armR.elbow.rotation.x, 0.18 + runFactor * 0.5, 12, dt);
    this.armL.shoulder.rotation.z = 0.06;
    this.armR.shoulder.rotation.z = -0.06;

    const bob = moving ? Math.abs(Math.sin(this.phase)) * 0.035 * (0.4 + runFactor) : Math.sin(this.time * 1.7) * 0.008;
    const crouchDrop = crouch * 0.3;
    this.body.position.y = bob - crouchDrop;
    this.body.rotation.x = lean * 0.5 + crouch * 0.2;
    this.torso.rotation.x = lean + crouch * 0.3;
    this.head.rotation.x = -lean * 0.7 - crouch * 0.2;
    if (crouch) {
      this.legL.hip.rotation.x = damp(this.legL.hip.rotation.x, 0.8, 14, dt);
      this.legR.hip.rotation.x = damp(this.legR.hip.rotation.x, 0.55, 14, dt);
      this.legL.knee.rotation.x = damp(this.legL.knee.rotation.x, -1.25, 14, dt);
      this.legR.knee.rotation.x = damp(this.legR.knee.rotation.x, -1.05, 14, dt);
      this.armL.shoulder.rotation.x = damp(this.armL.shoulder.rotation.x, -0.35, 12, dt);
      this.armR.shoulder.rotation.x = damp(this.armR.shoulder.rotation.x, -0.25, 12, dt);
    }
  }

  stage(x, z, yaw, crouch = false) {
    this.pos.set(x, this.plan.heightAt(x, z), z);
    this.prev.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.prevYaw = yaw;
    this.grounded = true;
    this.crouching = crouch;
    this.speed = 0;
    this.syncTransform();
    this.animate(1 / 60);
  }

  render(alpha) {
    this.group.position.lerpVectors(this.prev, this.pos, alpha);
    this.group.rotation.y = angleLerp(this.prevYaw, this.yaw, alpha);
  }
}
