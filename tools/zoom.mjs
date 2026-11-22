// Crop and upscale a region of an existing JPEG with ImageMagick, so the vision tool can judge
// small details. Reads the saved file, not the canvas (the WebGL buffer is not preserved).
// Run: node tools/zoom.mjs <image> <x> <y> <w> <h> <outfile> [scale]
import { execFileSync } from 'node:child_process';

const [image, x, y, w, h, out, scale = '3'] = process.argv.slice(2);
if (!image || !out) {
  console.error('usage: node tools/zoom.mjs <image> <x> <y> <w> <h> <outfile> [scale]');
  process.exit(1);
}
const factor = Number(scale);
execFileSync('convert', [
  image,
  '-crop', `${w}x${h}+${x}+${y}`,
  '+repage',
  '-resize', `${Math.round(Number(w) * factor)}x${Math.round(Number(h) * factor)}`,
  '-quality', '94',
  out,
]);
console.log(out);
