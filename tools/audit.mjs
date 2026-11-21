import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';
const b = await chromium.launch({ executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:8080/?seed=1', { waitUntil: 'load', timeout: 120000 });
await page.waitForTimeout(500);
await page.click('text=NEW GAME', { timeout: 120000 });
await page.waitForTimeout(500);

const report = await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  const inside = (x, z) => g.plan.queryColliders(x, z, 0.3, []).some((box) => box.kind === 'building' && x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ);
  const pedsInside = g.pedestrians.peds.filter((ped) => !ped.dead && inside(ped.x, ped.z, 0.3)).length;
  const carsInside = g.traffic.cars.filter((car) => !car.stolen && inside(car.x, car.z, 0.5)).length;
  return { pedsInside, carsInside, peds: g.pedestrians.peds.length, cars: g.traffic.cars.length };
});

report.pursuit = await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  g.police.setWanted(4);
  const start = g.police.cruisers.map((c) => c.pos.distanceTo(g.player.pos));
  for (let i = 0; i < 360; i += 1) g.loop.update(1 / 60);
  const end = g.police.cruisers.map((c) => +c.pos.distanceTo(g.player.pos).toFixed(1));
  return {
    level: g.state.wanted,
    cruisers: g.police.cruisers.length,
    heli: Boolean(g.police.helicopter && g.police.helicopter.group.visible),
    heliY: g.police.helicopter ? +g.police.helicopter.group.position.y.toFixed(1) : null,
    roadblocks: g.police.roadblocks.length,
    start: start.map((d) => +d.toFixed(0)),
    end,
    stars: document.querySelectorAll('.wanted-star.lit').length,
    siren: g.police.sirenOn,
  };
});

report.activities = await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  g.police.setWanted(0);
  const marker = g.activities.markers.find((m) => m.kind === 'race');
  g.player.stage(marker.x + 1, marker.z + 1, 0);
  g.missions.reset();
  const prompt = g.activities.prompt(g.player.pos);
  const started = g.activities.start('race');
  for (let i = 0; i < 60; i += 1) g.loop.update(1 / 60);
  return { prompt, started, kind: g.activities.active?.kind, timer: g.activities.active?.timer, raceCars: g.activities.raceCars.length, hud: document.querySelector('.activity-title')?.textContent };
});

report.missionChain = await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  g.missions.reset();
  g.missions.activate(0, 0);
  const stage = g.missions.definitions[0].stages[0];
  g.player.stage(stage.x, stage.z, 0);
  g.missions.update(0.1, { playerPos: g.player.pos, heading: 0 });
  const after = { active: g.missions.active, index: g.missions.index, nextTimer: g.missions.nextTimer };
  for (let i = 0; i < 7; i += 1) g.missions.update(1, { playerPos: g.player.pos, heading: 0 });
  return { after, nextIndex: g.missions.index, nextActive: g.missions.active, objective: document.querySelector('.mission-objective')?.textContent };
});

console.log(JSON.stringify({ report, errors }, null, 1));
await b.close();
