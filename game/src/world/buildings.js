// Buildings are three instanced meshes (mass, windows, shopfronts) plus small per-building
// furniture. Lights are baked into emissive materials, never into extra point lights.
import config from '../core/config.js';
import { signMaterial, glowTexture } from '../core/assets.js';
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
    this.buildRoofFurniture();
    this.buildBladeSigns();
    this.buildRoofs();
    this.buildAwnings();
    this.buildSigns();
    this.buildStreetLights();
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
      // Window glass: a low-cost sky reflection rather than a black hole. The environment map is the
      // PMREM of the sky gradient built at boot, so a window at a grazing angle picks up the sunset
      // and reads as glass; from square on it stays dark and shows the room behind. `envMapIntensity`
      // is turned up and roughness right down, which is the whole trick.
      const material = new THREE.MeshStandardMaterial({
        color: glowing ? 0x2a2e34 : 0x161a20,
        roughness: glowing ? 0.14 : 0.06,
        metalness: glowing ? 0.86 : 0.94,
        envMapIntensity: glowing ? 1.6 : 1.9,
        emissive: glowing ? hue : 0x000000,
        emissiveIntensity: glowing ? 0.3 : 0,
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
      // Shopfront glass: the same sky reflection as the tower windows, plus the warm interior a
      // shop spills onto the pavement. A flat black rectangle at street level is the single most
      // common tell of an unfinished city, so this is the one surface worth the extra cost.
      const material = new THREE.MeshStandardMaterial({
        color: glowing ? 0x3a3730 : 0x141a1e,
        roughness: glowing ? 0.1 : 0.08,
        metalness: 0.88,
        envMapIntensity: glowing ? 1.5 : 1.7,
        emissive: glowing ? 0xffc27a : 0x000000,
        emissiveIntensity: glowing ? 0.55 : 0,
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

  /**
   * Roof clutter: water tanks, air-conditioner boxes and a stair head on every low roof. Instanced
   * from one table so the skyline stops reading as bare slab edges.
   */
  buildRoofFurniture() {
    const tanks = [];
    const boxes = [];
    const stairHeads = [];
    for (const building of this.plan.buildings) {
      const top = building.tiers[building.tiers.length - 1];
      if (!top || top.h < 6) continue;
      const y = top.y + top.h;
      const w = top.w;
      const d = top.d;
      // Deterministic scatter inside the roof rectangle, avoiding the parapet.
      const seed = (Math.abs(building.x * 13 + building.z * 7) % 97) / 97;
      tanks.push({ x: building.x + (seed - 0.5) * w * 0.42, y, z: building.z + (seed - 0.5) * d * 0.3, r: 0.9 + seed * 0.6 });
      boxes.push({ x: building.x - w * 0.22, y, z: building.z + d * 0.18, w: 1.5 + seed, h: 0.7, d: 1.2 });
      if (seed > 0.45) stairHeads.push({ x: building.x + w * 0.24, y, z: building.z - d * 0.2, w: 2.0, h: 1.6, d: 2.0 });
    }
    const tankGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
    tankGeometry.translate(0, 0.5, 0);
    const tankMaterial = new THREE.MeshStandardMaterial({ color: 0x9a9384, roughness: 0.88, metalness: 0.1 });
    const tanksMesh = new THREE.InstancedMesh(tankGeometry, tankMaterial, tanks.length);
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    boxGeometry.translate(0, 0.5, 0);
    const boxMaterial = new THREE.MeshStandardMaterial({ color: 0x8d9490, roughness: 0.7, metalness: 0.25 });
    const boxesMesh = new THREE.InstancedMesh(boxGeometry, boxMaterial, boxes.length + stairHeads.length);
    const dummy = new THREE.Object3D();
    tanks.forEach((tank, index) => {
      dummy.position.set(tank.x, tank.y, tank.z);
      dummy.rotation.set(0, index * 0.7, 0);
      dummy.scale.set(tank.r, 1.4, tank.r);
      dummy.updateMatrix();
      tanksMesh.setMatrixAt(index, dummy.matrix);
    });
    let slot = 0;
    for (const item of [...boxes, ...stairHeads]) {
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(item.w, item.h, item.d);
      dummy.updateMatrix();
      boxesMesh.setMatrixAt(slot, dummy.matrix);
      slot += 1;
    }
    tanksMesh.instanceMatrix.needsUpdate = true;
    boxesMesh.instanceMatrix.needsUpdate = true;
    tanksMesh.castShadow = true;
    boxesMesh.castShadow = true;
    this.group.add(tanksMesh, boxesMesh);
  }

  /**
   * Blade signs: projecting neon boxes on brackets over the pavement, the thing that makes a
   * night street read as a night street. Frames and panels are each one instanced mesh with
   * per-instance colour, so sixty signs cost two draw calls; only the handful nearest the two
   * shot streets get a halo sprite.
   */
  buildBladeSigns() {
    const palette = [0xff5f7a, 0x59e0d8, 0xffc857, 0x8fa0ff, 0xff8a4a, 0x7affb0];
    const signs = [];
    // Blade signs are cheap (two instanced meshes total), so put them on every street-facing
    // building in the city. That guarantees the avenue, the marina and the night shot all get
    // neon, instead of a hard-coded zone that may contain no buildings at all.
    const wanted = () => true;
    this.plan.buildings.forEach((building, index) => {
      const halfW = building.w / 2;
      const halfD = building.d / 2;
      let x = building.x;
      let z = building.z;
      let yaw = 0;
      const street = building.street;
      if (street === 's') { z += halfD + 0.5; yaw = 0; }
      else if (street === 'n') { z -= halfD + 0.5; yaw = Math.PI; }
      else if (street === 'e') { x += halfW + 0.5; yaw = Math.PI / 2; }
      else { x -= halfW + 0.5; yaw = -Math.PI / 2; }
      if (!wanted(x, z)) return;
      // Blade signs hang on the facade above the shopfront, not on the pavement. `base` is the
      // building's ground level, taken from its first tier.
      const base = building.base ?? building.tiers?.[0]?.y ?? config.slabHeight;
      const height = Math.min(12, 4.4 + (index % 4) * 1.9);
      signs.push({ x, z, yaw, y: base + height, colour: palette[index % palette.length], tall: 2.2 + (index % 3) * 0.9 });
    });
    if (!signs.length) return;
    this.neonMaterials = [];
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    // Frames: dark brackets, one instanced box.
    const frames = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.26, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x191d22, roughness: 0.7, metalness: 0.45 }),
      signs.length,
    );
    // Panels: unlit glass, one instanced box with per-instance colour. An unlit basic material
    // is the right call here: instance colour multiplies diffuse but never emissive, so a
    // standard material would make every sign glow the same white. Unlit + instance colour gives
    // each blade its own neon hue, and `toneMapped: false` keeps them hot against the night.
    const panelMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 1, 0.68), panelMaterial, signs.length);
    signs.forEach((sign, index) => {
      dummy.position.set(sign.x, sign.y, sign.z);
      dummy.rotation.set(0, sign.yaw, 0);
      dummy.scale.set(1, sign.tall, 0.9);
      dummy.updateMatrix();
      frames.setMatrixAt(index, dummy.matrix);
      dummy.scale.set(1, sign.tall * 0.88, 1);
      dummy.updateMatrix();
      panels.setMatrixAt(index, dummy.matrix);
      color.setHex(sign.colour);
      panels.setColorAt(index, color);
      this.neonMaterials.push({ material: panelMaterial, night: color.clone(), halo: null });
    });
    frames.instanceMatrix.needsUpdate = true;
    panels.instanceMatrix.needsUpdate = true;
    if (panels.instanceColor) panels.instanceColor.needsUpdate = true;
    this.neonMaterials.panelMaterial = panelMaterial;
    this.group.add(frames, panels);

    // A short row of halo sprites only on the signs closest to the night camera.
    const haloTexture = glowTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
    const near = signs
      .map((sign, index) => ({ sign, index, d: Math.hypot(sign.x - 44, sign.z - 318) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8);
    for (const { sign, index } of near) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTexture,
        color: sign.colour,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }));
      halo.scale.set(3.4, sign.tall * 2.8, 1);
      halo.position.set(sign.x, sign.y, sign.z);
      this.group.add(halo);
      this.neonMaterials[index].halo = halo;
    }
  }

  /**
   * Pooled warm light in the street for the shots. Real point lights are expensive, so only a
   * handful are placed near the two shot locations; the rest of the city is carried by the baked
   * lamp pools in Props.
   */
  buildStreetLights() {
    this.streetLights = [];
    const spots = [
      // Along the avenue, right where the cover and night cameras stand.
      { x: 36.3, z: 330, colour: 0xffbe7a, intensity: 34 },
      { x: 57.7, z: 322, colour: 0xffbe7a, intensity: 28 },
      { x: 36.3, z: 306, colour: 0xffbe7a, intensity: 26 },
      { x: 57.7, z: 296, colour: 0xffce8e, intensity: 22 },
      // The fish-market frontage for the mission shot.
      { x: 244, z: 356, colour: 0xffc98a, intensity: 24 },
      { x: 262, z: 344, colour: 0xffd6a0, intensity: 20 },
    ];
    for (const spot of spots) {
      const light = new THREE.PointLight(spot.colour, 0, 26, 1.9);
      light.position.set(spot.x, 5.4, spot.z);
      light.userData.day = 0;
      light.userData.night = spot.intensity;
      this.group.add(light);
      this.streetLights.push(light);
    }
  }

  buildAwnings() {    if (!this.plan.awnings.length) return;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.88, emissive: 0x000000 });
    this.awningMaterial = material;
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
    this.warmMaterial.emissiveIntensity = night ? 1.9 : 0.08;
    this.coolMaterial.emissiveIntensity = night ? 1.4 : 0.05;
    this.shopLit.emissiveIntensity = night ? 1.5 : 0.1;
    if (this.awningMaterial) this.awningMaterial.emissiveIntensity = night ? 0.22 : 0;
    for (const material of this.signMaterials) {
      material.color.setScalar(night ? 1 : 0.78);
    }
    // Neon tubes light up at night; by day they are just coloured glass. The panel colour is per
    // instance (instanced colour multiplies the diffuse), so the emissive is a single white that
    // is switched on with the period, and the per-instance tint gives each sign its hue.
    if (this.neonMaterials) {
      const panelMaterial = this.neonMaterials.panelMaterial;
      if (panelMaterial) {
        // By day an unlit panel is just painted glass; at night it is a lit tube.
        panelMaterial.color.setScalar(night ? 1 : 0.42);
      }
      for (const entry of this.neonMaterials) {
        if (entry.halo) entry.halo.material.opacity = night ? 0.55 : 0;
      }
    }
    if (this.streetLights) {
      for (const light of this.streetLights) light.intensity = night ? light.userData.night : 0;
    }
    if (this.awningMaterial) this.awningMaterial.emissiveIntensity = night ? 0.22 : 0;
  }
}
