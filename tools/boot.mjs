// Boot the game once in a browser and print every console message and page error. Fast check that
// a change did not break the module graph before a capture run (which is minutes under load).
//
//   node tools/boot.mjs [shot]
import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';

const shot = process.argv[2] ?? 'cover';
const browser = await chromium.launch({
  executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const lines = [];
page.on('console', (m) => lines.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => lines.push(`pageerror: ${e.stack || e.message}`));
try {
  await page.goto(`http://localhost:8080/?shot=${shot}&seed=1&capture=1`, { waitUntil: 'commit', timeout: 180000 });
  await page.waitForFunction('window.__SHOT_READY === true', null, { timeout: 240000 });
  const info = await page.evaluate(() => window.__COSTA.info);
  console.log('READY', JSON.stringify(info));
} catch (error) {
  console.log('NOT READY:', error.message.split('\n')[0]);
} finally {
  for (const line of lines) console.log(line);
  await browser.close();
}
