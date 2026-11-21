import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:8080/?shot=cover&seed=1&capture=1', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.__SHOT_READY === true', null, { timeout: 180000 });
const out = await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  return {
    camera: g.camera.position.toArray().map((v) => Math.round(v)),
    cars: g.traffic.cars.slice(0, 12).map((c) => ({ x: Math.round(c.x), z: Math.round(c.z), s: Math.round(c.s), speed: Number(c.speed.toFixed(1)), stole: c.stolen })),
    peds: g.pedestrians.peds.slice(0, 10).map((p) => ({ x: Math.round(p.x), z: Math.round(p.z), kind: p.kind, on: p.override })),
    vehicle: g.vehicle.pos.toArray().map((v) => Math.round(v)),
    player: g.player.pos.toArray().map((v) => Math.round(v)),
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
