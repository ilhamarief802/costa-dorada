import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';
const b = await chromium.launch({ executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://localhost:8080/?seed=1', { waitUntil: 'load', timeout: 120000 });
await p.waitForTimeout(400);
await p.evaluate(() => {
  localStorage.setItem('costaDorada.save.v2', JSON.stringify({
    version: 2, cash: 7777, health: 0.8, armour: 0.5, wanted: 2,
    mission: { index: 3, stage: 0 }, player: { x: 10, z: 12, yaw: 1 },
    vehicle: { x: 20, z: 22, yaw: 1 }, driving: false, weaponKey: 'smg',
    ammo: { pistol: { ammo: 5, reserve: 9 }, smg: { ammo: 20, reserve: 40 } }, period: 'night',
  }));
});
await p.reload({ waitUntil: 'load', timeout: 120000 });
await p.waitForTimeout(500);
const label = await p.evaluate(() => document.querySelector('.title-button.primary')?.textContent);
await p.click('text=CONTINUE', { timeout: 120000 });
await p.waitForTimeout(600);
const state = await p.evaluate(() => {
  const g = window.__COSTA_GAME;
  return {
    mode: window.__COSTA.mode, cash: g.state.money, health: g.state.health, armour: g.state.armour,
    wanted: g.state.wanted, weapon: g.state.weaponKey, ammo: g.state.ammo.smg.ammo,
    mission: g.missions.progress(), pos: [+g.player.pos.x.toFixed(0), +g.player.pos.z.toFixed(0)],
    period: g.weather.period, driving: g.state.driving,
    hudMoney: document.querySelector('.money')?.textContent,
    hudWeapon: document.querySelector('.weapon-name')?.textContent,
    hudStars: document.querySelectorAll('.wanted-star.lit').length,
  };
});
console.log(JSON.stringify({ label, state, errors }, null, 1));
await b.close();
