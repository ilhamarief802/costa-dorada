import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8080/?shot=cover&seed=1&capture=1', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__SHOT_READY === true', null, { timeout: 180000 });
const report = await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  const T = window.THREE;
  const ray = new T.Raycaster();
  const cast = (sx, sy) => {
    ray.setFromCamera(new T.Vector2((sx / 1280) * 2 - 1, 1 - (sy / 720) * 2), g.camera);
    return ray.intersectObjects(g.scene.children, true).slice(0, 5).map((hit) => {
      let node = hit.object;
      const chain = [];
      while (node && chain.length < 5) { if (node.name) chain.push(node.name); node = node.parent; }
      return { chain: chain.join('<'), type: hit.object.type, geometry: hit.object.geometry?.type, color: hit.object.material?.color?.getHexString?.(), dist: Math.round(hit.distance), point: hit.point.toArray().map((v) => Math.round(v)) };
    });
  };
  const texture = g.vehicle.contact.material.map.image;
  const ctx = texture.getContext('2d');
  const pixels = [0, 32, 64, 96, 127].map((i) => Array.from(ctx.getImageData(i, 64, 1, 1).data));
  return {
    green: cast(680, 415),
    center: cast(640, 450),
    car: cast(420, 520),
    contactAlpha: pixels,
    sun: { dir: g.sky.sunDir.toArray(), pos: g.sky.sun.position.toArray(), intensity: g.sky.sun.intensity },
  };
});
console.log(JSON.stringify(report, null, 2));
await browser.close();
