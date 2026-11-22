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
  // A second, finer pass of aggregate: at the shot cameras' distance the first pass alone
  // averages into flat grey, and the whole road reads as painted card.
  for (let i = 0; i < 26000; i += 1) {
    const shade = 44 + Math.floor(random() * 58);
    context.fillStyle = `rgba(${shade},${shade},${shade + 2},${0.18 + random() * 0.34})`;
    context.fillRect(random() * size, random() * size, 1, 1);
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
  signs.set('asphalt', texture(element, 132, 132));
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

/** A soft trapezoid of light for the road in front of a car at night. */
export function headlightConeTexture() {
  if (signs.has('headlight')) return signs.get('headlight');
  const element = canvas(128, 256);
  const context = element.getContext('2d');
  context.clearRect(0, 0, 128, 256);
  // The pool of light: bright and narrow at the bumper, wide and faint at the far edge.
  for (let y = 0; y < 256; y += 1) {
    const t = y / 255;
    const halfWidth = 22 + t * 46;
    const alpha = (1 - t) ** 1.5 * 0.9;
    const gradient = context.createLinearGradient(64 - halfWidth, 0, 64 + halfWidth, 0);
    gradient.addColorStop(0, 'rgba(255,220,170,0)');
    gradient.addColorStop(0.5, `rgba(255,226,182,${alpha})`);
    gradient.addColorStop(1, 'rgba(255,220,170,0)');
    context.fillStyle = gradient;
    context.fillRect(64 - halfWidth, y, halfWidth * 2, 1);
  }
  const texture = new THREE.CanvasTexture(element);
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  else texture.encoding = THREE.sRGBEncoding;
  signs.set('headlight', texture);
  return texture;
}

/**
 * A contact blob for the ground under every dynamic object. Two stacked falloffs: a tight
 * near-black core that sells the touch-down point, and a wide soft skirt for the ambient
 * occlusion. Alpha is deliberately high because it is multiplied by a low material opacity.
 */
export function contactShadowTexture() {
  if (signs.has('contact')) return signs.get('contact');
  const element = canvas(128, 128);
  const context = element.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 63);
  gradient.addColorStop(0, 'rgba(0,0,0,0.98)');
  gradient.addColorStop(0.28, 'rgba(0,0,0,0.86)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.52)');
  gradient.addColorStop(0.78, 'rgba(0,0,0,0.20)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(element);
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  else texture.encoding = THREE.sRGBEncoding;
  texture.anisotropy = 4;
  signs.set('contact', texture);
  return texture;
}

/**
 * A grimy square decal sheet for the road and pavement: tar patches, oil drips, gum, a drain
 * grate and scattered litter. Used as a small instanced stamp so the ground stops reading flat.
 */
export function grimeTexture() {
  if (signs.has('grime')) return signs.get('grime');
  const size = 256;
  const element = canvas(size, size);
  const context = element.getContext('2d');
  const random = seeded(0x3ce1);
  context.clearRect(0, 0, size, size);
  // Bitumen repair patches.
  for (let i = 0; i < 5; i += 1) {
    context.fillStyle = `rgba(${28 + random() * 14},${28 + random() * 14},${32 + random() * 14},${0.45 + random() * 0.35})`;
    context.beginPath();
    const cx = random() * size;
    const cy = random() * size;
    const r = 18 + random() * 46;
    for (let a = 0; a < 9; a += 1) {
      const ang = (a / 9) * Math.PI * 2;
      const rr = r * (0.62 + random() * 0.5);
      const px = cx + Math.cos(ang) * rr;
      const py = cy + Math.sin(ang) * rr;
      if (a === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();
  }
  // Oil and water stains.
  for (let i = 0; i < 12; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const r = 6 + random() * 22;
    const stain = context.createRadialGradient(x, y, 1, x, y, r);
    stain.addColorStop(0, 'rgba(14,13,16,0.5)');
    stain.addColorStop(1, 'rgba(14,13,16,0)');
    context.fillStyle = stain;
    context.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Drain grate.
  context.fillStyle = 'rgba(22,24,26,0.92)';
  context.fillRect(96, 180, 58, 34);
  context.fillStyle = 'rgba(62,66,68,0.9)';
  for (let i = 0; i < 6; i += 1) context.fillRect(100 + i * 9, 184, 5, 26);
  // Litter: wrappers and a flattened cup.
  const litter = ['rgba(226,214,186,0.85)', 'rgba(196,71,58,0.8)', 'rgba(180,196,170,0.8)', 'rgba(214,178,96,0.8)'];
  for (let i = 0; i < 16; i += 1) {
    context.fillStyle = litter[Math.floor(random() * litter.length)];
    const x = random() * size;
    const y = random() * size;
    context.save();
    context.translate(x, y);
    context.rotate(random() * 3.14);
    context.fillRect(-3, -2, 5 + random() * 5, 3 + random() * 3);
    context.restore();
  }
  // Hairline cracks.
  context.strokeStyle = 'rgba(20,20,23,0.45)';
  context.lineWidth = 1;
  for (let i = 0; i < 7; i += 1) {
    context.beginPath();
    let x = random() * size;
    let y = random() * size;
    context.moveTo(x, y);
    for (let s = 0; s < 5; s += 1) {
      x += (random() - 0.5) * 64;
      y += (random() - 0.5) * 64;
      context.lineTo(x, y);
    }
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(element);
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  else texture.encoding = THREE.sRGBEncoding;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  signs.set('grime', texture);
  return texture;
}

/**
 * A lit shopfront seen through glass: warm interior wash, shelves, a counter, silhouettes of
 * people inside. Tiled onto the ground-floor band of every street facade.
 */
export function storefrontTexture(variant = 0) {
  const key = `storefront${variant}`;
  if (signs.has(key)) return signs.get(key);
  const width = 512;
  const height = 256;
  const element = canvas(width, height);
  const context = element.getContext('2d');
  const random = seeded(0x7711 + variant * 977);
  const moods = [
    { wall: '#3a2415', lamp: '#ffca74', glow: 'rgba(255,196,110,0.55)' },
    { wall: '#152a2b', lamp: '#96e6d8', glow: 'rgba(140,230,215,0.45)' },
    { wall: '#2c1a2b', lamp: '#ffa0c4', glow: 'rgba(255,150,190,0.45)' },
    { wall: '#241d13', lamp: '#ffd9a0', glow: 'rgba(255,214,150,0.5)' },
  ];
  const mood = moods[variant % moods.length];
  context.fillStyle = mood.wall;
  context.fillRect(0, 0, width, height);
  // Warm interior wash from the ceiling lights.
  const wash = context.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, mood.glow);
  wash.addColorStop(0.55, 'rgba(0,0,0,0)');
  wash.addColorStop(1, 'rgba(0,0,0,0.35)');
  context.fillStyle = wash;
  context.fillRect(0, 0, width, height);
  // Ceiling strip lights.
  for (let i = 0; i < 4; i += 1) {
    context.fillStyle = mood.lamp;
    context.globalAlpha = 0.8;
    context.fillRect(30 + i * 122, 26, 84, 7);
    context.globalAlpha = 1;
  }
  // Back-wall shelving and goods.
  for (let i = 0; i < 3; i += 1) {
    const y = 78 + i * 46;
    context.fillStyle = 'rgba(0,0,0,0.32)';
    context.fillRect(18, y + 26, width - 36, 5);
    for (let j = 0; j < 26; j += 1) {
      context.fillStyle = `hsl(${Math.floor(random() * 360)},${28 + random() * 40}%,${34 + random() * 30}%)`;
      context.globalAlpha = 0.75;
      context.fillRect(22 + j * 18, y, 12, 22);
      context.globalAlpha = 1;
    }
  }
  // Counter.
  context.fillStyle = 'rgba(20,14,10,0.85)';
  context.fillRect(40, 176, width - 80, 52);
  context.fillStyle = 'rgba(255,226,180,0.3)';
  context.fillRect(44, 176, width - 88, 5);
  // Two silhouettes behind the counter.
  context.fillStyle = 'rgba(10,8,7,0.82)';
  for (const sx of [150, 330]) {
    context.beginPath();
    context.arc(sx, 132, 15, 0, Math.PI * 2);
    context.fill();
    context.fillRect(sx - 20, 146, 40, 34);
  }
  // Mullion frame between the panes.
  context.fillStyle = 'rgba(28,22,17,0.9)';
  context.fillRect(0, 0, 8, height);
  context.fillRect(width - 8, 0, 8, height);
  context.fillRect(width / 2 - 4, 0, 8, height);
  const result = new THREE.CanvasTexture(element);
  if (THREE.SRGBColorSpace) result.colorSpace = THREE.SRGBColorSpace;
  else result.encoding = THREE.sRGBEncoding;
  result.anisotropy = 4;
  signs.set(key, result);
  return result;
}

/** Candy-striped awning cloth for the shop canopies along the promenade. */
export function awningTexture() {
  if (signs.has('awning')) return signs.get('awning');
  const element = canvas(128, 128);
  const context = element.getContext('2d');
  context.fillStyle = '#f2e6cc';
  context.fillRect(0, 0, 128, 128);
  context.fillStyle = '#c4473a';
  for (let i = 0; i < 8; i += 1) context.fillRect(i * 16, 0, 8, 128);
  context.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 8; i += 1) context.fillRect(i * 16 + 8, 0, 2, 128);
  const texture = new THREE.CanvasTexture(element);
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  else texture.encoding = THREE.sRGBEncoding;
  signs.set('awning', texture);
  return texture;
}

/** Vertical neon blade sign, self-lit, for the night avenue. */
export function bladeSignTexture(text, hue = 190) {
  const key = `blade|${text}|${hue}`;
  if (signs.has(key)) return signs.get(key);
  const width = 128;
  const height = 512;
  const element = canvas(width, height);
  const context = element.getContext('2d');
  context.fillStyle = '#0a0d12';
  context.fillRect(0, 0, width, height);
  const ink = `hsl(${hue},92%,66%)`;
  context.strokeStyle = ink;
  context.lineWidth = 4;
  context.shadowColor = `hsl(${hue},100%,60%)`;
  context.shadowBlur = 18;
  context.strokeRect(8, 8, width - 16, height - 16);
  context.shadowBlur = 26;
  context.fillStyle = ink;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const letters = text.split('');
  const size = Math.min(74, Math.floor((height - 70) / Math.max(1, letters.length)));
  context.font = `800 ${size}px "Arial Narrow", "Helvetica Neue", sans-serif`;
  const start = height / 2 - ((letters.length - 1) * size * 1.03) / 2;
  letters.forEach((letter, index) => context.fillText(letter, width / 2, start + index * size * 1.03));
  const texture = new THREE.CanvasTexture(element);
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  else texture.encoding = THREE.sRGBEncoding;
  texture.anisotropy = 4;
  signs.set(key, texture);
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
  headlightConeTexture,
  grimeTexture,
  storefrontTexture,
  awningTexture,
  bladeSignTexture,
  makeSkyTexture,
  asphaltTexture,
  pavingTexture,
  sandTexture,
  stuccoTexture,
  environmentTexture,
  plateTexture,
  dispose,
};
