// Report the pixel footprint of the hero car on the 1280x720 frame, so framing is a number
// rather than an opinion. Run: node tools/footprint.mjs <shot>
import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';

const shot = process.argv[2] ?? 'cover';
const browser = await chromium.launch({
  executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:8080/?shot=${shot}&seed=1&capture=1`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.__SHOT_READY === true', null, { timeout: 180000 });

const report = await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  const T = window.THREE;
  const px = (x, y, z) => {
    const v = new T.Vector3(x, y, z).project(g.camera);
    return [(v.x + 1) / 2 * 1280, (1 - v.y) / 2 * 720];
  };
  const bounds = (points) => {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    return {
      x0: Math.round(Math.min(...xs)), x1: Math.round(Math.max(...xs)),
      y0: Math.round(Math.min(...ys)), y1: Math.round(Math.max(...ys)),
      w: Math.round(Math.max(...xs) - Math.min(...xs)),
      h: Math.round(Math.max(...ys) - Math.min(...ys)),
    };
  };
  // Hero car: eight corners of its 2.0 x 1.4 x 4.4 box in world space.
  const car = g.vehicle;
  const yaw = car.yaw;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const corners = [];
  for (const lx of [-1.0, 1.0]) {
    for (const ly of [0, 1.45]) {
      for (const lz of [-2.2, 2.2]) {
        corners.push(px(
          car.pos.x + lx * cos + lz * sin,
          car.pos.y + ly,
          car.pos.z - lx * sin + lz * cos,
        ));
      }
    }
  }
  const playerCorners = [];
  for (const lx of [-0.35, 0.35]) {
    for (const ly of [0, 1.85]) {
      for (const lz of [-0.3, 0.3]) {
        playerCorners.push(px(g.player.pos.x + lx, g.player.pos.y + ly, g.player.pos.z + lz));
      }
    }
  }
  const carBox = bounds(corners);
  const playerBox = bounds(playerCorners);
  return {
    car: carBox,
    carShareOfFrame: +(carBox.w / 1280 * 100).toFixed(1),
    player: playerBox,
    playerShareOfHeight: +(playerBox.h / 720 * 100).toFixed(1),
    calls: g.renderer.info.render.calls,
  };
});
console.log(JSON.stringify(report, null, 1));
await browser.close();
