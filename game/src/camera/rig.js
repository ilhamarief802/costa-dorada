// Third-person camera. Over-the-shoulder on foot, a wider chase when driving, both driven by
// mouse look, critically damped, and pulled in when a building sits between the eye and the
// player. The shot camera bypasses all of it.
import config from '../core/config.js';
import { clamp, damp, dampAngle, rayBox } from '../core/math.js';

const THREE = globalThis.THREE;

export default class CameraRig {
  constructor(camera, plan, input) {
    this.camera = camera;
    this.plan = plan;
    this.input = input;
    this.yaw = plan.spawn.yaw;
    this.pitch = -0.06;
    this.position = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.rayDirection = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.mode = 'foot';
    this.orbitTimer = 0;
    this.initialised = false;
  }

  snap(mode, player, vehicle) {
    this.mode = mode;
    const target = mode === 'car' ? vehicle.focus(this.target) : player.focus(this.target);
    if (mode === 'car') this.yaw = vehicle.yaw;
    this.direction.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    const distance = mode === 'car' ? config.camera.carDistance : config.camera.distance;
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.position.copy(target).addScaledVector(this.direction, -distance);
    if (mode === 'foot') this.position.addScaledVector(this.right, config.camera.shoulder);
    this.look.copy(target);
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.look);
    this.initialised = true;
  }

  update(dt, mode, player, vehicle) {
    this.mode = mode;
    const look = this.input.consumeLook();
    const sensitivity = config.camera.sensitivity;
    this.yaw -= look.x * sensitivity;
    this.pitch -= look.y * sensitivity;
    this.pitch = clamp(this.pitch, config.camera.pitchMin, config.camera.pitchMax);
    if (Math.abs(look.x) + Math.abs(look.y) > 0.5) this.orbitTimer = 0.8;
    this.orbitTimer = Math.max(0, this.orbitTimer - dt);

    const driving = mode === 'car';
    if (driving && this.orbitTimer <= 0) {
      this.yaw = dampAngle(this.yaw, vehicle.yaw, 2.4, dt);
      this.pitch = damp(this.pitch, -0.09, 1.6, dt);
    }

    const target = driving ? vehicle.focus(this.target) : player.focus(this.target);
    const distance = driving ? config.camera.carDistance : config.camera.distance;
    const shoulder = driving ? 0 : config.camera.shoulder;
    this.direction.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    this.desired.copy(target).addScaledVector(this.direction, -distance).addScaledVector(this.right, shoulder);
    this.desired.y += driving ? 0.55 : 0.15;

    this.pullIn(target);

    const ground = this.plan.heightAt(this.desired.x, this.desired.z);
    if (this.desired.y < ground + 0.42) this.desired.y = ground + 0.42;

    if (!this.initialised) {
      this.position.copy(this.desired);
      this.look.copy(target);
      this.initialised = true;
    }
    const positionLambda = driving ? 6.5 : config.camera.spring;
    this.position.x = damp(this.position.x, this.desired.x, positionLambda, dt);
    this.position.y = damp(this.position.y, this.desired.y, positionLambda * 0.9, dt);
    this.position.z = damp(this.position.z, this.desired.z, positionLambda, dt);

    this.look.x = damp(this.look.x, target.x + this.right.x * shoulder * 0.4, config.camera.lookSpring, dt);
    this.look.y = damp(this.look.y, target.y + 0.06, config.camera.lookSpring * 0.8, dt);
    this.look.z = damp(this.look.z, target.z + this.right.z * shoulder * 0.4, config.camera.lookSpring, dt);

    this.camera.position.copy(this.position);
    this.camera.lookAt(this.look);

    const targetFov = driving ? config.camera.carFov : config.render.fov;
    this.camera.fov = damp(this.camera.fov, targetFov, 4, dt);
    this.camera.updateProjectionMatrix();
  }

  pullIn(target) {
    this.rayDirection.copy(this.desired).sub(target);
    const maxDistance = this.rayDirection.length();
    if (maxDistance < 0.01) return;
    this.rayDirection.multiplyScalar(1 / maxDistance);
    let nearest = maxDistance;
    const colliders = this.plan.colliders;
    for (let i = 0; i < colliders.length; i += 1) {
      const box = colliders[i];
      if (box.kind !== 'building' && box.kind !== 'pillar') continue;
      const hit = rayBox(target, this.rayDirection, box, nearest);
      if (hit < nearest) nearest = hit;
    }
    if (nearest < maxDistance) {
      const pull = Math.max(0.9, nearest - config.camera.nearClip);
      this.desired.copy(target).addScaledVector(this.rayDirection, pull);
    }
  }

  setShot(position, target) {
    this.camera.position.copy(position);
    this.camera.fov = 54;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
  }
}
