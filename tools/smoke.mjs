// Fast smoke test: load the page, wait a few seconds, print every console/page error and
// whether the shot rig ever raised its ready flag. Exists because probe.mjs waits 180 s on a
// flag that never arrives when a module throws during construction.
import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';

const query = process.argv[2] ?? '?shot=cover&seed=1&capture=1';
const browser = await chromium.launch({
  executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const messages = [];
page.on('console', (message) => messages.push(`${message.type()}: ${message.text()}`));
page.on('pageerror', (error) => messages.push(`PAGEERROR: ${error.stack || error.message}`));
await page.goto(`http://localhost:8080/${query}`, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(6000);
const state = await page.evaluate(() => ({
  ready: window.__SHOT_READY ?? false,
  hasGame: Boolean(window.__COSTA_GAME),
  info: window.__COSTA?.info ?? null,
}));
console.log(JSON.stringify({ state, messages: messages.slice(0, 20) }, null, 2));
await browser.close();
