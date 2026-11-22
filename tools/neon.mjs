// Count what the buildings module built: neon panels, point lights, windows.
import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';
const b = await chromium.launch({ executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:8080/?shot=night&seed=1&capture=1', { waitUntil: 'load', timeout: 180000 });
await p.waitForFunction('window.__SHOT_READY === true', null, { timeout: 180000 });
const report = await p.evaluate(() => {
  const g = window.__COSTA_GAME;
  let neon = 0;
  let lights = 0;
  let basicInstanced = 0;
  g.scene.traverse((o) => {
    if (o.isPointLight) lights += 1;
    if (o.isInstancedMesh && o.material && o.material.isMeshBasicMaterial) basicInstanced += 1;
    if (o.isInstancedMesh && o.material && o.material.isMeshBasicMaterial && o.count > 5 && o.count < 200) neon += 1;
  });
  return { neonMeshes: neon, pointLights: lights, basicInstanced, buildingsInPlan: g.plan.buildings.length };
});
console.log(JSON.stringify(report, null, 1));
await b.close();
