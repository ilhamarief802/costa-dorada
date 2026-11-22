// Report where the important cast members land on the 1280x720 frame, as a fraction of the
// picture. A subject is only "in the shot" if it projects inside 0..1 on both axes and is far
// enough from the camera to be readable. Run: node tools/frame.mjs <shot>
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
  const project = (x, y, z) => {
    const v = new T.Vector3(x, y, z).project(g.camera);
    return { u: +((v.x + 1) / 2).toFixed(3), v: +((1 - v.y) / 2).toFixed(3), depth: +v.z.toFixed(4) };
  };
  const dist = (p) => Math.round(Math.hypot(p.x - g.camera.position.x, p.z - g.camera.position.z));
  const inFrame = (p) => p.u > 0.02 && p.u < 0.98 && p.v > 0.02 && p.v < 0.98 && p.depth < 1;

  const hero = { pos: g.vehicle.pos };
  const out = {
    camera: g.camera.position.toArray().map((n) => +n.toFixed(2)),
    fov: g.camera.fov,
    heroCar: { screen: project(hero.pos.x, hero.pos.y + 0.8, hero.pos.z), metres: dist(hero.pos) },
    player: { screen: project(g.player.pos.x, g.player.pos.y + 1.0, g.player.pos.z), metres: dist(g.player.pos), visible: g.player.group.visible },
    traffic: [],
    pedestrians: { total: g.pedestrians.peds.length, inFrame: 0, near: [] },
    cruisers: [],
    enemies: [],
    calls: g.renderer.info.render.calls,
    triangles: g.renderer.info.render.triangles,
  };

  for (const car of g.traffic.cars) {
    const p = project(car.x, (car.ground ?? 0) + 0.8, car.z);
    if (!inFrame(p)) continue;
    out.traffic.push({ screen: p, metres: dist(car), kind: car.kind, pinned: Boolean(car.pinned) });
  }
  for (const ped of g.pedestrians.peds) {
    const p = project(ped.x, ped.ground + 1.0, ped.z);
    if (!inFrame(p)) continue;
    out.pedestrians.inFrame += 1;
    if (out.pedestrians.near.length < 12) out.pedestrians.near.push({ screen: p, metres: Math.round(Math.hypot(ped.x - g.camera.position.x, ped.z - g.camera.position.z)), pinned: Boolean(ped.pinned) });
  }
  for (const c of g.police.cruisers) {
    if (!c.alive) continue;
    out.cruisers.push({ screen: project(c.pos.x, c.pos.y + 0.8, c.pos.z), metres: dist(c.pos) });
  }
  for (const e of g.missions.enemies) {
    out.enemies.push({ screen: project(e.x, e.ground + 1.0, e.z), metres: Math.round(Math.hypot(e.x - g.camera.position.x, e.z - g.camera.position.z)), flash: e.flash?.visible ?? false });
  }
  out.traffic.sort((a, b) => a.metres - b.metres);
  out.traffic = out.traffic.slice(0, 10);
  return out;
});
console.log(JSON.stringify(report, null, 1));
await browser.close();
