// One-off architecture that gives the city a memory: the landmark tower at the head of the
// avenue, the elevated freeway, the marina, the lighthouse, the plaza fountain and two
// lifeguard huts. Nothing here repeats, so plain meshes are the right tool.
import config from '../core/config.js';
import { signMaterial, glowTexture } from '../core/assets.js';

const THREE = globalThis.THREE;

function box(w, h, d, material, x, y, z, rotation = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotation;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export default class Landmarks {
  constructor(plan) {
    this.plan = plan;
    this.group = new THREE.Group();
    this.group.name = 'landmarks';
    this.glowSprites = [];
    this.buildTower();
    this.buildViaduct();
    this.buildMarina();
    this.buildLighthouse();
    this.buildFountain();
    this.buildLifeguards();
  }

  buildTower() {
    const landmark = this.plan.landmarkTower;
    const concrete = new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.78 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0xb08a4c, roughness: 0.42, metalness: 0.55 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x3d5b62, roughness: 0.18, metalness: 0.6, emissive: 0xffbe72, emissiveIntensity: 0.06 });
    this.towerGlass = glass;
    const base = landmark.base;
    this.group.add(box(34, 0.7, 34, concrete, landmark.x, base + 0.35, landmark.z));
    this.group.add(box(26, 10, 26, concrete, landmark.x, base + 5.2, landmark.z));
    this.group.add(box(21, 4, 21, bronze, landmark.x, base + 12.2, landmark.z));
    this.group.add(box(18.5, 62, 18.5, concrete, landmark.x, base + 45.2, landmark.z));
    for (let i = 0; i < 6; i += 1) {
      const y = base + 18 + i * 9.4;
      this.group.add(box(18.9, 1.7, 18.9, glass, landmark.x, y, landmark.z));
    }
    this.group.add(box(15.4, 17, 15.4, bronze, landmark.x, base + 84.7, landmark.z));
    this.group.add(box(9.4, 13, 9.4, concrete, landmark.x, base + 99.7, landmark.z));
    const crown = new THREE.Mesh(new THREE.ConeGeometry(6.4, 17, 4), bronze);
    crown.position.set(landmark.x, base + 114.7, landmark.z);
    crown.rotation.y = Math.PI / 4;
    crown.castShadow = true;
    this.group.add(crown);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 19, 5), new THREE.MeshStandardMaterial({ color: 0x8c8c8c, metalness: 0.6, roughness: 0.4 }));
    mast.position.set(landmark.x, base + 132, landmark.z);
    this.group.add(mast);
    const beaconMaterial = new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,116,80,1)', 'rgba(255,70,40,0)'),
      color: 0xff6a48,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const beacon = new THREE.Sprite(beaconMaterial);
    beacon.scale.set(5, 5, 1);
    beacon.position.set(landmark.x, base + 141, landmark.z);
    this.group.add(beacon);
    this.glowSprites.push({ sprite: beacon, night: 0.95, day: 0.0 });
  }

  buildViaduct() {
    const viaduct = this.plan.viaduct;
    const concrete = new THREE.MeshStandardMaterial({ color: 0x9c978c, roughness: 0.92 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x5c5a55, roughness: 0.9 });
    const road = new THREE.MeshStandardMaterial({ color: 0x34343a, roughness: 0.97 });
    const length = viaduct.to - viaduct.from;
    const y = viaduct.y;
    this.group.add(box(viaduct.width, 0.5, length, road, viaduct.x, y + 1.15, 0));
    this.group.add(box(viaduct.width + 2.4, 1.2, length, concrete, viaduct.x, y + 0.3, 0));
    this.group.add(box(0.4, 0.85, length, concrete, viaduct.x - viaduct.width / 2 - 0.3, y + 1.85, 0));
    this.group.add(box(0.4, 0.85, length, concrete, viaduct.x + viaduct.width / 2 + 0.3, y + 1.85, 0));
    for (const z of viaduct.piers) {
      this.group.add(box(6.2, y, 2.6, dark, viaduct.x, y / 2, z));
      this.group.add(box(8.4, 0.9, 3.8, concrete, viaduct.x, y - 0.9, z));
    }
    const stripe = new THREE.MeshStandardMaterial({ color: 0xcbb25f, roughness: 0.8 });
    for (let z = viaduct.from + 20; z < viaduct.to; z += 12) {
      const dash = box(0.16, 0.03, 4.5, stripe, viaduct.x, y + 1.41, z);
      dash.castShadow = false;
      this.group.add(dash);
    }
    this.viaductTop = y + 1.4;
  }

  buildMarina() {
    const marina = this.plan.marina;
    const wood = new THREE.MeshStandardMaterial({ color: 0x8d6a45, roughness: 0.92 });
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x66503a, roughness: 0.95 });
    for (const pier of marina.piers) {
      this.group.add(box(pier.w, 0.24, pier.d, wood, pier.x, pier.y - 0.12, pier.z));
      for (let z = pier.z - pier.d / 2 + 3; z <= pier.z + pier.d / 2; z += 7) {
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 4.6, 6), postMaterial);
          post.position.set(pier.x + (side * pier.w) / 2 - side * 0.22, pier.y - 2.2, z);
          post.castShadow = true;
          this.group.add(post);
        }
      }
    }
    const arch = marina.arch;
    const stone = new THREE.MeshStandardMaterial({ color: 0xe3d7bd, roughness: 0.82 });
    this.group.add(box(1.1, 8.2, 1.1, stone, arch.x - 7.4, arch.y + 4.1, arch.z));
    this.group.add(box(1.1, 8.2, 1.1, stone, arch.x + 7.4, arch.y + 4.1, arch.z));
    this.group.add(box(16.4, 1.3, 1.3, stone, arch.x, arch.y + 8.3, arch.z));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 2.1), signMaterial('MARINA DORADA', { vertical: false, ink: '#ffe0a3' }));
    sign.position.set(arch.x, arch.y + 8.3, arch.z - 0.68);
    sign.rotation.y = Math.PI;
    this.group.add(sign);
    const signBack = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 2.1), signMaterial('MARINA DORADA', { vertical: false, ink: '#ffe0a3' }));
    signBack.position.set(arch.x, arch.y + 8.3, arch.z + 0.68);
    this.group.add(signBack);
    this.marinaSigns = [sign.material, signBack.material];
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.4, 5), new THREE.MeshStandardMaterial({ color: 0xc9c2b4 }));
    flagPole.position.set(arch.x + 8.6, arch.y + 2.2, arch.z);
    this.group.add(flagPole);

    const hullGeometry = new THREE.BoxGeometry(2.6, 1.1, 6.4);
    const cabinGeometry = new THREE.BoxGeometry(1.9, 0.9, 2.4);
    const mastGeometry = new THREE.CylinderGeometry(0.055, 0.075, 7, 5);
    const boats = marina.boats;
    const hulls = new THREE.InstancedMesh(hullGeometry, new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.2 }), boats.length);
    const cabins = new THREE.InstancedMesh(cabinGeometry, new THREE.MeshStandardMaterial({ color: 0xe9e3d4, roughness: 0.6 }), boats.length);
    const masts = new THREE.InstancedMesh(mastGeometry, new THREE.MeshStandardMaterial({ color: 0xbdb6a8, roughness: 0.6 }), boats.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    boats.forEach((boat, index) => {
      dummy.position.set(boat.x, config.waterLevel + 0.42, boat.z);
      dummy.rotation.set(0, boat.yaw, 0);
      dummy.scale.set(boat.scale, boat.scale, boat.scale);
      dummy.updateMatrix();
      hulls.setMatrixAt(index, dummy.matrix);
      dummy.position.y += 0.95 * boat.scale;
      dummy.updateMatrix();
      cabins.setMatrixAt(index, dummy.matrix);
      dummy.position.set(boat.x, config.waterLevel + 3.6 * boat.scale, boat.z);
      dummy.updateMatrix();
      masts.setMatrixAt(index, dummy.matrix);
      color.setHex(boat.color);
      hulls.setColorAt(index, color);
    });
    hulls.instanceMatrix.needsUpdate = true;
    cabins.instanceMatrix.needsUpdate = true;
    masts.instanceMatrix.needsUpdate = true;
    if (hulls.instanceColor) hulls.instanceColor.needsUpdate = true;
    hulls.castShadow = true;
    cabins.castShadow = true;
    this.group.add(hulls);
    this.group.add(cabins);
    this.group.add(masts);
  }

  buildLighthouse() {
    const spot = this.plan.lighthouse;
    const ground = this.plan.heightAt(spot.x, spot.z);
    const white = new THREE.MeshStandardMaterial({ color: 0xf0e9d8, roughness: 0.75 });
    const red = new THREE.MeshStandardMaterial({ color: 0xb4402f, roughness: 0.7 });
    const rock = new THREE.MeshStandardMaterial({ color: 0x776a58, roughness: 1 });
    const rocks = new THREE.Mesh(new THREE.DodecahedronGeometry(7.5, 0), rock);
    rocks.scale.set(1.5, 0.5, 1.2);
    rocks.position.set(spot.x, ground + 0.6, spot.z);
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.group.add(rocks);
    let y = ground + 1.6;
    const bands = [
      { r0: 2.5, r1: 2.15, h: 8, material: white },
      { r0: 2.15, r1: 1.9, h: 4.5, material: red },
      { r0: 1.9, r1: 1.65, h: 8, material: white },
      { r0: 1.65, r1: 1.5, h: 4.2, material: red },
    ];
    for (const band of bands) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(band.r1, band.r0, band.h, 12), band.material);
      mesh.position.set(spot.x, y + band.h / 2, spot.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      y += band.h;
    }
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.35, 0.32, 12), new THREE.MeshStandardMaterial({ color: 0x33383a, metalness: 0.5, roughness: 0.5 }));
    gallery.position.set(spot.x, y + 0.16, spot.z);
    this.group.add(gallery);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 2.1, 8), new THREE.MeshStandardMaterial({ color: 0xffdca6, emissive: 0xffbd62, emissiveIntensity: 0.35, roughness: 0.2 }));
    lantern.position.set(spot.x, y + 1.4, spot.z);
    this.group.add(lantern);
    this.lanternMaterial = lantern.material;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.5, 8), red);
    roof.position.set(spot.x, y + 3.2, spot.z);
    this.group.add(roof);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,226,170,0.95)', 'rgba(255,180,90,0)'),
      color: 0xffd89a,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    glow.scale.set(16, 16, 1);
    glow.position.set(spot.x, y + 1.4, spot.z);
    this.group.add(glow);
    this.glowSprites.push({ sprite: glow, night: 0.75, day: 0.12 });
  }

  buildFountain() {
    const spot = this.plan.fountain;
    if (!spot) return;
    const y = config.slabHeight;
    const stone = new THREE.MeshStandardMaterial({ color: 0xd4c7ab, roughness: 0.85 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.6, 0.8, 24), stone);
    basin.position.set(spot.x, y + 0.4, spot.z);
    basin.castShadow = true;
    basin.receiveShadow = true;
    this.group.add(basin);
    const water = new THREE.Mesh(new THREE.CircleGeometry(5.75, 28), new THREE.MeshStandardMaterial({ color: 0x3f8d96, roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.9 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(spot.x, y + 0.81, spot.z);
    this.group.add(water);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.95, 4.6, 10), stone);
    column.position.set(spot.x, y + 3.0, spot.z);
    column.castShadow = true;
    this.group.add(column);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 0.8, 0.55, 14), stone);
    bowl.position.set(spot.x, y + 5.1, spot.z);
    this.group.add(bowl);
  }

  buildLifeguards() {
    const wood = new THREE.MeshStandardMaterial({ color: 0xe6d6b6, roughness: 0.9 });
    const red = new THREE.MeshStandardMaterial({ color: 0xc8513c, roughness: 0.8 });
    const positions = [{ x: -170, z: 372 }, { x: 120, z: 370 }];
    for (const spot of positions) {
      const ground = this.plan.heightAt(spot.x, spot.z);
      const hut = new THREE.Group();
      hut.position.set(spot.x, ground, spot.z);
      for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.2, 0.22), wood);
        leg.position.set(dx, 1.1, dz);
        leg.castShadow = true;
        hut.add(leg);
      }
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 4.2), wood);
      cabin.position.y = 3.3;
      cabin.castShadow = true;
      cabin.receiveShadow = true;
      hut.add(cabin);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.5, 4), red);
      roof.position.y = 5.25;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      hut.add(roof);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.16, 5.2), wood);
      deck.position.y = 2.1;
      hut.add(deck);
      this.group.add(hut);
    }
  }

  setPeriod(period) {
    const night = period === 'night';
    for (const item of this.glowSprites) {
      item.sprite.material.opacity = night ? item.night : item.day;
    }
    if (this.lanternMaterial) this.lanternMaterial.emissiveIntensity = night ? 1.7 : 0.35;
    if (this.towerGlass) this.towerGlass.emissiveIntensity = night ? 0.55 : 0.06;
    if (this.marinaSigns) for (const material of this.marinaSigns) material.color.setScalar(night ? 1 : 0.8);
  }
}
