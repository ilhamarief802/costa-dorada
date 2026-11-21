// Diagnostic: prove whether the car's contact shadow contributes pixels.
import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';

const browser = await chromium.launch({
  executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8080/?shot=cover&seed=1&capture=1', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.__SHOT_READY === true', null, { timeout: 180000 });
const info = await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  const T = window.THREE;
  const contact = g.vehicle.contact;
  const world = new T.Vector3();
  contact.getWorldPosition(world);
  const car = new T.Vector3(g.vehicle.pos.x, g.vehicle.pos.y + 0.7, g.vehicle.pos.z).project(g.camera);
  return {
    contactVisible: contact.visible,
    contactWorld: world.toArray(),
    contactMaterial: { opacity: contact.material.opacity, transparent: contact.material.transparent, depthWrite: contact.material.depthWrite, map: Boolean(contact.material.map), side: contact.material.side },
    carScreen: { x: Math.round((car.x + 1) * 640), y: Math.round((1 - car.y) * 360) },
    wheelShadows: g.vehicle.wheelShadows.length,
  };
});
await page.screenshot({ path: '/tmp/contact_on.jpg', type: 'jpeg', quality: 92 });
await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  const c = g.vehicle.contact;
  c.position.set(0, 5, 0);
  c.scale.set(3, 3, 3);
  c.material.map = null;
  c.material.color.setHex(0xff0000);
  c.material.opacity = 1;
  c.material.needsUpdate = true;
  c.frustumCulled = false;
  g.renderer.render(g.scene, g.camera);
});
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/contact_red.jpg', type: 'jpeg', quality: 92 });
await page.evaluate(() => { const g = window.__COSTA_GAME; g.vehicle.setVisible(false); g.renderer.render(g.scene, g.camera); });
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/car_off4.jpg', type: 'jpeg', quality: 92 });
console.log(JSON.stringify(info, null, 2));
await browser.close();
