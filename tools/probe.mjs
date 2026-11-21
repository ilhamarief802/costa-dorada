// Probe: load a frozen shot, wait for the settled frame, save a 1280x720 JPEG and print every
// console message plus the draw-call budget. Run with: node tools/probe.mjs [query] [outfile]
import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';

const query = process.argv[2] ?? '?shot=cover&seed=1&capture=1';
const outfile = process.argv[3] ?? '/tmp/probe.jpg';
const url = `http://localhost:8080/${query}`;

const browser = await chromium.launch({
  executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const messages = [];
page.on('console', (message) => messages.push(`${message.type()}: ${message.text()}`));
page.on('pageerror', (error) => messages.push(`pageerror: ${error.stack || error.message}`));
page.on('requestfailed', (request) => messages.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));

const started = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.__SHOT_READY === true', null, { timeout: 180000 });
await page.waitForTimeout(250);
await page.screenshot({ path: outfile, type: 'jpeg', quality: 92 });
const info = await page.evaluate(() => ({
  info: window.__COSTA?.info,
  ready: window.__SHOT_READY,
  canvas: (() => {
    const canvas = document.getElementById('view');
    return { width: canvas.width, height: canvas.height };
  })(),
}));
console.log(JSON.stringify({ query, outfile, ms: Date.now() - started, messages, ...info }, null, 2));
await browser.close();
