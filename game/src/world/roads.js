// Asphalt and paint. One continuous plate carries every street in the city; lane dashes,
// crosswalks, stop bars and twin centre lines are a pair of instanced meshes floating 1.5 cm
// above it, so the whole road network costs a handful of draw calls.
import config from '../core/config.js';
import { wave } from '../core/math.js';
import { asphaltTexture } from '../core/assets.js';

const THREE = globalThis.THREE;

function groundPlane(width, depth) {
  const geometry = new THREE.PlaneGeometry(width, depth, 48, 48);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export default class Roads {
  constructor(plan) {
    this.plan = plan;
    this.group = new THREE.Group();
    this.group.name = 'roads';
    this.buildPlate();
    this.buildWear();
    this.buildPaint();
  }

  buildPlate() {
    const geometry = groundPlane(676, 676);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const base = new THREE.Color(0xffffff);
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const shade = wave(x * 0.08, 0.7, z * 0.06) * 0.05 + wave(x * 0.31, 1.1, z * 0.2) * 0.03;
      const color = base.clone().offsetHSL(0, 0, shade);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ map: asphaltTexture(), vertexColors: true, roughness: 0.94, metalness: 0.02 });
    const plate = new THREE.Mesh(geometry, material);
    plate.position.y = 0.02;
    plate.receiveShadow = true;
    this.group.add(plate);
    this.plate = plate;
    // Weather reads this to change the gloss at night; the plan is the shared data bus.
    this.plan.roadMaterial = material;
  }

  /**
   * The asphalt is never a flat colour in life: each lane carries two darker bands where the
   * tyres polish the aggregate, and the strip beside the kerb is darker still where grit and
   * water collect. One merged, vertex-coloured sheet — two triangles per band — so the cost is a
   * single extra draw call for the whole city.
   */
  buildWear() {
    const half = 338;
    const wear = [];
    // Wheel tracks: 0.78 m either side of each lane centre, two lanes each way.
    const laneCentres = [1.575, 4.725, -1.575, -4.725];
    const tracks = [];
    for (const lane of laneCentres) {
      tracks.push(lane - 0.78, lane + 0.78);
    }
    const centers = [];
    for (let i = 0; i < 8; i += 1) centers.push((i - 3.5) * config.pitch);
    const addStrip = (x, z, width, length, color) => {
      wear.push({ x, z, width, length, color });
    };
    for (const center of centers) {
      // Tyre polish down every lane, both axes.
      for (const track of tracks) {
        addStrip(center + track, 0, 0.44, half * 2, 0x34343a);
        addStrip(0, center + track, half * 2, 0.44, 0x34343a);
      }
      // A darker, grittier band where the tarmac meets the kerb.
      for (const side of [-1, 1]) {
        addStrip(center + side * 8.52, 0, 0.9, half * 2, 0x232327);
        addStrip(0, center + side * 8.52, half * 2, 0.9, 0x232327);
      }
    }
    if (!wear.length) return;
    const positions = [];
    const normals = [];
    const colors = [];
    const color = new THREE.Color();
    for (const strip of wear) {
      const hw = strip.width / 2;
      const hl = strip.length / 2;
      const x0 = strip.x - hw;
      const x1 = strip.x + hw;
      const z0 = strip.z - hl;
      const z1 = strip.z + hl;
      const y = 0.0235;
      const quad = [
        x0, y, z0, x1, y, z0, x1, y, z1,
        x0, y, z0, x1, y, z1, x0, y, z1,
      ];
      positions.push(...quad);
      for (let i = 0; i < 6; i += 1) normals.push(0, 1, 0);
      color.setHex(strip.color);
      for (let i = 0; i < 6; i += 1) colors.push(color.r, color.g, color.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.34, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.wear = mesh;
  }

  buildPaint() {
    const paint = [];
    const centers = [];
    for (let i = 0; i < 8; i += 1) centers.push((i - 3.5) * config.pitch);
    const half = 338;
    const dashLength = 3.2;
    const dashGap = 6.8;

    const addBar = (x, z, width, length) => {
      paint.push({ x, z, width, length, color: 0xded8c6 });
    };

    // Twin centre lines, broken for every junction.
    for (const center of centers) {
      for (let z = -half; z < half; z += 3) {
        const nearJunction = centers.some((other) => Math.abs(z - other) < 12);
        if (nearJunction) continue;
        paint.push({ x: center - 0.2, z, width: 0.13, length: 3, color: 0xd8b34c });
        paint.push({ x: center + 0.2, z, width: 0.13, length: 3, color: 0xd8b34c });
      }
      for (let x = -half; x < half; x += 3) {
        const nearJunction = centers.some((other) => Math.abs(x - other) < 12);
        if (nearJunction) continue;
        paint.push({ x, z: center - 0.2, width: 3, length: 0.13, color: 0xd8b34c });
        paint.push({ x, z: center + 0.2, width: 3, length: 0.13, color: 0xd8b34c });
      }
    }

    // Lane dividers: two dashed lines either side of each centre line.
    for (const center of centers) {
      for (const offset of [-4.55, 4.55]) {
        for (let z = -half; z < half; z += dashLength + dashGap) {
          if (centers.some((other) => Math.abs(z + dashLength / 2 - other) < 11)) continue;
          addBar(center + offset, z + dashLength / 2, 0.14, dashLength);
        }
        for (let x = -half; x < half; x += dashLength + dashGap) {
          if (centers.some((other) => Math.abs(x + dashLength / 2 - other) < 11)) continue;
          addBar(x + dashLength / 2, center + offset, dashLength, 0.14);
        }
      }
    }

    // Zebra crossings and stop bars on all four approaches of every junction.
    for (const cx of centers) {
      for (const cz of centers) {
        for (const side of [-1, 1]) {
          for (let i = 0; i < 6; i += 1) {
            const along = -7.4 + i * 2.95;
            addBar(cx + along, cz + side * 11.6, 0.5, 3.1);
            addBar(cx + side * 11.6, cz + along, 3.1, 0.5);
          }
          addBar(cx + side * 14.4, cz + side * 0.5, 0.34, 8.6);
          addBar(cx + side * 0.5, cz + side * 14.4, 8.6, 0.34);
        }
      }
    }

    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.82, metalness: 0, color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geometry, material, paint.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < paint.length; i += 1) {
      const bar = paint[i];
      dummy.position.set(bar.x, 0.033, bar.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(bar.width, 1, bar.length);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.setHex(bar.color);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.paint = mesh;
  }
}
