import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8080/?shot=cover&seed=1&capture=1', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__SHOT_READY === true', null, { timeout: 180000 });
const report = await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  const T = window.THREE;
  const c = g.vehicle.contact;
  const render = () => { g.renderer.render(g.scene, g.camera); return g.renderer.info.render.calls; };
  const before = render();
  c.visible = false;
  const after = render();
  c.visible = true;
  render();
  const parentChain = [];
  let node = c;
  while (node) { parentChain.push(node.name || node.type); node = node.parent; }
  const ray = new T.Raycaster();
  const world = new T.Vector3();
  c.getWorldPosition(world);
  const screen = world.clone().project(g.camera);
  ray.setFromCamera(new T.Vector2(screen.x, screen.y), g.camera);
  const hits = ray.intersectObject(c, false);
  return {
    before, after,
    contact: { visible: c.visible, position: c.position.toArray(), rotation: [c.rotation.x, c.rotation.y, c.rotation.z], scale: c.scale.toArray(), renderOrder: c.renderOrder, frustumCulled: c.frustumCulled, layers: c.layers.mask },
    world: world.toArray(),
    screen,
    parentChain,
    parentCount: c.parent.children.length,
    geometry: { count: c.geometry.attributes.position.count, sphere: c.geometry.boundingSphere && c.geometry.boundingSphere.radius },
    material: { type: c.material.type, visible: c.material.visible, opacity: c.material.opacity, transparent: c.material.transparent, side: c.material.side, depthTest: c.material.depthTest, mapSize: c.material.map && c.material.map.image ? [c.material.map.image.width, c.material.map.image.height] : null },
    hits: hits.length,
    sceneHas: Boolean(g.scene.getObjectByProperty('uuid', c.uuid)),
  };
});
console.log(JSON.stringify(report, null, 2));
await browser.close();
