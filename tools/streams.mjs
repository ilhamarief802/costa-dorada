import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';
const b = await chromium.launch({ executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://localhost:8080/?seed=1', { waitUntil: 'load', timeout: 120000 });
await p.waitForTimeout(400);
await p.click('text=NEW GAME', { timeout: 120000 });
await p.waitForTimeout(400);
const out = await p.evaluate(() => {
  const g = window.__COSTA_GAME;
  const report = {};
  g.state.driving = true; g.vehicle.occupied = true;

  // Taxi
  g.activities.end(); g.activities.start('taxi');
  const taxi = g.activities.active;
  const money0 = g.state.money;
  g.vehicle.stage(taxi.dest.x, taxi.dest.z, 0);
  g.activities.updateTaxi(0.1);
  report.taxi = { started: Boolean(taxi), reward: g.state.money - money0, active: Boolean(g.activities.active) };

  // Race
  g.activities.end(); g.activities.start('race');
  const race = g.activities.active;
  const money1 = g.state.money;
  for (const cp of race.checkpoints) {
    g.vehicle.stage(cp.x, cp.z, 0);
    g.activities.updateRace(0.05);
  }
  report.race = { checkpoints: race.checkpoints.length, reward: g.state.money - money1, active: Boolean(g.activities.active), aiCars: g.activities.raceCars.length };

  // Stunt
  g.activities.end(); g.activities.start('stunt');
  const money2 = g.state.money;
  g.vehicle.stage(172, 338.2, 0); g.vehicle.vx = 0; g.vehicle.vz = 9;
  g.activities.updateStunt();
  report.stunt = { reward: g.state.money - money2, airV: +g.vehicle.airV.toFixed(1), airY: +g.vehicle.airY.toFixed(2), active: Boolean(g.activities.active) };

  // Mission chain walk-through
  g.state.driving = false; g.vehicle.occupied = false;
  g.missions.reset();
  const steps = [];
  const completeStage = () => {
    const s = g.missions.currentStage();
    if (!s) return;
    if (s.type === 'reach' || s.type === 'deliver') {
      g.missions.vehicle.occupied = true;
      g.missions.update(0.1, { playerPos: { x: s.x, y: 0.16, z: s.z }, heading: 0 });
    } else if (s.type === 'steal') {
      g.missions.notifySteal();
      g.missions.update(0.1, { playerPos: g.player.pos, heading: 0 });
    } else if (s.type === 'kill') {
      for (const e of g.missions.enemies) { e.alive = false; e.hp = 0; }
      g.missions.update(0.1, { playerPos: g.player.pos, heading: 0 });
    } else if (s.type === 'escape') {
      g.police.setWanted(0, true);
      g.missions.update(0.1, { playerPos: g.player.pos, heading: 0 });
    }
  };
  for (let i = 0; i < 8; i += 1) {
    g.missions.activate(i, 0, true);
    let guard = 0;
    while (g.missions.active && guard < 6) {
      completeStage();
      guard += 1;
    }
    steps.push({ index: i, active: g.missions.active, stage: g.missions.stage });
  }
  report.missions = { steps, money: g.state.money, complete: g.missions.complete };
  return report;
});
console.log(JSON.stringify({ out, errors }, null, 1));
await b.close();
