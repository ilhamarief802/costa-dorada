// Sky dome, sun, moon, distant ridges and the shadow rig. Two looks share one shader: a hazy
// golden hour and a clear tropical night. The dome rides the camera so its far wall can never
// be clipped by the camera's far plane (the bug that used to punch a black slab through the
// frame), and a ring of low ridges gives the horizon real terrain instead of empty haze.
import config from '../core/config.js';
import { glowTexture } from '../core/assets.js';

const THREE = globalThis.THREE;

const vertexShader = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uHaze;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform vec3 uCloudColor;
  uniform float uNight;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float height = max(dir.y, -0.12);
    float gradient = pow(clamp(height, 0.0, 1.0), 0.33);
    vec3 color = mix(uHorizon, uTop, gradient);
    float haze = 1.0 - smoothstep(0.0, 0.12, abs(height));
    color = mix(color, uHaze, haze * 0.4);

    float sun = max(dot(dir, uSunDir), 0.0);
    float disc = smoothstep(0.99935, 0.99982, sun);
    float glow = pow(sun, 7.0) * 0.42 + pow(sun, 60.0) * 0.9 + pow(sun, 650.0) * 1.5;
    // A broad low-sun wash so the sky behind the skyline brightens toward the light.
    float wash = pow(max(dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0), 3.0)
      * (1.0 - smoothstep(0.0, 0.42, height)) * 0.5;
    color += uSunColor * (glow + wash) * (1.0 - uNight * 0.88);
    color = mix(color, uSunColor * 1.05, disc * (1.0 - uNight) * 0.8);

    float moon = max(dot(dir, uMoonDir), 0.0);
    float moonDisc = smoothstep(0.99955, 0.99985, moon);
    color += vec3(0.72, 0.8, 0.95) * pow(moon, 380.0) * uNight * 0.45;
    color = mix(color, vec3(0.92, 0.94, 0.98), moonDisc * uNight * 0.9);

    if (height > -0.02) {
      vec2 cloudUv = dir.xz / (abs(dir.y) + 0.24) * 0.85;
      vec2 drift = vec2(uTime * 0.004, uTime * 0.0016);
      float billow = fbm(cloudUv * 1.05 + drift);
      float detail = fbm(cloudUv * 3.1 - drift * 1.7);
      float band = smoothstep(0.02, 0.34, height) * (1.0 - smoothstep(0.55, 0.95, height) * 0.6);
      float cover = smoothstep(0.58, 0.82, billow * 0.74 + detail * 0.32);
      vec3 litCloud = mix(uCloudColor, uSunColor * 1.15, pow(sun, 4.0) * (1.0 - uNight) * 0.85);
      color = mix(color, litCloud, cover * band * 0.68);
      float cirrus = smoothstep(0.52, 0.74, fbm(vec2(cloudUv.x * 0.45, cloudUv.y * 2.8) + drift * 2.2));
      color = mix(color, mix(uCloudColor, uSunColor, 0.45), cirrus * band * 0.3);
    }

    if (uNight > 0.5) {
      vec2 starUv = floor(dir.xz * 240.0 + dir.y * 60.0);
      float star = step(0.9975, hash(starUv));
      float twinkle = 0.6 + 0.4 * sin(uTime * 2.2 + hash(starUv + 9.0) * 30.0);
      color += vec3(0.85, 0.9, 1.0) * star * twinkle * smoothstep(0.05, 0.35, dir.y) * 0.85;
    }

    if (dir.y < -0.02) {
      color = mix(color, vec3(0.055, 0.075, 0.09), smoothstep(0.0, -0.12, dir.y));
    }

    gl_FragColor = vec4(color, 1.0);
    // Ordered-ish dither kills the banding a smooth two-stop gradient shows at 8 bits.
    float dither = (hash(gl_FragCoord.xy * 0.71) - 0.5) / 180.0;
    gl_FragColor.rgb += dither;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export default class Sky {
  constructor(plan, scene, camera) {
    this.plan = plan;
    this.scene = scene;
    this.camera = camera ?? null;
    this.group = new THREE.Group();
    this.group.name = 'sky';
    this.period = 'golden';
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3(-0.35, 0.55, 0.55).normalize();
    this.focus = new THREE.Vector3();
    this.uniforms = {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uHaze: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(-0.72, 0.18, -0.67).normalize() },
      uMoonDir: { value: this.moonDir },
      uCloudColor: { value: new THREE.Color() },
      uNight: { value: 0 },
      uTime: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    // Radius comfortably inside the 1400 m far plane and re-centred on the camera every frame.
    this.radius = 1000;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 40, 24), material);
    dome.frustumCulled = false;
    dome.renderOrder = -100;
    this.group.add(dome);
    this.dome = dome;

    this.haloMaterial = new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,214,156,0.85)', 'rgba(255,150,70,0)'),
      color: 0xffc27a,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.halo = new THREE.Sprite(this.haloMaterial);
    this.halo.scale.set(240, 240, 1);
    this.halo.renderOrder = -99;
    this.group.add(this.halo);

    this.buildRidges();

    this.sun = new THREE.DirectionalLight(0xffc382, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -58;
    this.sun.shadow.camera.right = 58;
    this.sun.shadow.camera.top = 58;
    this.sun.shadow.camera.bottom = -58;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 320;
    this.sun.shadow.bias = -0.00022;
    this.sun.shadow.normalBias = 0.028;
    this.sun.shadow.radius = 2.4;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xa8c8e4, 0x6b5337, 0.85);
    scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.16);
    scene.add(this.ambient);

    this.moon = new THREE.DirectionalLight(0x9dbcff, 0);
    this.moon.position.set(80, 160, 120);
    scene.add(this.moon);

    this.fill = new THREE.DirectionalLight(0x9fb8d8, 0.5);
    scene.add(this.fill);
    scene.add(this.fill.target);

    this.scene.fog = new THREE.FogExp2(0xffffff, config.fog.golden);
    this.setPeriod('golden');
  }

  /**
   * Two concentric rings of low coastal ridges, built once, sitting inside the dome. They are
   * real lit geometry with vertex colours and take the scene fog, so the horizon reads as hills
   * fading into the sea haze instead of a flat gradient.
   */
  buildRidges() {
    this.ridgeGroup = new THREE.Group();
    this.ridgeGroup.name = 'ridges';
    const counters = new THREE.Color(0x30404a);
    const sunlit = new THREE.Color(0x8f7a63);
    const rings = [
      { radius: 660, height: 74, teeth: 46, base: 0.55, tint: 0.62 },
      { radius: 900, height: 108, teeth: 34, base: 0.35, tint: 0.4 },
    ];
    for (const ring of rings) {
      const positions = [];
      const colors = [];
      const normals = [];
      const color = new THREE.Color();
      const step = (Math.PI * 2) / ring.teeth;
      for (let i = 0; i < ring.teeth; i += 1) {
        const a0 = i * step;
        const a1 = a0 + step;
        // Seeded, not random: the same silhouette on every load.
        const h0 = ring.height * (ring.base + 0.45 * (0.5 + 0.5 * Math.sin(i * 2.399 + ring.radius)));
        const h1 = ring.height * (ring.base + 0.45 * (0.5 + 0.5 * Math.sin((i + 1) * 2.399 + ring.radius)));
        const r = ring.radius;
        const p = (a, h) => [Math.cos(a) * r, h, Math.sin(a) * r];
        const left = p(a0, h0);
        const right = p(a1, h1);
        const lowL = p(a0, -18);
        const lowR = p(a1, -18);
        // Two triangles, wound so the inward face is front.
        const tri = [left, lowL, right, right, lowL, lowR];
        for (const v of tri) {
          positions.push(v[0], v[1], v[2]);
          normals.push(-Math.cos((a0 + a1) / 2), 0.18, -Math.sin((a0 + a1) / 2));
        }
        // Peak is warmer where the sun catches it, base sinks into the marine haze.
        const peak = counters.clone().lerp(sunlit, ring.tint * 0.7);
        for (let k = 0; k < 6; k += 1) {
          color.copy(k === 0 || k === 2 || k === 5 ? peak : counters);
          colors.push(color.r, color.g, color.b);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        metalness: 0,
        flatShading: true,
        fog: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.receiveShadow = false;
      mesh.castShadow = false;
      mesh.userData.tint = ring.tint;
      this.ridgeGroup.add(mesh);
    }
    this.group.add(this.ridgeGroup);
  }

  setPeriod(period) {
    this.period = period;
    const night = period === 'night';
    const look = night ? config.sky.night : config.sky.golden;
    this.uniforms.uTop.value.set(look.top);
    this.uniforms.uHorizon.value.set(look.horizon);
    this.uniforms.uHaze.value.set(look.haze);
    this.uniforms.uSunColor.value.set(look.sunColor);
    this.uniforms.uCloudColor.value.set(look.cloudColor);
    this.uniforms.uNight.value = night ? 1 : 0;
    if (night) {
      this.sunDir.set(0.34, 0.52, 0.58).normalize();
    } else {
      this.sunDir.set(-0.62, 0.185, 0.762).normalize();
    }
    this.sun.color.set(look.sunColor);
    this.sun.intensity = look.sunIntensity;
    this.hemi.color.set(look.hemiSky);
    this.hemi.groundColor.set(look.hemiGround);
    this.hemi.intensity = look.hemiIntensity;
    this.ambient.color.set(look.ambient);
    this.ambient.intensity = look.ambientIntensity;
    this.fill.color.set(night ? 0x5f7db8 : 0xd7bfa4);
    this.fill.intensity = night ? 0.24 : 0.5;
    this.moon.intensity = night ? 0.55 : 0;
    this.scene.fog.color.set(look.fog);
    this.scene.fog.density = night ? config.fog.night : config.fog.golden;
    this.uniforms.uSunDir.value.copy(this.sunDir);
    this.uniforms.uTime.value = 0;
    this.haloMaterial.opacity = night ? 0 : 0.42;
    this.haloMaterial.color.set(night ? 0xbcd0ff : 0xffc27a);
    // Ridges sit a shade under the horizon colour at night and warm at golden hour.
    for (const mesh of this.ridgeGroup.children) {
      mesh.material.color.set(night ? 0x101a26 : 0xffffff);
      mesh.material.emissive.set(night ? 0x0a1018 : 0x000000);
    }
  }

  update(dt, focus) {
    this.focus.copy(focus);
    this.uniforms.uTime.value += dt;
    // Ride the camera: this is what keeps the dome's far wall inside the far plane.
    if (this.camera) this.dome.position.copy(this.camera.position);
    else this.dome.position.set(focus.x, 0, focus.z);
    this.ridgeGroup.position.set(focus.x, 0, focus.z);
    this.halo.position.set(focus.x + this.sunDir.x * 760, this.sunDir.y * 760, focus.z + this.sunDir.z * 760);
    const lightPosition = new THREE.Vector3().copy(this.sunDir).multiplyScalar(260).add(focus);
    this.sun.position.copy(lightPosition);
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.target.updateMatrixWorld();
    this.moon.position.set(focus.x + 120, 190, focus.z + 160);
    this.moon.target.position.set(focus.x, 0, focus.z);
    this.moon.target.updateMatrixWorld();
    this.fill.position.set(focus.x + 130, focus.y + 95, focus.z + 175);
    this.fill.target.position.set(focus.x, 0, focus.z);
    this.fill.target.updateMatrixWorld();
  }

  applyExposure(renderer) {
    renderer.toneMappingExposure = this.period === 'night' ? 0.92 : 1.02;
  }
}
