// Palms: one instanced trunk and one instanced crown. The crown geometry is built here from
// seventeen drooping fronds so the silhouette reads as a palm, not a lollipop.
import config from '../core/config.js';
import { barkTexture } from '../core/bark.js';

const THREE = globalThis.THREE;

function createCrownGeometry() {
  const positions = [];
  const colors = [];
  const normals = [];
  const dark = new THREE.Color(0x274d2c);
  const light = new THREE.Color(0x8aa858);
  const fronds = 12;
  const segments = 5;
  const pushVertex = (x, y, z, t, shade = 1) => {
    positions.push(x, y, z);
    const color = dark.clone().lerp(light, Math.min(1, t * 0.9 * shade));
    colors.push(color.r, color.g, color.b);
    normals.push(0, 1, 0);
  };
  const frond = (angle, reach, rise, droop, widthBase, age) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let s = 0; s < segments; s += 1) {
      const t0 = s / segments;
      const t1 = (s + 1) / segments;
      const build = (t) => {
        const r = 0.3 + t * reach;
        const y = rise + Math.sin(t * Math.PI * 0.58) * 0.3 - t * t * droop;
        const width = widthBase * (1 - t * 0.72) + 0.04;
        return { x: cos * r, y, z: sin * r, px: -sin * width, pz: cos * width };
      };
      const a = build(t0);
      const b = build(t1);
      pushVertex(a.x - a.px, a.y, a.z - a.pz, t0, age);
      pushVertex(a.x + a.px, a.y, a.z + a.pz, t0, age);
      pushVertex(b.x - b.px, b.y, b.z - b.pz, t1, age);
      pushVertex(a.x + a.px, a.y, a.z + a.pz, t0, age);
      pushVertex(b.x + b.px, b.y, b.z + b.pz, t1, age);
      pushVertex(b.x - b.px, b.y, b.z - b.pz, t1, age);
    }
  };
  for (let f = 0; f < fronds; f += 1) {
    const angle = (f / fronds) * Math.PI * 2 + 0.13;
    const variant = (f * 37) % 9;
    frond(angle, 2.6 + variant * 0.055, 0.32, 1.35 + (f % 3) * 0.14, 0.36, 1);
  }
  for (let f = 0; f < 5; f += 1) {
    const angle = (f / 5) * Math.PI * 2 - 0.4;
    frond(angle, 1.45, 0.72, 0.55, 0.28, 0.85);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createBentTrunkGeometry() {
  const geometry = new THREE.CylinderGeometry(0.13, 0.28, 1, 7, 5, false);
  geometry.translate(0, 0.5, 0);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const bend = Math.sin(y * Math.PI * 0.9) * 0.16;
    position.setX(i, position.getX(i) + bend);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export default class Palms {
  constructor(plan) {
    this.plan = plan;
    this.group = new THREE.Group();
    this.group.name = 'palms';
    this.trunkGeometry = createBentTrunkGeometry();
    this.crownGeometry = createCrownGeometry();
    this.build();
  }

  build() {
    const count = this.plan.palms.length;
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x9a805c, roughness: 0.95, map: barkTexture() });
    const crownMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const bootGeometry = new THREE.CylinderGeometry(0.16, 0.6, 1.2, 7, 1, true);
    bootGeometry.translate(0, -0.6, 0);
    const bootMaterial = new THREE.MeshStandardMaterial({ color: 0x6b5336, roughness: 1, side: THREE.DoubleSide });
    const trunks = new THREE.InstancedMesh(this.trunkGeometry, trunkMaterial, count);
    const crowns = new THREE.InstancedMesh(this.crownGeometry, crownMaterial, count);
    const boots = new THREE.InstancedMesh(bootGeometry, bootMaterial, count);
    const dummy = new THREE.Object3D();
    const crownDummy = new THREE.Object3D();
    const color = new THREE.Color();
    const up = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    this.plan.palms.forEach((palm, index) => {
      const ground = this.plan.heightAt(palm.x, palm.z);
      const height = 5.4 * palm.scale + (palm.kind === 'beach' ? 0.6 : 0);
      euler.set(palm.lean, palm.yaw, palm.lean * 0.4, 'YXZ');
      quaternion.setFromEuler(euler);
      dummy.position.set(palm.x, ground, palm.z);
      dummy.quaternion.copy(quaternion);
      dummy.scale.set(palm.scale, height, palm.scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(index, dummy.matrix);

      up.set(0, height, 0).applyQuaternion(quaternion);
      crownDummy.position.set(palm.x + up.x, ground + up.y, palm.z + up.z);
      crownDummy.quaternion.copy(quaternion);
      const crownScale = palm.scale * (palm.kind === 'beach' ? 1.2 : 1.05);
      crownDummy.scale.set(crownScale, crownScale * 0.9, crownScale);
      crownDummy.updateMatrix();
      crowns.setMatrixAt(index, crownDummy.matrix);
      boots.setMatrixAt(index, crownDummy.matrix);
      color.setHSL(0.23 + ((index * 13) % 10) * 0.004, 0.34, 0.52);
      crowns.setColorAt(index, color);
    });
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    boots.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    crowns.castShadow = true;
    boots.castShadow = true;
    this.group.add(trunks);
    this.group.add(crowns);
    this.group.add(boots);
    this.trunks = trunks;
    this.crowns = crowns;
  }
}
