// The ground under the city and the sand that runs into the sea. One height field sampled
// from the plan keeps roads, feet and beach props agreeing with the visible surface.
import config from '../core/config.js';
import { clamp, wave } from '../core/math.js';
import { sandTexture, pavingTexture } from '../core/assets.js';

const THREE = globalThis.THREE;

export default class Terrain {
  constructor(plan) {
    this.plan = plan;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.buildGround();
    this.buildPromenade();
  }

  buildGround() {
    const size = config.worldSize;
    const geometry = new THREE.PlaneGeometry(size, size, 120, 120);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const sand = new THREE.Color(0xd8bd8f);
    const wet = new THREE.Color(0xa98f6c);
    const scrub = new THREE.Color(0x77785a);
    const verge = new THREE.Color(0x8d8a6c);
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const insideCity = Math.abs(x) <= 342 && z <= 340;
      let height;
      if (insideCity) {
        height = -0.7;
      } else {
        height = this.plan.heightAt(x, z) - 0.045;
      }
      if (!insideCity && z < config.beachStart) {
        const out = clamp((Math.abs(x) - 338) / 120, 0, 1);
        height += wave(x * 0.05, 0.6, 0.4) * 0.35 * out + wave(z * 0.04, 0.8, 1.3) * 0.25 * out;
      }
      position.setY(i, height);
      const color = new THREE.Color();
      if (z > config.beachStart + 2) {
        const t = clamp((z - 388) / 26, 0, 1);
        color.copy(sand).lerp(wet, t * 0.85);
        const grain = wave(x * 0.4, 0.9, z * 0.11) * 0.035;
        color.offsetHSL(0, 0, grain);
      } else {
        color.copy(scrub).lerp(verge, wave(x * 0.09, 0.5, z * 0.07) * 0.5 + 0.5);
      }
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, map: sandTexture() });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.position.y = 0;
    this.group.add(mesh);
    this.ground = mesh;
  }

  buildPromenade() {
    const deckTexture = pavingTexture().clone();
    deckTexture.needsUpdate = true;
    deckTexture.repeat.set(70, 3);
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(880, config.slabHeight, 14),
      new THREE.MeshStandardMaterial({ map: deckTexture, color: 0xc6bdac, roughness: 0.92 }),
    );
    deck.position.set(0, config.slabHeight / 2, 345);
    deck.receiveShadow = true;
    this.group.add(deck);
    this.deck = deck;

    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(880, 0.28, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xa89f8e, roughness: 0.9 }),
    );
    edge.position.set(0, 0.14, 351.8);
    edge.receiveShadow = true;
    this.group.add(edge);

    const roadCurb = new THREE.Mesh(
      new THREE.BoxGeometry(880, 0.22, 0.42),
      new THREE.MeshStandardMaterial({ color: 0xb8b0a2, roughness: 0.88 }),
    );
    roadCurb.position.set(0, 0.11, 338.15);
    roadCurb.receiveShadow = true;
    roadCurb.castShadow = true;
    this.group.add(roadCurb);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(880, 0.012, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x8f8778, roughness: 0.95 }),
    );
    stripe.position.set(0, config.slabHeight + 0.007, 341.6);
    this.group.add(stripe);
  }
}
