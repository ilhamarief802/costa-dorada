// The bay. A single large shader plane: two crossing swells, a turquoise-to-deep gradient,
// a sun glint path and a foaming band where the beach runs under it.
import config from '../core/config.js';
import { clamp } from '../core/math.js';

const THREE = globalThis.THREE;

const vertexShader = `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vWave;

  void main() {
    vec3 p = position;
    float w1 = sin(p.x * 0.055 + uTime * 0.85) * 0.32;
    float w2 = sin(p.y * 0.09 - uTime * 0.62 + p.x * 0.021) * 0.18;
    float w3 = sin(p.y * 0.24 + uTime * 1.6) * 0.06;
    p.z += w1 + w2 + w3;
    float dx = cos(p.x * 0.055 + uTime * 0.85) * 0.055 * 0.32 + cos(p.y * 0.09 - uTime * 0.62 + p.x * 0.021) * 0.021 * 0.18;
    float dy = cos(p.y * 0.09 - uTime * 0.62 + p.x * 0.021) * 0.09 * 0.18 + cos(p.y * 0.24 + uTime * 1.6) * 0.24 * 0.06;
    vNormal = normalize(vec3(-dx, 1.0, dy));
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vWave = w1 + w2 + w3;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uNight;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vWave;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 normal = normalize(vNormal);
    float facing = clamp(dot(normal, view), 0.0, 1.0);
    float depthMix = smoothstep(0.02, 0.5, facing);
    vec3 color = mix(uShallow, uDeep, depthMix);

    vec3 halfDir = normalize(uSunDir + view);
    float spec = pow(max(dot(normal, halfDir), 0.0), 220.0) * 2.2;
    float broad = pow(max(dot(normal, halfDir), 0.0), 26.0) * 0.28;
    color += uSunColor * (spec + broad) * (1.0 - uNight * 0.82);

    float shore = smoothstep(392.0, 356.0, vWorld.z);
    float ripple = noise(vec2(vWorld.x * 0.32 + uTime * 0.5, vWorld.z * 0.5 - uTime * 0.35));
    float foam = smoothstep(0.62, 0.92, shore + ripple * 0.24) * 0.8;
    float lines = smoothstep(0.55, 0.95, noise(vec2(vWorld.x * 0.55, vWorld.z * 1.4 - uTime * 0.8)));
    color = mix(color, uFoam, foam * (0.55 + lines * 0.45));

    float dist = length(cameraPosition - vWorld);
    float fog = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
    color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));
    color += uFoam * foam * 0.06;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export default class Water {
  constructor(plan) {
    this.plan = plan;
    this.group = new THREE.Group();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(0x0d4c5c) },
        uShallow: { value: new THREE.Color(0x2f9aa0) },
        uFoam: { value: new THREE.Color(0xe8f2ea) },
        uSunColor: { value: new THREE.Color(config.sky.golden.sunColor) },
        uSunDir: { value: new THREE.Vector3(-0.8, 0.2, -0.45).normalize() },
        uFogColor: { value: new THREE.Color(config.sky.golden.fog) },
        uFogDensity: { value: config.fog.golden },
        uNight: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
    });
    const geometry = new THREE.PlaneGeometry(1700, 900, 120, 70);
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, config.waterLevel, 340 + 450);
    this.group.add(mesh);
    this.mesh = mesh;
    // The sky owns the sun; the water reads the same direction so the specular line and the sun
    // disc always agree. The plan is the shared bus between the two.
    this.plan.waterUniforms = this.material.uniforms;

    const underline = new THREE.Mesh(
      new THREE.PlaneGeometry(1700, 900),
      new THREE.MeshBasicMaterial({ color: 0x083d4a }),
    );
    underline.rotation.x = -Math.PI / 2;
    underline.position.set(0, config.waterLevel - 0.7, 790);
    this.group.add(underline);
  }

  setPeriod(period, sunDir) {
    const night = period === 'night';
    this.material.uniforms.uNight.value = night ? 1 : 0;
    this.material.uniforms.uDeep.value.set(night ? 0x061722 : 0x0d4c5c);
    this.material.uniforms.uShallow.value.set(night ? 0x0d2f3c : 0x2f9aa0);
    this.material.uniforms.uFoam.value.set(night ? 0x5b7180 : 0xe8f2ea);
    this.material.uniforms.uSunColor.value.set(night ? 0x8fa8d8 : config.sky.golden.sunColor);
    this.material.uniforms.uSunDir.value.copy(sunDir);
    this.material.uniforms.uFogColor.value.set(night ? config.sky.night.fog : config.sky.golden.fog);
    this.material.uniforms.uFogDensity.value = night ? config.fog.night : config.fog.golden;
  }

  update(time) {
    this.material.uniforms.uTime.value = time;
  }
}
