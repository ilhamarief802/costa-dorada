import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';
const b = await chromium.launch({ executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto('http://localhost:8080/?seed=1', { waitUntil: 'load', timeout: 120000 });
await p.waitForTimeout(600);
await p.click('text=NEW GAME');
await p.waitForTimeout(600);

const step = (frames, keys = []) => p.evaluate(({ frames, keys }) => {
  const g = window.__COSTA_GAME;
  for (const key of keys) g.input.down.add(key);
  for (let i = 0; i < frames; i += 1) g.loop.update(1 / 60);
  for (const key of keys) g.input.down.delete(key);
}, { frames, keys });

const report = {};
report.start = await p.evaluate(() => ({
  mode: window.__COSTA.mode,
  mission: window.__COSTA_GAME.missions.progress(),
  objective: document.querySelector('.mission-objective')?.textContent,
  money: window.__COSTA_GAME.state.money,
  cars: window.__COSTA_GAME.traffic.cars.length,
  peds: window.__COSTA_GAME.pedestrians.peds.length,
  save: Boolean(localStorage.getItem('costaDorada.save.v2')),
}));

await step(90, ['forward']);
report.walk = await p.evaluate(() => {
  const g = window.__COSTA_GAME;
  return { x: +g.player.pos.x.toFixed(2), z: +g.player.pos.z.toFixed(2), speed: +g.player.speed.toFixed(2) };
});

report.steal = await p.evaluate(() => {
  const g = window.__COSTA_GAME;
  const car = g.traffic.cars[0];
  g.player.stage(car.x - 1.2, car.z, 0);
  g.input.edge.add('steal');
  g.loop.update(1 / 60);
  return { driving: g.state.driving, occupied: g.vehicle.occupied, pos: [+g.vehicle.pos.x.toFixed(1), +g.vehicle.pos.z.toFixed(1)] };
});

await step(120, ['forward']);
report.drive = await p.evaluate(() => {
  const g = window.__COSTA_GAME;
  return { kmh: +g.vehicle.speedKmh.toFixed(1), pos: [+g.vehicle.pos.x.toFixed(1), +g.vehicle.pos.z.toFixed(1)], hud: document.querySelector('.speed-value')?.textContent };
});

report.exit = await p.evaluate(() => {
  const g = window.__COSTA_GAME;
  g.input.edge.add('interact');
  g.loop.update(1 / 60);
  return { driving: g.state.driving, playerVisible: g.player.visible, carVisible: g.vehicle.group.visible };
});

report.combat = await p.evaluate(() => {
  const g = window.__COSTA_GAME;
  const ped = g.pedestrians.peds[0];
  g.player.stage(ped.x + 4, ped.z, 0);
  g.player.setVisible(false);
  g.camera.position.set(ped.x + 4, 2.2, ped.z + 0.6);
  g.camera.lookAt(ped.x, 1.1, ped.z);
  g.camera.updateMatrixWorld();
  const before = ped.dead;
  for (let i = 0; i < 3; i += 1) { g.combat.fire(); g.combat.update(0.3); }
  return { before, dead: ped.dead, wanted: g.state.wanted, cruisers: g.police.cruisers.length, ammo: g.state.ammo.pistol.ammo, errors: window.__ERRS || [] };
});

await step(80);
report.pursuit = await p.evaluate(() => {
  const g = window.__COSTA_GAME;
  return { wanted: g.state.wanted, cruisers: g.police.cruisers.filter((c) => c.alive).length, stars: document.querySelectorAll('.wanted-star.lit').length, distant: g.police.cruisers.map((c) => +c.pos.distanceTo(g.player.pos).toFixed(0)) };
});

report.mission = await p.evaluate(() => {
  const g = window.__COSTA_GAME;
  const mission = g.missions.definitions[0];
  const stage = mission.stages[0];
  const money = g.state.money;
  g.player.stage(stage.x, stage.z, 0);
  g.vehicle.stage(stage.x, stage.z, 0);
  g.missions.update(0.1, { playerPos: g.player.pos, heading: g.player.yaw });
  const first = { active: g.missions.active, index: g.missions.index, money: g.state.money, delta: g.state.money - money };
  g.missions.activate(2, 0);
  const stage2 = g.missions.definitions[2].stages[0];
  g.player.stage(stage2.x, stage2.z, 0);
  g.missions.update(0.1, { playerPos: g.player.pos, heading: 0 });
  const enemies = g.missions.aliveEnemies();
  for (const enemy of g.missions.enemies) { enemy.hp = 0; enemy.alive = false; }
  g.missions.update(0.1, { playerPos: g.player.pos, heading: 0 });
  return { first, enemies, indexAfterKill: g.missions.index, stageAfterKill: g.missions.stage, reward: g.state.money };
});

report.save = await p.evaluate(() => {
  const g = window.__COSTA_GAME;
  localStorage.removeItem('costaDorada.save.v2');
  const data = { version: 2, cash: 7777, health: 0.8, armour: 0.5, wanted: 2, mission: { index: 3, stage: 0 }, player: { x: 10, z: 12, yaw: 1 }, vehicle: { x: 20, z: 22, yaw: 1 }, driving: false, weaponKey: 'smg', ammo: { pistol: { ammo: 5, reserve: 9 }, smg: { ammo: 20, reserve: 40 } }, period: 'night' };
  localStorage.setItem('costaDorada.save.v2', JSON.stringify(data));
  return Boolean(localStorage.getItem('costaDorada.save.v2'));
});

report.save = Boolean(report.save);
report.errors = errors;
console.log(JSON.stringify(report, null, 1));
await b.close();
