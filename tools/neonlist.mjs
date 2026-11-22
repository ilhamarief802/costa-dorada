// List only the neon blade panels: the instanced mesh whose geometry is a 0.18 x 1 x 0.68 box.
import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({
  executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8080/?shot=night&seed=1&capture=1', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__SHOT_READY === true', null, { timeout: 180000 });
const report = await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  const T = window.THREE;
  const out = [];
  g.scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.material || !o.material.isMeshBasicMaterial) return;
    const p = o.geometry.parameters;
    if (!p || Math.abs(p.width - 0.18) > 0.001) return;
    const m = new T.Matrix4();
    const v = new T.Vector3();
    for (let i = 0; i < o.count; i += 1) {
      o.getMatrixAt(i, m);
      v.setFromMatrixPosition(m);
      out.push(v.toArray().map((n) => Math.round(n)));
    }
  });
  return { panels: out.length, list: out.slice(0, 20) };
});
console.log(JSON.stringify(report, null, 1));
await browser.close();
