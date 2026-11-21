// Diagnostic: project the street furniture that should be visible in the cover frame.
import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';

const browser = await chromium.launch({
  executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8080/?shot=cover&seed=1&capture=1', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.__SHOT_READY === true', null, { timeout: 180000 });
const report = await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  const T = window.THREE;
  const camera = g.camera;
  const project = (x, y, z) => {
    const v = new T.Vector3(x, y, z).project(camera);
    return { x: Math.round((v.x + 1) * 640), y: Math.round((1 - v.y) * 360), z: Number(v.z.toFixed(3)) };
  };
  const host = g.plan.buildings.filter((b) => b.block.bx === 4 && b.block.bz === 6 && b.street === 'w');
  const near = (list) => list
    .filter((item) => Math.abs(item.x - 57) < 15 && Math.abs(item.z - 300) < 40)
    .map((item) => ({ ...item, screen: project(item.x, item.y ?? 0.5, item.z) }));
  return {
    camera: camera.position.toArray(),
    host: host.map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d, h: b.h, screen: project(b.x, b.h / 2, b.z) })),
    planters: near(g.plan.planters),
    cafes: near(g.plan.cafes),
    benches: near(g.plan.benches),
    bins: near(g.plan.bins),
    hydrants: near(g.plan.hydrants),
    signs: near(g.plan.signs),
    car: { screen: project(g.vehicle.pos.x, 0.8, g.vehicle.pos.z) },
    peds: g.pedestrians.walkers.map((w) => w.block ? project(w.block.x, 1, w.z ?? 0) : null),
  };
});
console.log(JSON.stringify(report, null, 2));
await browser.close();
