// (phase 6) The pictures for docs/phase6.md: the front page at a laptop's
// and a phone's width; the title screen in both states (Play, on a first
// visit; Continue, with progress) and behind it each of the flyover's four
// spots; a share card made from a sketch; the map and the journal at a
// stranger's first opening. To shots/phase6/.
//
//   node tools/pictures6.mjs
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';
import { serve, ROOT } from './lib/serve.mjs';
import { openVisitor } from './lib/game.mjs';

const OUT = path.join(ROOT, 'shots', 'phase6');
fs.mkdirSync(OUT, { recursive: true });
const { server, url } = await serve();
const browser = await launch('chromium');
const save = (f) => { console.log(`shots/phase6/${f}`); return path.join(OUT, f); };
try {
  // the front page
  for (const [w, h, full, f] of [[1280, 720, false, 'front-1280x720.png'], [375, 812, true, 'front-375-phone.png']]) {
    const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await p.goto(`${url}/index.html`); await p.waitForTimeout(1200);
    await p.screenshot({ path: save(f), fullPage: full, type: 'png' });
    await p.close();
  }
  // the title screen: Play, and the flyover's four spots
  const { ctx, page } = await openVisitor(browser, url, { width: 1280, height: 720 });
  await page.waitForFunction(() => window.lab.titleState().shown);
  await page.waitForTimeout(800);
  await page.screenshot({ path: save('title-play.png') });
  for (let k = 0; k < 4; k++) {
    const cam = await page.evaluate(() => window.lab.state().camName);
    await page.evaluate(() => { document.querySelector('#title .panel').style.visibility = 'hidden'; document.querySelector('#title .foot').style.visibility = 'hidden'; });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: save(`title-spot-${k + 1}-${cam.replace(/^title: /, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`) });
    await page.evaluate(() => { document.querySelector('#title .panel').style.visibility = ''; document.querySelector('#title .foot').style.visibility = ''; });
    if (k < 3) await page.waitForFunction((c) => window.lab.state().camName !== c, cam, { timeout: 30000 });
  }
  // a little progress (the first favour, a sketch), then Continue
  await page.evaluate(() => window.lab.titlePlay());
  const id = await page.evaluate(async () => {
    const L = window.lab, m = L.progress.meet();
    L.freeze(m.arrive + 0.02, 0, 0); await L.whenIdle(); await L.whenIdle();
    const p = L.people.list()[m.person], a2 = p.yaw;
    L.setCamera({ x: p.x + Math.sin(a2) * 1.6, z: p.z + Math.cos(a2) * 1.6, yaw: (a2 + Math.PI) * 180 / Math.PI, pitch: -8 });
    await L.whenIdle(); await L.whenIdle();
    L.people.greet(); await new Promise((r) => setTimeout(r, 300)); L.progress.talk.go(); await new Promise((r) => setTimeout(r, 300)); L.progress.talk.go();
    const i = L.cameras.findIndex((c) => c.name === 'the stone bridge from its bank');
    L.camera(i); L.freeze(9, 0); await L.whenIdle(); await L.whenIdle();
    const sk = await L.progress.sketch();
    L.progress.save();
    return sk ? sk.id : null;
  });
  const card = await page.evaluate((id) => window.lab.shareCard(id), id);
  if (card) fs.writeFileSync(save('share-card.png'), Buffer.from(card.split(',')[1], 'base64'));
  await page.reload();
  await page.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 180000 });
  await page.waitForFunction(() => window.lab.titleState().shown);
  await page.waitForTimeout(800);
  await page.screenshot({ path: save('title-continue.png') });
  await ctx.close();
} finally { await browser.close(); server.close(); }
