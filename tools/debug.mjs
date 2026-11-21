// Diagnostic: project the shot camera, raycast centre/top/bottom, and report HUD layout.
import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';

const browser = await chromium.launch({
  executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const messages = [];
page.on('console', (m) => messages.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => messages.push(`pageerror: ${e.stack || e.message}`));
await page.goto('http://localhost:8080/?shot=cover&seed=1&capture=1', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.__SHOT_READY === true', null, { timeout: 180000 });

const report = await page.evaluate(() => {
  const g = window.__COSTA_GAME;
  const T = window.THREE;
  const camera = g.camera;
  const rays = {};
  for (const [label, y] of [['top', 0.75], ['upper', 0.35], ['center', 0], ['lower', -0.35], ['bottom', -0.75]]) {
    const raycaster = new T.Raycaster();
    raycaster.setFromCamera(new T.Vector2(0, y), camera);
    const hits = raycaster.intersectObjects(g.scene.children, true).slice(0, 4).map((hit) => {
      let node = hit.object;
      const chain = [];
      while (node && chain.length < 4) {
        if (node.name) chain.push(node.name);
        node = node.parent;
      }
      return {
        chain: chain.join('<'),
        type: hit.object.type,
        geometry: hit.object.geometry?.type,
        color: hit.object.material?.color?.getHexString?.(),
        distance: Math.round(hit.distance),
        point: hit.point.toArray().map((value) => Math.round(value)),
      };
    });
    rays[label] = hits;
  }
  const hud = document.querySelector('.hud');
  const money = document.querySelector('.money');
  const mission = document.querySelector('.mission-title');
  const rect = (node) => {
    if (!node) return null;
    const box = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height), display: style.display, opacity: style.opacity, color: style.color, zIndex: style.zIndex, text: node.textContent.slice(0, 40) };
  };
  return {
    camera: { position: camera.position.toArray(), rotation: camera.rotation.toArray(), fov: camera.fov },
    hud: rect(hud),
    money: rect(money),
    mission: rect(mission),
    rays,
    renderer: { toneMapping: g.renderer.toneMapping, exposure: g.renderer.toneMappingExposure, outputColorSpace: g.renderer.outputColorSpace, shadow: g.renderer.shadowMap.enabled },
    sun: { intensity: g.sky.sun.intensity, position: g.sky.sun.position.toArray(), color: g.sky.sun.color.getHexString() },
    fog: { color: g.scene.fog.color.getHexString(), density: g.scene.fog.density },
  };
});
console.log(JSON.stringify({ messages, report }, null, 2));
await browser.close();
