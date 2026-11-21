import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';
const b = await chromium.launch({ executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:8080/?seed=1', { waitUntil: 'load', timeout: 120000 });
await p.waitForTimeout(500);
const title = await p.evaluate(() => {
  const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), display: getComputedStyle(el).display, color: getComputedStyle(el).color, size: getComputedStyle(el).fontSize }; };
  return { logo: box('.title-logo'), buttons: box('.title-buttons'), cont: box('.title-button.primary'), logoText: document.querySelector('.title-logo')?.textContent };
});
await p.click('text=CONTROLS', { timeout: 60000 });
const controls = await p.evaluate(() => {
  const el = document.querySelector('.controls-menu');
  const r = el.getBoundingClientRect();
  return { hidden: el.classList.contains('hidden'), rows: el.querySelectorAll('.control-row').length, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
});
await p.click('text=BACK', { timeout: 60000 });
await p.click('text=NEW GAME', { timeout: 120000 });
await p.waitForTimeout(700);
const hud = await p.evaluate(() => {
  const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), opacity: getComputedStyle(el).opacity, display: getComputedStyle(el).display }; };
  return {
    mission: box('.mission-card'), objective: document.querySelector('.mission-objective')?.textContent,
    map: box('.minimap-wrap'), stars: box('.wanted-stars'), money: box('.money'),
    weapon: box('.weapon-slot'), bars: box('.bars'), prompt: box('.prompt'), speed: box('.speed'),
    crosshair: box('.crosshair'), waypoint: box('.waypoint-arrow'),
  };
});
console.log(JSON.stringify({ title, controls, hud }, null, 1));
await b.close();
