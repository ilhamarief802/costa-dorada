// Capture all four shots in one browser session and print the render budget for each. A fresh
// page is loaded per shot (the rig freezes the sim on load) but the browser is reused, which is
// where nearly all of the wall time goes.
//
//   node tools/shots.mjs [outdir]        # defaults to /tmp/shots
import { mkdirSync } from 'node:fs';
import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';

const outDir = process.argv[2] ?? '/tmp/shots';
mkdirSync(outDir, { recursive: true });
const names = ['cover', 'chase', 'mission', 'night'];

const browser = await chromium.launch({
  executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

for (const name of names) {
  const messages = [];
  const onConsole = (message) => messages.push(`${message.type()}: ${message.text()}`);
  const onError = (error) => messages.push(`pageerror: ${error.stack || error.message}`);
  page.on('console', onConsole);
  page.on('pageerror', onError);
  const started = Date.now();
  await page.goto(`http://localhost:8080/?shot=${name}&seed=1&capture=1`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.__SHOT_READY === true', null, { timeout: 180000 });
  await page.waitForTimeout(240);
  const outfile = `${outDir}/${name}.jpg`;
  await page.screenshot({ path: outfile, type: 'jpeg', quality: 94 });
  const info = await page.evaluate(() => ({
    info: window.__COSTA?.info,
    ms: performance.now(),
  }));
  const errors = messages.filter((line) => line.startsWith('pageerror') || line.startsWith('error'));
  console.log(JSON.stringify({ name, outfile, ms: Date.now() - started, info: info.info, errors }));
  page.off('console', onConsole);
  page.off('pageerror', onError);
}

await browser.close();
