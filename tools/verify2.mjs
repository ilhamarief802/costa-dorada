// Verification: project the cast into the shot frame and report what is actually on screen,
// plus key per-frame counts and any page errors.
import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';

const query = process.argv[2] ?? '?shot=cover&seed=1&capture=1';
const browser = await chromium.launch({
  executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const messages = [];
page.on('console', (m) => messages.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => messages.push(`pageerror: ${e.stack || e.message}`));
await page.goto(`http://localhost:8080/${query}`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.__SHOT_READY === true', null, { timeout: 180000 });
const report = await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  const T = window.THREE;
  const project = (x, y, z) => {
    const v = new T.Vector3(x, y, z).project(g.camera);
    return { x: Math.round((v.x + 1) * 640), y: Math.round((1 - v.y) * 360), z: v.z };
  };
  const visible = (p) => p.z < 1 && p.x >= 0 && p.x <= 1280 && p.y >= 0 && p.y <= 720;
  const cars = g.traffic.cars.map((car) => {
    const p = project(car.x, (g.plan.heightAt(car.x, car.z) ?? 0) + 0.8, car.z);
    return { ...p, on: visible(p), speed: Number(car.speed.toFixed(1)) };
  });
  const peds = g.pedestrians.peds.map((ped) => {
    const p = project(ped.x, (ped.ground ?? 0) + 0.95, ped.z);
    return { ...p, on: visible(p), kind: ped.kind };
  });
  const cruisers = (g.police?.cruisers ?? []).map((cruiser) => {
    const p = project(cruiser.pos.x, cruiser.pos.y + 1, cruiser.pos.z);
    return { ...p, on: visible(p), alive: cruiser.alive };
  });
  return {
    info: window.__COSTA.info,
    camera: { x: Math.round(g.camera.position.x), y: Math.round(g.camera.position.y), z: Math.round(g.camera.position.z) },
    traffic: { onScreen: cars.filter((c) => c.on).length, nearest: cars.filter((c) => c.on).slice(0, 8) },
    peds: { onScreen: peds.filter((p) => p.on).length, sample: peds.filter((p) => p.on).slice(0, 8), kinds: peds.reduce((acc, p) => { acc[p.kind] = (acc[p.kind] ?? 0) + 1; return acc; }, {}) },
    cruisers: { onScreen: cruisers.filter((c) => c.on).length, list: cruisers.filter((c) => c.on) },
    heli: Boolean(g.police?.helicopter?.group?.visible),
    enemies: (g.missions?.enemies ?? []).filter((e) => e.alive).length,
    beacon: Boolean(g.missions?.beacon?.visible),
    wanted: g.state.wanted,
    shadowMeshes: {
      traffic: Boolean(g.traffic.shadows),
      pedestrians: Boolean(g.pedestrians.shadows),
      props: Boolean(g.props?.blobShadows),
      vehicle: Boolean(g.vehicle.contact),
    },
    fog: { color: g.scene.fog?.color?.getHexString?.(), density: g.scene.fog?.density },
    shadow: { map: g.sky.sun.shadow.mapSize.x, left: g.sky.sun.shadow.camera.left, right: g.sky.sun.shadow.camera.right },
  };
});
console.log(JSON.stringify({ query, messages, report }, null, 2));
await browser.close();
