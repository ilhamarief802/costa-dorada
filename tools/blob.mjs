// Why do the blob shadows not read? Render once, then compare the road pixel under a car
// with the same pixel after forcing every blob shadow mesh visible and bright.
import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({
  executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8080/?shot=cover&seed=1&capture=1', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__SHOT_READY === true', null, { timeout: 180000 });
const out = await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  const canvas = document.getElementById('view');
  const gl = g.renderer.getContext();
  const readAt = (x, y) => {
    const buf = new Uint8Array(4);
    gl.readPixels(x, canvas.height - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return Array.from(buf);
  };
  g.renderer.render(g.scene, g.camera);
  const base = readAt(640, 660);
  const info = [];
  for (const own of ['traffic', 'props', 'pedestrians']) {
    const node = g[own];
    const list = [];
    node.group.traverse((o) => {
      if (o.isInstancedMesh) list.push({ mesh: o, opacity: o.material.opacity, order: o.renderOrder, transparent: o.material.transparent });
    });
    info.push({ own, meshes: list.map((e) => ({ count: e.mesh.count, opacity: e.opacity, order: e.order, transparent: e.transparent })) });
  }
  // Paint every contact-shadow plane magenta to prove whether they rasterise at all.
  const painted = [];
  for (const own of ['traffic', 'props', 'pedestrians']) {
    g[own].group.traverse((o) => {
      if (!o.isInstancedMesh) return;
      const m = o.material;
      if (!m.map || !m.transparent) return;
      m.map = null;
      m.transparent = false;
      m.opacity = 1;
      m.color.setHex(0xff00ff);
      m.depthTest = true;
      m.needsUpdate = true;
      painted.push(o.count);
    });
  }
  g.renderer.render(g.scene, g.camera);
  const after = readAt(640, 660);
  return { base, after, info, painted, shadowsEnabled: g.renderer.shadowMap.enabled };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/blob.jpg', type: 'jpeg', quality: 92 });
await browser.close();
