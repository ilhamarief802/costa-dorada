// Generated textures and shared materials. Everything here is drawn once into an offscreen
// canvas at boot: no image files, no network, and the same pixels on every machine.
import * as math from './math.js';

const THREE = globalThis.THREE;

const signs = new Map();

function canvas(width, height) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return element;
}

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function texture(element, repeatX = 1, repeatY = 1) {
  const result = new THREE.CanvasTexture(element);
  if (THREE.SRGBColorSpace) result.colorSpace = THREE.SRGBColorSpace;
  else result.encoding = THREE.sRGBEncoding;
  result.wrapS = THREE.RepeatWrapping;
  result.wrapT = THREE.RepeatWrapping;
  result.repeat.set(repeatX, repeatY);
  result.anisotropy = 8;
  return result;
}

/** Weathered asphalt: aggregate speckle, patchy repairs and hairline cracks. */
export function asphaltTexture() {
  if (signs.has('asphalt')) return signs.get('asphalt');
  const size = 512;
  const element = canvas(size, size);
  const context = element.getContext('2d');
  const random = seeded(0x51a7);
  context.fillStyle = '#4b4b50';
  context.fillRect(0, 0, size, size);
  for (let i = 0; i < 16000; i += 1) {
    const shade = 52 + Math.floor(random() * 46);
    context.fillStyle = `rgba(${shade},${shade},${shade + 3},${0.14 + random() * 0.3})`;
    const radius = 0.6 + random() * 1.8;
    context.fillRect(random() * size, random() * size, radius, radius);
  }
  for (let i = 0; i < 26; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const w = 40 + random() * 130;
    const h = 30 + random() * 110;
    context.fillStyle = `rgba(${random() < 0.5 ? 38 : 92},${random() < 0.5 ? 38 : 88},${random() < 0.5 ? 43 : 92},0.08)`;
    context.beginPath();
    context.ellipse(x, y, w, h, random() * 3, 0, Math.PI * 2);
    context.fill();
  }
  context.strokeStyle = 'rgba(24,24,27,0.35)';
  context.lineWidth = 1;
  for (let i = 0; i < 18; i += 1) {
    context.beginPath();
    let x = random() * size;
    let y = random() * size;
    context.moveTo(x, y);
    for (let s = 0; s < 6; s += 1) {
      x += (random() - 0.5) * 60;
      y += (random() - 0.5) * 60;
      context.lineTo(x, y);
    }
    context.stroke();
  }
  signs.set('asphalt', texture(element, 64, 64));
  return signs.get('asphalt');
}

/** Pale concrete slabs for sidewalks and plazas. */
export function pavingTexture() {
  if (signs.has('paving')) return signs.get('paving');
  const size = 512;
  const element = canvas(size, size);
  const context = element.getContext('2d');
  const random = seeded(0x7c31);
  context.fillStyle = '#e6ddcc';
  context.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i += 1) {
    const shade = 170 + Math.floor(random() * 55);
    context.fillStyle = `rgba(${shade},${shade - 4},${shade - 14},${0.12 + random() * 0.22})`;
    context.fillRect(random() * size, random() * size, 1.4, 1.4);
  }
  context.strokeStyle = 'rgba(96,89,78,0.42)';
  context.lineWidth = 2;
  for (let i = 0; i <= 16; i += 1) {
    const at = (i / 16) * size;
    context.beginPath();
    context.moveTo(at, 0);
    context.lineTo(at, size);
    context.stroke();
    context.beginPath();
    context.moveTo(0, at);
    context.lineTo(size, at);
    context.stroke();
  }
  context.strokeStyle = 'rgba(238,232,220,0.22)';
  context.lineWidth = 1;
  for (let i = 0; i <= 16; i += 1) {
    const at = (i / 16) * size + 2;
    context.beginPath();
    context.moveTo(at, 0);
    context.lineTo(at, size);
    context.stroke();
    context.beginPath();
    context.moveTo(0, at);
    context.lineTo(size, at);
    context.stroke();
  }
  signs.set('paving', texture(element, 3, 3));
  return signs.get('paving');
}

/** Fine sand with wind ripples. */
export function sandTexture() {
  if (signs.has('sand')) return signs.get('sand');
  const size = 256;
  const element = canvas(size, size);
  const context = element.getContext('2d');
  const random = seeded(0x2bd9);
  context.fillStyle = '#f0e4cd';
  context.fillRect(0, 0, size, size);
  for (let i = 0; i < 12000; i += 1) {
    const shade = 190 + Math.floor(random() * 50);
    context.fillStyle = `rgba(${shade},${shade - 20},${shade - 55},${0.12 + random() * 0.25})`;
    context.fillRect(random() * size, random() * size, 1.2, 1.2);
  }
  context.strokeStyle = 'rgba(150,126,92,0.18)';
  for (let i = 0; i < 26; i += 1) {
    context.beginPath();
    for (let x = 0; x <= size; x += 8) {
      const y = i * 10 + Math.sin(x * 0.05 + i) * 3;
      if (x === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
  signs.set('sand', texture(element, 150, 150));
  return signs.get('sand');
}

/** Warm stucco grain for tower and block walls, kept light so instance colour tints it. */
export function stuccoTexture() {
  if (signs.has('stucco')) return signs.get('stucco');
  const size = 256;
  const element = canvas(size, size);
  const context = element.getContext('2d');
  const random = seeded(0x99af);
  context.fillStyle = '#f1ece2';
  context.fillRect(0, 0, size, size);
  for (let i = 0; i < 14000; i += 1) {
    const shade = 205 + Math.floor(random() * 40);
    context.fillStyle = `rgba(${shade},${shade - 3},${shade - 10},${0.1 + random() * 0.18})`;
    context.fillRect(random() * size, random() * size, 1.3, 1.3);
  }
  context.strokeStyle = 'rgba(170,162,148,0.12)';
  for (let i = 0; i < 20; i += 1) {
    context.beginPath();
    context.moveTo(random() * size, 0);
    context.lineTo(random() * size, size);
    context.stroke();
  }
  signs.set('stucco', texture(element, 2, 2));
  return signs.get('stucco');
}


/** Soft radial falloff used for lamp pools, headlight spill and the sun bloom sprite. */
export function glowTexture(inner = 'rgba(255,214,150,0.95)', outer = 'rgba(255,180,90,0)') {
  const key = `${inner}|${outer}`;
  if (signs.has(key)) return signs.get(key);
  const element = canvas(128, 128);
  const context = element.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 62);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.36, inner.replace(/[\d.]+\)$/, '0.45)'));
  gradient.addColorStop(1, outer);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(element);
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  else texture.encoding = THREE.sRGBEncoding;
  signs.set(key, texture);
  return texture;
}

/** A neon or painted shop sign with a heavy condensed face and a hairline frame. */
export function signTexture(text, options = {}) {
  const key = `${text}|${JSON.stringify(options)}`;
  if (signs.has(key)) return signs.get(key);
  const vertical = Boolean(options.vertical);
  const width = vertical ? 256 : 1024;
  const height = vertical ? 1024 : 256;
  const element = canvas(width, height);
  const context = element.getContext('2d');
  const background = options.background ?? '#161a20';
  const ink = options.ink ?? '#ffcf87';
  const glow = options.glow ?? 'rgba(255,180,90,0.55)';
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = options.frame ?? 'rgba(255,222,170,0.5)';
  context.lineWidth = 10;
  context.strokeRect(14, 14, width - 28, height - 28);
  context.shadowColor = glow;
  context.shadowBlur = 34;
  context.fillStyle = ink;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  if (vertical) {
    const letters = text.split('');
    const size = Math.min(150, Math.floor((height - 120) / letters.length));
    context.font = `800 ${size}px "Arial Narrow", "Helvetica Neue", sans-serif`;
    const start = height / 2 - ((letters.length - 1) * size * 1.02) / 2;
    letters.forEach((letter, index) => {
      context.fillText(letter, width / 2, start + index * size * 1.02);
    });
  } else {
    let size = 132;
    context.font = `800 ${size}px "Arial Narrow", "Helvetica Neue", sans-serif`;
    while (context.measureText(text).width > width - 110 && size > 40) {
      size -= 4;
      context.font = `800 ${size}px "Arial Narrow", "Helvetica Neue", sans-serif`;
    }
    context.fillText(text, width / 2, height / 2 + 6);
  }
  const texture = new THREE.CanvasTexture(element);
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  else texture.encoding = THREE.sRGBEncoding;
  texture.anisotropy = 4;
  signs.set(key, texture);
  return texture;
}

export function signMaterial(text, options = {}) {
  return new THREE.MeshBasicMaterial({
    map: signTexture(text, options),
    transparent: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

/** A verticated glow card for signage that should read as self-lit at night. */
export function glowCard(color, size = 1) {
  const material = new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size, size, 1);
  return sprite;
}

export function contactShadowTexture() {
  if (signs.has('contact')) return signs.get('contact');
  const element = canvas(128, 128);
  const context = element.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 6, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(element);
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  else texture.encoding = THREE.sRGBEncoding;
  signs.set('contact', texture);
  return texture;
}

/** A small stamped plate for the coupe's rear bumper. */
export function plateTexture() {
  if (signs.has('plate')) return signs.get('plate');
  const element = canvas(256, 64);
  const context = element.getContext('2d');
  context.fillStyle = '#d9d2ba';
  context.fillRect(0, 0, 256, 64);
  context.strokeStyle = '#25231d';
  context.lineWidth = 6;
  context.strokeRect(4, 4, 248, 56);
  context.fillStyle = '#23211b';
  context.font = '800 38px "Arial Narrow", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('CD-482', 128, 35);
  const result = new THREE.CanvasTexture(element);
  if (THREE.SRGBColorSpace) result.colorSpace = THREE.SRGBColorSpace;
  else result.encoding = THREE.sRGBEncoding;
  result.anisotropy = 8;
  signs.set('plate', result);
  return result;
}

/** An equirectangular sky used only to give glass and paint something to reflect. */
export function environmentTexture() {
  const element = canvas(1024, 512);
  const context = element.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#22496f');
  gradient.addColorStop(0.4, '#7c94a6');
  gradient.addColorStop(0.5, '#f4b274');
  gradient.addColorStop(0.56, '#c99a72');
  gradient.addColorStop(0.68, '#514237');
  gradient.addColorStop(1, '#1a1714');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1024, 512);
  const sun = context.createRadialGradient(180, 258, 4, 180, 258, 96);
  sun.addColorStop(0, 'rgba(255,248,222,1)');
  sun.addColorStop(0.18, 'rgba(255,225,170,0.95)');
  sun.addColorStop(0.5, 'rgba(255,186,116,0.32)');
  sun.addColorStop(1, 'rgba(255,170,90,0)');
  context.fillStyle = sun;
  context.fillRect(0, 0, 1024, 512);
  const result = new THREE.CanvasTexture(element);
  if (THREE.SRGBColorSpace) result.colorSpace = THREE.SRGBColorSpace;
  else result.encoding = THREE.sRGBEncoding;
  result.mapping = THREE.EquirectangularReflectionMapping;
  return result;
}

export function makeSkyTexture() {
  const element = canvas(512, 512);
  const context = element.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#4e7fa3');
  gradient.addColorStop(0.5, '#9fb9c1');
  gradient.addColorStop(0.78, '#f0c894');
  gradient.addColorStop(1, '#f7d6a2');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  const texture = new THREE.CanvasTexture(element);
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  else texture.encoding = THREE.sRGBEncoding;
  return texture;
}

export function dispose() {
  for (const texture of signs.values()) texture.dispose();
  signs.clear();
}

export { math };
export default {
  glowTexture,
  signTexture,
  signMaterial,
  glowCard,
  contactShadowTexture,
  makeSkyTexture,
  asphaltTexture,
  pavingTexture,
  sandTexture,
  stuccoTexture,
  environmentTexture,
  plateTexture,
  dispose,
};
