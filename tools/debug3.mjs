import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';
const b = await chromium.launch({ executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:8080/?seed=1', { waitUntil: 'load', timeout: 120000 });
await p.waitForTimeout(500);
await p.click('text=NEW GAME');
await p.waitForTimeout(500);
const out = await p.evaluate(() => {
  const g = window.__COSTA_GAME;
  g.input.down.add('forward');
  for (let i = 0; i < 90; i += 1) g.loop.update(1 / 60);
  g.input.down.delete('forward');
  const car = g.traffic.cars[0];
  g.player.stage(car.x - 1.2, car.z, 0);
  g.input.edge.add('steal');
  g.loop.update(1 / 60);
  const before = { driving: g.state.driving, pos: [g.vehicle.pos.x, g.vehicle.pos.z], yaw: g.vehicle.yaw, ppos: [g.player.pos.x, g.player.pos.z], mode: g.state.mode };
  g.input.down.add('forward');
  const tr = [];
  for (let i = 0; i < 60; i += 1) {
    g.loop.update(1 / 60);
    if (i % 5 === 0) tr.push({ i, kmh: +g.vehicle.speedKmh.toFixed(2), p: [+g.vehicle.pos.x.toFixed(1), +g.vehicle.pos.z.toFixed(1)], ct: g.vehicle.collisionTimer, drive: g.state.driving, mode: g.state.mode, keys: [...g.input.down] });
  }
  return { before, tr };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
