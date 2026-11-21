// Gameplay smoke test: start a new game, walk, steal a traffic car, drive, fire and check that
// the wanted system, HUD and save appear. Prints a compact JSON report.
import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error.message || error)));
await page.goto('http://localhost:8080/?seed=1', { waitUntil: 'load', timeout: 120000 });
await page.waitForTimeout(1200);
await page.click('text=NEW GAME');
await page.waitForFunction(() => window.__COSTA?.mode === 'playing', null, { timeout: 30000 });
await page.waitForTimeout(1500);
const report = {};
report.start = await page.evaluate(() => ({
  mode: window.__COSTA.mode, driving: window.__COSTA.driving,
  money: window.__COSTA_GAME.state.money,
  mission: window.__COSTA_GAME.missions.progress(),
  missionActive: window.__COSTA_GAME.missions.active,
  objective: document.querySelector('.mission-objective')?.textContent,
  peds: window.__COSTA_GAME.pedestrians.peds.length,
  cars: window.__COSTA_GAME.traffic.cars.length,
}));
await page.keyboard.down('KeyW');
await page.waitForTimeout(900);
await page.keyboard.up('KeyW');
report.walk = await page.evaluate(() => {
  const p = window.__COSTA_GAME.player.pos;
  return { x: +p.x.toFixed(1), z: +p.z.toFixed(1) };
});
// Teleport onto the pavement next to a traffic car, then steal it.
report.steal = await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  const car = g.traffic.cars.find((c) => !c.stolen);
  g.player.stage(car.x + 1.6, car.z + 0.6, 0);
  g.vehicle.stage(car.x, car.z, car.heading);
  return { car: [car.x, car.z], distance: +Math.hypot(g.player.pos.x - car.x, g.player.pos.z - car.z).toFixed(2) };
});
await page.waitForTimeout(300);
await page.keyboard.press('KeyF');
await page.waitForTimeout(500);
report.theft = await page.evaluate(() => ({
  driving: window.__COSTA_GAME.state.driving,
  occupied: window.__COSTA_GAME.vehicle.occupied,
  hudWeapon: document.querySelector('.weapon-name')?.textContent,
}));
await page.keyboard.down('KeyW');
await page.waitForTimeout(1600);
await page.keyboard.up('KeyW');
await page.waitForTimeout(200);
report.drive = await page.evaluate(() => ({
  kmh: Math.round(window.__COSTA_GAME.vehicle.speedKmh),
  pos: [ +window.__COSTA_GAME.vehicle.pos.x.toFixed(1), +window.__COSTA_GAME.vehicle.pos.z.toFixed(1) ],
  speedShown: document.querySelector('.speed-value')?.textContent,
  driving: window.__COSTA_GAME.state.driving,
}));
// Exit and fire the pistol twice; witnesses should raise the wanted level.
await page.keyboard.press('KeyE');
await page.waitForTimeout(400);
report.afterExit = await page.evaluate(() => ({ driving: window.__COSTA_GAME.state.driving, visible: window.__COSTA_GAME.player.visible }));
report.combat = await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  const ped = g.pedestrians.peds[0];
  g.player.stage(ped.x + 2, ped.z + 2, 0);
  g.state.wanted = 0;
  g.combat.fire();
  g.combat.cooldown = 0;
  g.combat.fire();
  return {
    wanted: g.state.wanted,
    stars: document.querySelectorAll('.wanted-star.lit').length,
    cruisers: g.police.cruisers.length,
    ammo: g.state.ammo.pistol.ammo,
    hudAmmo: document.querySelector('.weapon-ammo')?.textContent,
    dead: g.pedestrians.peds.filter((p) => p.dead).length,
  };
});
await page.waitForTimeout(1600);
report.pursuit = await page.evaluate(() => ({
  wanted: window.__COSTA_GAME.state.wanted,
  cruisers: window.__COSTA_GAME.police.cruisers.length,
  siren: window.__COSTA_GAME.police.sirenOn,
  failHidden: document.querySelector('.fail-card')?.classList.contains('hidden'),
}));
report.save = await page.evaluate(() => {
  const raw = localStorage.getItem('costaDorada.save.v1');
  if (!raw) return null;
  const data = JSON.parse(raw);
  return { money: data.cash, mission: data.mission, wanted: data.wanted, hasPos: Boolean(data.player) };
});
report.messages = await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((n) => n.textContent));
report.errors = errors;
console.log(JSON.stringify(report, null, 2));
await browser.close();
