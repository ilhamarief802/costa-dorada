// Where is the pistol in the mission frame? Reports its world position, projected screen
// position, visibility, and the world matrix of the hand it hangs from.
import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';

const browser = await chromium.launch({
  executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8080/?shot=mission&seed=1&capture=1', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.__SHOT_READY === true', null, { timeout: 180000 });

const report = await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  const T = window.THREE;
  const p = g.player;
  const v = new T.Vector3();
  p.pistol.getWorldPosition(v);
  const proj = v.clone().project(g.camera);
  const shoulder = p.armR.shoulder.rotation.toArray();
  const elbow = p.armR.elbow.rotation.toArray();
  return {
    pistolWorld: v.toArray().map((n) => +n.toFixed(2)),
    pistolScreen: [Math.round((proj.x + 1) / 2 * 1280), Math.round((1 - proj.y) / 2 * 720)],
    pistolVisible: p.pistol.visible,
    pistolChildVisible: p.pistol.children.map((c) => ({ type: c.type, visible: c.visible, pos: c.position.toArray().map((n) => +n.toFixed(2)) })),
    muzzleVisible: p.muzzle.visible,
    shoulderRot: shoulder.slice(0, 3).map((n) => +n.toFixed(2)),
    elbowRot: elbow.slice(0, 3).map((n) => +n.toFixed(2)),
    playerPos: p.pos.toArray().map((n) => +n.toFixed(2)),
    playerYaw: +p.yaw.toFixed(2),
    bodyChildY: +p.body.position.y.toFixed(2),
    pistolScale: p.pistol.scale.toArray(),
    enemies: g.missions.enemies.map((e) => ({
      flash: e.flash.visible,
      flashScale: e.flash.scale.toArray(),
      yaw: +e.yaw.toFixed(2),
    })),
  };
});
console.log(JSON.stringify(report, null, 1));
await browser.close();
