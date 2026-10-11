// Renders scenes.html to a 30 s, 30 fps MP4: seeks the CSS timeline frame by frame, pipes JPEGs to ffmpeg.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(process.env.PW_DIR + '/');
const { chromium } = require('playwright-core');
const FPS = 30, SECS = 30;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
await page.goto('file://' + process.cwd() + '/scenes.html');
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);
const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', 'munshi-30s.mp4'], { stdio: ['pipe', 'ignore', 'inherit'] });
for (let f = 0; f < FPS * SECS; f++) {
  await page.evaluate((t) => window.seek(t), f / FPS);
  const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log('done');
