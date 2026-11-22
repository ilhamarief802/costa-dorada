// City blocks: the raised sidewalk plate each block sits on, its curb stones, the dark
// service alleys between buildings, park lawns and the plaza floor. Instanced, one concern.
import config from '../core/config.js';
import { wave } from '../core/math.js';
import { pavingTexture } from '../core/assets.js';

const THREE = globalThis.THREE;

export default class Blocks {
  constructor(plan) {
    this.plan = plan;
    this.group = new THREE.Group();
    this.group.name = 'blocks';
    this.buildPlatforms();
    this.buildCurbs();
    this.buildAlleys();
    this.buildSpecialFloors();
  }

  buildPlatforms() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    // Three paving variants (tile scale and tint) so the sidewalks stop reading as one repeat.
    const variants = [0, 1, 2].map((variant) => {
      const texture = pavingTexture().clone();
      texture.needsUpdate = true;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1 + variant * 0.42, 1 + variant * 0.42);
      texture.offset.set(variant * 0.17, variant * 0.31);
      return new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.9 + variant * 0.02,
        metalness: 0.01,
        color: [0xd8d0c1, 0xcfc6b6, 0xded6c7][variant],
      });
    });
    const buckets = [[], [], []];
    this.plan.blocks.forEach((block, index) => {
      buckets[(block.bx * 7 + block.bz * 3 + (index % 2)) % 3].push(block);
    });
    this.platformMaterials = [];
    buckets.forEach((blocks, variant) => {
      if (!blocks.length) return;
      const mesh = new THREE.InstancedMesh(geometry, variants[variant], blocks.length);
      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      blocks.forEach((block, index) => {
        dummy.position.set(block.x, config.slabHeight / 2, block.z);
        dummy.scale.set(config.block, config.slabHeight, config.block);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        const shade = wave(block.x * 0.13, 0.8, block.z * 0.11) * 0.035;
        color.setHex(0xd4ccbd).offsetHSL(0, 0, shade);
        mesh.setColorAt(index, color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      this.group.add(mesh);
      this.platformMaterials.push(mesh);
      if (!this.platforms) this.platforms = mesh;
    });
  }

  buildCurbs() {
    const boxes = [];
    const half = config.block / 2;
    for (const block of this.plan.blocks) {
      boxes.push({ x: block.x, z: block.z - half + 0.18, w: config.block, d: 0.36 });
      boxes.push({ x: block.x, z: block.z + half - 0.18, w: config.block, d: 0.36 });
      boxes.push({ x: block.x - half + 0.18, z: block.z, w: 0.36, d: config.block - 0.72 });
      boxes.push({ x: block.x + half - 0.18, z: block.z, w: 0.36, d: config.block - 0.72 });
    }
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xb5ada0, roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(geometry, material, boxes.length);
    const dummy = new THREE.Object3D();
    boxes.forEach((box, index) => {
      dummy.position.set(box.x, config.curbHeight / 2, box.z);
      dummy.scale.set(box.w, config.curbHeight, box.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.group.add(mesh);
    this.curbs = mesh;

    // Expansion joints along the kerb, plus corner drain grates: small detail that breaks the
    // long extruded edge into pavers.
    const joints = [];
    const grates = [];
    const step = 5.2;
    for (const block of this.plan.blocks) {
      const h = config.block / 2;
      for (let along = -h + 2.4; along <= h - 2.4; along += step) {
        joints.push({ x: block.x + along, z: block.z - h + 0.18, sx: 0.34, sz: 0.74 });
        joints.push({ x: block.x + along, z: block.z + h - 0.18, sx: 0.34, sz: 0.74 });
        joints.push({ x: block.x - h + 0.18, z: block.z + along, sx: 0.74, sz: 0.34 });
        joints.push({ x: block.x + h - 0.18, z: block.z + along, sx: 0.74, sz: 0.34 });
      }
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          grates.push({ x: block.x + sx * (h - 1.5), z: block.z + sz * (h - 1.5) });
        }
      }
    }
    const jointGeometry = new THREE.BoxGeometry(1, 1, 1);
    const jointMaterial = new THREE.MeshStandardMaterial({ color: 0x8f8779, roughness: 0.95 });
    const jointMesh = new THREE.InstancedMesh(jointGeometry, jointMaterial, joints.length);
    const jointDummy = new THREE.Object3D();
    joints.forEach((joint, index) => {
      jointDummy.position.set(joint.x, config.curbHeight + 0.005, joint.z);
      jointDummy.scale.set(joint.sx, 0.022, joint.sz);
      jointDummy.updateMatrix();
      jointMesh.setMatrixAt(index, jointDummy.matrix);
    });
    jointMesh.instanceMatrix.needsUpdate = true;
    jointMesh.receiveShadow = true;
    this.group.add(jointMesh);

    const grateGeometry = new THREE.BoxGeometry(0.85, 0.02, 0.55);
    const grateMaterial = new THREE.MeshStandardMaterial({ color: 0x33383a, roughness: 0.7, metalness: 0.5 });
    const grateMesh = new THREE.InstancedMesh(grateGeometry, grateMaterial, grates.length);
    grates.forEach((grate, index) => {
      jointDummy.position.set(grate.x, config.slabHeight + 0.012, grate.z);
      jointDummy.scale.set(1, 1, 1);
      jointDummy.updateMatrix();
      grateMesh.setMatrixAt(index, jointDummy.matrix);
    });
    grateMesh.instanceMatrix.needsUpdate = true;
    grateMesh.receiveShadow = true;
    this.group.add(grateMesh);
  }

  buildAlleys() {
    const strips = [];
    for (const block of this.plan.blocks) {
      if (block.type === 'park' || block.type === 'plaza' || block.type === 'marina') continue;
      if (block.bx === 3 && block.bz === 1) continue;
      strips.push({ x: block.x, z: block.z - 14, w: config.block - config.sidewalk * 2 - 8, d: 6.2 });
      strips.push({ x: block.x + 13, z: block.z, w: 6.2, d: config.block - config.sidewalk * 2 - 10 });
    }
    if (!strips.length) return;
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({ color: 0x3a3a3d, roughness: 0.98 });
    const mesh = new THREE.InstancedMesh(geometry, material, strips.length);
    const dummy = new THREE.Object3D();
    strips.forEach((strip, index) => {
      dummy.position.set(strip.x, config.slabHeight + 0.008, strip.z);
      dummy.scale.set(strip.w, 1, strip.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.alleys = mesh;
  }

  buildSpecialFloors() {
    const parkBlocks = this.plan.blocks.filter((block) => block.park);
    const grassMaterial = new THREE.MeshStandardMaterial({ color: config.palette.parkGrass, roughness: 1 });
    for (const block of parkBlocks) {
      const lawn = new THREE.Mesh(new THREE.BoxGeometry(config.block - 10, 0.05, config.block - 10), grassMaterial);
      lawn.position.set(block.x, config.slabHeight + 0.025, block.z);
      lawn.receiveShadow = true;
      this.group.add(lawn);
      const pathMaterial = new THREE.MeshStandardMaterial({ color: 0xcdbfa4, roughness: 1 });
      const pathA = new THREE.Mesh(new THREE.BoxGeometry(config.block - 8, 0.02, 4.2), pathMaterial);
      pathA.position.set(block.x, config.slabHeight + 0.06, block.z);
      pathA.receiveShadow = true;
      this.group.add(pathA);
      const pathB = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.02, config.block - 8), pathMaterial);
      pathB.position.set(block.x, config.slabHeight + 0.06, block.z);
      pathB.receiveShadow = true;
      this.group.add(pathB);
    }

    const plazaBlocks = this.plan.blocks.filter((block) => block.plaza);
    for (const block of plazaBlocks) {
      const floor = new THREE.Mesh(
        new THREE.BoxGeometry(config.block - 6, 0.03, config.block - 6),
        new THREE.MeshStandardMaterial({ color: 0xd8cdb6, roughness: 0.85 }),
      );
      floor.position.set(block.x, config.slabHeight + 0.02, block.z);
      floor.receiveShadow = true;
      this.group.add(floor);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(9, 10.2, 40),
        new THREE.MeshStandardMaterial({ color: 0xb8a888, roughness: 0.9 }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(block.x, config.slabHeight + 0.04, block.z);
      this.group.add(ring);
    }
  }
}
