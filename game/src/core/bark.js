// Cheap bark: vertical fibrous streaks over a warm brown base, tiled along the trunk.
const THREE = globalThis.THREE;
let cached = null;

export function barkTexture() {
  if (cached) return cached;
  const element = document.createElement('canvas');
  element.width = 128;
  element.height = 256;
  const context = element.getContext('2d');
  let state = 0x1234;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  context.fillStyle = '#8a7150';
  context.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 220; i += 1) {
    const x = random() * 128;
    const shade = 70 + Math.floor(random() * 80);
    context.strokeStyle = `rgba(${shade},${Math.floor(shade * 0.8)},${Math.floor(shade * 0.55)},${0.15 + random() * 0.35})`;
    context.lineWidth = 1 + random() * 3;
    context.beginPath();
    context.moveTo(x, 0);
    let offset = x;
    for (let y = 0; y <= 256; y += 16) {
      offset += (random() - 0.5) * 4;
      context.lineTo(offset, y);
    }
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(element);
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  else texture.encoding = THREE.sRGBEncoding;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 4);
  texture.anisotropy = 8;
  cached = texture;
  return texture;
}
