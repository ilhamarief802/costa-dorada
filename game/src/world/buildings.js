// Buildings are three instanced meshes (mass, windows, shopfronts) plus small per-building
// furniture. Lights are baked into emissive materials, never into extra point lights.
import config from '../core/config.js';
import { signMaterial } from '../core/assets.js';
import { stuccoTexture } from '../core/assets.js';

const THREE = globalThis.THREE;

const WINDOW_LIT_WARM = 0xffb264;
const WINDOW_LIT_COOL = 0xa8d8ff;

export default class Buildings {
  constructor(plan) {
    this.plan = plan;
    this.group = new THREE.Group();
    this.group.name = 'buildings';
    this.group = new THREE.Group();
    this.buildMass();
    this.buildWindows();
    this.buildStorefronts();
    this.buildRoofs();
    this.buildAwnings();
    this.buildSigns();
  }

  buildMass() {
    const tiers = [];
    for (const building of this.plan.buildings) {
      for (const tier of building.tiers) tiers.push(tier);
    }
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0.04, map: stuccoTexture() });
    const mesh = new THREE.InstancedMesh(geometry, material, tiers.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    tiers.forEach((tier, index) => {
      dummy.position.set(tier.x, tier.y, tier.z);
      dummy.scale.set(tier.w, tier.h, tier.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      color.setHex(tier.color);
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.mass = mesh;

    const lips = [];
    for (const building of this.plan.buildings) {
      const top = building.tiers[building.tiers.length - 1];
      lips.push({ x: top.x, y: top.y + top.h, z: top.z, w: top.w + 0.55, d: top.d + 0.55, color: building.trim });
    }
    const lipMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8 }), lips.length);
    lips.forEach((lip, index) => {
      dummy.position.set(lip.x, lip.y + 0.16, lip.z);
      dummy.scale.set(lip.w, 0.36, lip.d);
      dummy.updateMatrix();
      lipMesh.setMatrixAt(index, dummy.matrix);
      color.setHex(lip.color);
      lipMesh.setColorAt(index, color);
    });
    lipMesh.instanceMatrix.needsUpdate = true;
    if (lipMesh.instanceColor) lipMesh.instanceColor.needsUpdate = true;
    lipMesh.castShadow = true;
    lipMesh.receiveShadow = true;
    this.group.add(lipMesh);

    const bands = [];
    for (const building of this.plan.buildings) {
      for (let i = 0; i < building.tiers.length - 1; i += 1) {
        const tier = building.tiers[i];
        bands.push({ x: tier.x, y: tier.y + tier.h, z: tier.z, w: tier.w + 0.4, d: tier.d + 0.4, color: building.trim });
      }
    }
    if (bands.length) {
      const bandMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.82 }), bands.length);
      bands.forEach((band, index) => {
        dummy.position.set(band.x, band.y, band.z);
        dummy.scale.set(band.w, 0.26, band.d);
        dummy.updateMatrix();
        bandMesh.setMatrixAt(index, dummy.matrix);
        color.setHex(band.color);
        bandMesh.setColorAt(index, color);
      });
      bandMesh.instanceMatrix.needsUpdate = true;
      if (bandMesh.instanceColor) bandMesh.instanceColor.needsUpdate = true;
      bandMesh.castShadow = true;
      bandMesh.receiveShadow = true;
      this.group.add(bandMesh);
    }

    const plinths = [];
    for (const building of this.plan.buildings) {
      if (building.style === 'tower') continue;
      const horizontal = building.street === 'n' || building.street === 's';
      const span = horizontal ? building.w : building.d;
      let x = building.x;
      let z = building.z;
      if (building.street === 'n') z = building.z - building.d / 2 + 0.1;
      if (building.street === 's') z = building.z + building.d / 2 - 0.1;
      if (building.street === 'e') x = building.x + building.w / 2 - 0.1;
      if (building.street === 'w') x = building.x - building.w / 2 + 0.1;
      plinths.push({
        x,
        z,
        y: building.base + 0.24,
        yaw: building.street === 'n' ? Math.PI / 2 : building.street === 's' ? Math.PI / 2 : 0,
        w: 0.16,
        d: span - 1.2,
      });
    }
    if (plinths.length) {
      const plinthMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x9a8e7c, roughness: 0.9 }), plinths.length);
      plinths.forEach((plinth, index) => {
        const alongX = plinth.yaw === Math.PI / 2;
        dummy.position.set(plinth.x, plinth.y, plinth.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(alongX ? plinth.w : plinth.d, 0.48, alongX ? plinth.d : plinth.w);
        dummy.updateMatrix();
        plinthMesh.setMatrixAt(index, dummy.matrix);
      });
      plinthMesh.instanceMatrix.needsUpdate = true;
      plinthMesh.castShadow = true;
      this.group.add(plinthMesh);
    }
  }

  buildWindows() {
    const warm = [];
    const cool = [];
    const dark = [];
    for (const window of this.plan.windows) {
      if (window.lit) (window.warm >= 3 ? cool : warm).push(window);
      else dark.push(window);
    }
    const geometry = new THREE.PlaneGeometry(1, 1);
    const frameGeometry = new THREE.PlaneGeometry(1, 1);
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.78, metalness: 0.1 });
    const frames = new THREE.InstancedMesh(frameGeometry, frameMaterial, this.plan.windows.length);
    const frameDummy = new THREE.Object3D();
    this.plan.windows.forEach((window, index) => {
      frameDummy.position.set(
        window.x - Math.sin(window.yaw) * 0.035,
        window.y - 0.065,
        window.z - Math.cos(window.yaw) * 0.035,
      );
      frameDummy.rotation.set(0, window.yaw, 0);
      frameDummy.scale.set(window.w + 0.28, window.h + 0.3, 1);
      frameDummy.updateMatrix();
      frames.setMatrixAt(index, frameDummy.matrix);
    });
    frames.instanceMatrix.needsUpdate = true;
    frames.castShadow = false;
    this.group.add(frames);
    const makeSet = (list, glowing, hue) => {
      const material = new THREE.MeshStandardMaterial({
        color: glowing ? 0x2f3238 : 0x20262c,
        roughness: glowing ? 0.28 : 0.34,
        metalness: 0.42,
        emissive: glowing ? hue : 0x000000,
        emissiveIntensity: glowing ? 0.08 : 0,
        side: THREE.FrontSide,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      const dummy = new THREE.Object3D();
      list.forEach((window, index) => {
        dummy.position.set(window.x, window.y, window.z);
        dummy.rotation.set(0, window.yaw, 0);
        dummy.scale.set(window.w, window.h, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.group.add(mesh);
      return material;
    };
    this.warmMaterial = makeSet(warm, true, WINDOW_LIT_WARM);
    this.coolMaterial = makeSet(cool, true, WINDOW_LIT_COOL);
    this.darkMaterial = makeSet(dark, false, 0x000000);
    this.windowCount = warm.length + cool.length + dark.length;
  }

  buildStorefronts() {
    const lit = [];
    const dark = [];
    for (const building of this.plan.buildings) {
      if (building.style === 'tower') continue;
      const horizontal = building.street === 'n' || building.street === 's';
      const span = horizontal ? building.w : building.d;
      const width = Math.min(11, span - 3);
      if (width < 3.5) continue;
      let x = building.x;
      let z = building.z;
      if (building.street === 'n') z = building.z - building.d / 2 - 0.07;
      if (building.street === 's') z = building.z + building.d / 2 + 0.07;
      if (building.street === 'e') x = building.x + building.w / 2 + 0.07;
      if (building.street === 'w') x = building.x - building.w / 2 - 0.07;
      const yaw = building.street === 'n' ? Math.PI : building.street === 's' ? 0 : building.street === 'e' ? Math.PI / 2 : -Math.PI / 2;
      const record = { x, z, y: config.slabHeight + 1.41, yaw, w: width, h: 2.5 };
      if ((Math.floor(Math.abs(building.x) + Math.abs(building.z)) + building.street.charCodeAt(0)) % 3 === 0) {
        dark.push(record);
      } else {
        lit.push(record);
      }
    }
    const geometry = new THREE.PlaneGeometry(1, 1);
    const place = (list, glowing) => {
      const material = new THREE.MeshStandardMaterial({
        color: glowing ? 0x3c3a30 : 0x171d21,
        roughness: 0.2,
        metalness: 0.5,
        emissive: glowing ? 0xffc27a : 0x000000,
        emissiveIntensity: glowing ? 0.12 : 0,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      const dummy = new THREE.Object3D();
      list.forEach((item, index) => {
        dummy.position.set(item.x, item.y, item.z);
        dummy.rotation.set(0, item.yaw, 0);
        dummy.scale.set(item.w, item.h, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
      return material;
    };
    this.shopLit = place(lit, true);
    this.shopDark = place(dark, false);
  }

  buildRoofs() {
    if (!this.plan.roofs.length) return;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(geometry, material, this.plan.roofs.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    this.plan.roofs.forEach((roof, index) => {
      dummy.position.set(roof.x, roof.y + roof.h / 2, roof.z);
      dummy.scale.set(roof.w, roof.h, roof.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      color.setHex(roof.color);
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    this.group.add(mesh);
  }

  buildAwnings() {
    if (!this.plan.awnings.length) return;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.88 });
    const mesh = new THREE.InstancedMesh(geometry, material, this.plan.awnings.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    this.plan.awnings.forEach((awning, index) => {
      const nx = Math.sin(awning.yaw);
      const nz = Math.cos(awning.yaw);
      dummy.position.set(awning.x + nx * 1.1, awning.y, awning.z + nz * 1.1);
      dummy.rotation.set(0, awning.yaw, 0);
      dummy.scale.set(awning.w, 0.15, awning.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      color.setHex(awning.color);
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  buildSigns() {
    this.signMaterials = [];
    for (const sign of this.plan.signs) {
      const backing = new THREE.Mesh(
        new THREE.BoxGeometry(sign.w + 0.3, sign.h + 0.3, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.7, metalness: 0.35 }),
      );
      const nx = Math.sin(sign.yaw);
      const nz = Math.cos(sign.yaw);
      backing.position.set(sign.x + nx * 0.06, sign.y, sign.z + nz * 0.06);
      backing.rotation.y = sign.yaw;
      this.group.add(backing);

      const material = signMaterial(sign.text, {
        vertical: sign.vertical,
        ink: `#${sign.color.toString(16).padStart(6, '0')}`,
        glow: 'rgba(255,190,110,0.5)',
        background: '#121519',
      });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(sign.w, sign.h), material);
      face.position.set(sign.x + nx * 0.18, sign.y, sign.z + nz * 0.18);
      face.rotation.y = sign.yaw;
      this.group.add(face);
      this.signMaterials.push(material);
    }
  }

  setPeriod(period) {
    const night = period === 'night';
    this.warmMaterial.emissiveIntensity = night ? 1.55 : 0.08;
    this.coolMaterial.emissiveIntensity = night ? 1.15 : 0.05;
    this.shopLit.emissiveIntensity = night ? 1.0 : 0.1;
    for (const material of this.signMaterials) {
      material.color.setScalar(night ? 1 : 0.72);
    }
  }
}
