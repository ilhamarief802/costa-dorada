// Diagnose what a given screen pixel actually is: casts a ray and walks the parent chain,
// then reports the material/geometry so a black slab can be identified as geometry or sky.
// Run: node tools/pixel.mjs [shot] [sx,sy] [sx,sy] ...
import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';

const shot = process.argv[2] ?? 'cover';
const points = (process.argv[3] ?? '640,200').split(';').map((pair) => pair.split(',').map(Number));

const browser = await chromium.launch({
  executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:8080/?shot=${shot}&seed=1&capture=1`, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__SHOT_READY === true', null, { timeout: 180000 });

const report = await page.evaluate((pts) => {
  const g = window.__COSTA_GAME;
  const T = window.THREE;
  const ray = new T.Raycaster();
  ray.far = 4000;
  return pts.map(([sx, sy]) => {
    ray.setFromCamera(new T.Vector2((sx / 1280) * 2 - 1, 1 - (sy / 720) * 2), g.camera);
    const hits = ray.intersectObjects(g.scene.children, true).slice(0, 4).map((hit) => {
      let node = hit.object;
      const chain = [];
      while (node && chain.length < 6) {
        if (node.name) chain.push(node.name);
        node = node.parent;
      }
      const m = hit.object.material;
      return {
        chain: chain.join('<') || hit.object.type,
        geometry: hit.object.geometry?.type,
        material: m?.type,
        color: m?.color?.getHexString?.(),
        dist: Math.round(hit.distance),
        point: hit.point.toArray().map((v) => Math.round(v)),
      };
    });
    return { at: [sx, sy], hits };
  });
}, points);
console.log(JSON.stringify(report, null, 2));
await browser.close();
