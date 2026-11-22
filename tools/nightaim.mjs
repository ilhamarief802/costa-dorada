// Read every neon panel and point light the world built, and report where each sits. Run it with
// no shot to just list the world, or with a shot name to also print what lands inside that frame.
import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';

const shot = process.argv[2] ?? 'night';
const browser = await chromium.launch({
  executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:8080/?shot=${shot}&seed=1&capture=1`, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__SHOT_READY === true', null, { timeout: 180000 });

const report = await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  const T = window.THREE;
  const cam = g.camera.position.clone();
  const project = (v) => {
    const p = v.clone().project(g.camera);
    return { u: +(p.x * 0.5 + 0.5).toFixed(2), v: +(-p.y * 0.5 + 0.5).toFixed(2), front: p.z < 1 };
  };
  const neon = [];
  const lights = [];
  g.scene.traverse((o) => {
    if (o.isPointLight) {
      lights.push({ pos: o.position.toArray().map((n) => Math.round(n)), intensity: +o.intensity.toFixed(1), dist: Math.round(o.position.distanceTo(cam)) });
    }
    if (o.isInstancedMesh && o.material && o.material.isMeshBasicMaterial && o.count > 5 && o.count < 200) {
      const m = new T.Matrix4();
      const p = new T.Vector3();
      for (let i = 0; i < o.count; i += 1) {
        o.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        const s = project(p);
        neon.push({ pos: p.toArray().map((n) => Math.round(n)), u: s.u, v: s.v, front: s.front, d: Math.round(p.distanceTo(cam)) });
      }
    }
  });
  neon.sort((a, b) => a.d - b.d);
  return {
    camera: cam.toArray().map((n) => +n.toFixed(1)),
    neonTotal: neon.length,
    neonNearest: neon.slice(0, 14),
    neonInFrame: neon.filter((n) => n.front && n.u > 0 && n.u < 1 && n.v > 0 && n.v < 1).length,
    lights,
  };
});
console.log(JSON.stringify(report, null, 1));
await browser.close();
