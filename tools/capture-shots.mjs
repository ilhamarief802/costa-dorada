// Capture the entry's four contact-sheet frames into screenshots/, the way the judge will see
// them: 1280x720 JPEGs, each under 256 KiB, the first by name the cover.
//
//   node tools/capture-shots.mjs [outdir] [--base http://localhost:8080] [--timeout 600]
//
// Each frame is a real load of the game at ?shot=<name>&capture=1&seed=1, which freezes the
// simulation, stages the scene and raises window.__SHOT_READY. The frame is written at the
// highest JPEG quality on a fixed ladder that still fits the byte cap, so the ladder is stepped
// down per frame rather than the whole run being re-encoded afterwards. Console errors and page
// exceptions are collected per frame; any of them fails the run, because a frame captured over a
// broken build is not a frame of a finished game.
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '/home/ilham/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};
const outDir = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) ?? 'screenshots';
const base = flag('--base', 'http://localhost:8080');
const settleMs = Number(flag('--settle', '900'));
const readyTimeout = Number(flag('--timeout', '600')) * 1000;

/** The frames, in the order the contact sheet reads them. */
const FRAMES = [
  { file: '1-cover.jpg', shot: 'cover' },
  { file: '2-chase.jpg', shot: 'chase' },
  { file: '3-mission.jpg', shot: 'mission' },
  { file: '4-night.jpg', shot: 'night' },
];

/** Biggest frame the dossier accepts (vendor/makefun-game.ts: screenshots.max_bytes). */
const MAX_BYTES = 256 * 1024;
/** Quality ladder: the first rung that fits the cap wins. */
const QUALITIES = [95, 92, 89, 86, 83, 80, 76, 72, 68, 62, 56, 48];
/** Every frame is exactly this size; anything else is a rig error, not a stylistic choice. */
const WIDTH = 1280;
const HEIGHT = 720;

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/home/ilham/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: [
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage',
    '--force-device-scale-factor=1',
  ],
});

const failures = [];
try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });

  for (const frame of FRAMES) {
    const messages = [];
    const onConsole = (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        messages.push(`${message.type()}: ${message.text()}`);
      }
    };
    const onPageError = (error) => messages.push(`pageerror: ${error.stack ?? error.message}`);
    page.on('console', onConsole);
    page.on('pageerror', onPageError);

    const started = Date.now();
    try {
      await page.goto(`${base}/?shot=${frame.shot}&seed=1&capture=1`, { waitUntil: 'commit', timeout: readyTimeout });
      await page.waitForFunction('window.__SHOT_READY === true', null, { timeout: readyTimeout });
      // Let the sky shader and the traffic shadow pass paint one more frame at full resolution.
      await page.waitForTimeout(settleMs);

      const size = await page.evaluate(() => {
        const canvas = document.getElementById('view');
        return { width: canvas.width, height: canvas.height };
      });
      if (size.width !== WIDTH || size.height !== HEIGHT) {
        throw new Error(`canvas is ${size.width}x${size.height}, expected ${WIDTH}x${HEIGHT}`);
      }

      let written = null;
      for (const quality of QUALITIES) {
        const buffer = await page.screenshot({ type: 'jpeg', quality });
        if (buffer.length <= MAX_BYTES) {
          const path = join(outDir, frame.file);
          writeFileSync(path, buffer);
          written = { path, quality, bytes: buffer.length };
          break;
        }
      }
      if (!written) throw new Error(`no JPEG quality in ${QUALITIES.join(',')} fits ${MAX_BYTES} bytes`);

      const info = await page.evaluate(() => window.__COSTA?.info ?? null);
      const errors = messages.filter((line) => line.startsWith('pageerror') || line.startsWith('error'));
      for (const line of errors) failures.push(`${frame.file}: ${line}`);
      console.log(JSON.stringify({
        file: frame.file,
        shot: frame.shot,
        bytes: statSync(written.path).size,
        quality: written.quality,
        ms: Date.now() - started,
        info,
        errors,
      }));
    } catch (error) {
      failures.push(`${frame.file}: ${error.message ?? error}`);
      console.log(JSON.stringify({ file: frame.file, shot: frame.shot, failed: String(error.message ?? error) }));
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    }
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} frame failure(s):`);
  for (const line of failures) console.error(`  ${line}`);
  process.exitCode = 1;
}
