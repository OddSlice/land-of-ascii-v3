// (phase 6) A stranger's first two minutes, as a video (shots/walks/, kept
// out of git): the front page, Play, the title screen and a cross-fade,
// Play again, a look round, up to the signpost, then down the road to meet
// the person walking up to you, the prompt, the greeting and the favour,
// the journal. Recorded by the browser (no sound: a tool's browser records
// the picture only). The walking is by the keys, steered toward where
// each stretch goes as a player would turn.
//
//   node tools/first-video.mjs
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';
import { serve, ROOT } from './lib/serve.mjs';

const OUT = path.join(ROOT, 'shots', 'walks');
fs.mkdirSync(OUT, { recursive: true });
const { server, url } = await serve();
const browser = await launch('chromium');
const t0 = Date.now(), at = () => ((Date.now() - t0) / 1000).toFixed(0);
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await page.goto(`${url}/index.html`);
  await page.waitForTimeout(7000);
  await page.mouse.move(640, 300, { steps: 20 });
  await page.hover('a.play'); await page.waitForTimeout(1200);
  await page.click('a.play');
  await page.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 180000 });
  console.log(`${at()} s: the title screen`);
  // (a spot, and the cross-fade into the next)
  await page.waitForFunction(() => /fort/.test(window.lab.state().camName), null, { timeout: 40000 });
  await page.waitForTimeout(3500);
  await page.keyboard.press('Enter');
  console.log(`${at()} s: Play`);
  await page.waitForTimeout(2500);
  // a look round, by the arrow keys
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(1400); await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(2600); await page.keyboard.up('ArrowRight');
  // walk toward a point, turning toward it as a player would, until near it
  const walkTo = async (x, z, near, maxMs) => {
    const end = Date.now() + maxMs;
    await page.keyboard.down('KeyW');
    while (Date.now() < end) {
      const d = await page.evaluate(({ x, z }) => {
        const L = window.lab, s = L.state();
        const want = Math.atan2(x - s.x, z - s.z) * 180 / Math.PI;
        let dy = want - s.yaw; dy = ((dy + 540) % 360) - 180;
        L.face(s.yaw + Math.max(-6, Math.min(6, dy)));
        return Math.hypot(x - s.x, z - s.z);
      }, { x, z });
      if (d < near) break;
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('KeyW');
  };
  const sign = await page.evaluate(() => window.lab.signs()[0]);
  await walkTo(sign.x + 1.5, sign.z + 1.5, 1.2, 15000);
  console.log(`${at()} s: by the signpost`);
  await page.waitForTimeout(4500);
  // down the road to meet whoever is coming up it
  const meet = await page.evaluate(() => window.lab.progress.meet());
  await walkTo(meet.spot.x, meet.spot.z, 6, 30000);
  await page.waitForFunction((i) => { const s = window.lab.state(), p = window.lab.people.list()[i]; return Math.hypot(p.x - s.x, p.z - s.z) < 9; }, meet.person, { timeout: 90000 });
  const p = await page.evaluate((i) => window.lab.people.list()[i], meet.person);
  await walkTo(p.x, p.z, 2.4, 8000);
  console.log(`${at()} s: with ${meet.name}`);
  await page.waitForTimeout(1800);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(7000);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(3500);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(4500);
  await page.keyboard.press('KeyJ'); await page.waitForTimeout(6000);
  await page.keyboard.press('KeyJ'); await page.waitForTimeout(1500);
  console.log(`${at()} s: the end`);
  const video = page.video();
  await ctx.close();
  const f = path.join(OUT, 'phase6-a-strangers-first-minutes.webm');
  fs.renameSync(await video.path(), f);
  console.log(`${path.relative(ROOT, f)}: ${(fs.statSync(f).size / 1e6).toFixed(1)} MB`);
} finally { await browser.close(); server.close(); }
