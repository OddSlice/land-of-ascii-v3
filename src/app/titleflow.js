// The title screen's flow (phase 6; the panel itself is src/app/title.js):
// the flyover behind it (four spots from the world's own cameras, the lake
// at dawn, the fort from the road at dusk, a village green at midday, a
// viewpoint in rain, each held 20 s and cross-faded), what it says of this
// world's progress, Play or Continue (putting back the clock, the weather
// and where you stand), and on a first visit the detail level measured.
// It reads and sets the page's state through `app` (src/main.js).
import { VERSION } from './menu.js';
import { nextVisit, reducedMotion } from './settings.js';
import { START_FROM, START_LINE } from '../game/words.js';
import { LOOK } from '../look.js';

export function titleFlow(app) {
  const FLY_SECS = 20, FLY_FADE = 1500;

  function flyoverSpots() {
    const used = new Set();
    const pick = (tests) => {
      for (const t of tests) {
        const c = app.CAMS.find((q) => !used.has(q) && (t instanceof RegExp ? t.test(q.name) : q.name === t));
        if (c) { used.add(c); return c; }
      }
      return null;
    };
    const plan = [
      [['main lake shore', 'the coast', 'river valley', /bridge from its bank/], LOOK.hours.dawn + 0.25, 'fair'],
      [['the fort from the road', 'road approaching the fort', 'the wall walk over the valley'], LOOK.hours.dusk, 'fair'],
      [[/\(green\), its centre/, /its centre/, /the road in/], 12.5, 'fair'],
      [['ridge-top vista', 'forest edge across meadow', 'spawn view', /the road in/], 14, 'rain'],
    ];
    const out = [];
    for (const [tests, hour, weather] of plan) { const c = pick(tests) || pick([/./]); if (c) out.push({ ...c, hour, weather }); }
    return out;
  }
  function flySpot(k) {
    const c = app.fly.spots[k];
    app.fly.k = k; app.fly.at = performance.now(); app.fly.next = false;
    app.standAt(c.x, c.z, c.yaw, c.pitch, c.y);
    if (c.stand) app.player.feet = app.player.standOn(c.x, c.z, app.player.feet);
    app.state.held = true;
    app.fly.yaw0 = app.player.yaw;
    app.state.hour = c.hour; app.state.running = true; app.state.rate = app.CLOCK_RATE; app.state.frozen = false;
    app.state.weather = c.weather;
    app.state.camName = `title: ${c.name}`;
  }
  function flyTick(now) {
    const el = (now - app.fly.at) / 1000;
    // (a slow turn across the view; still, with reduced motion)
    if (!reducedMotion(app.display)) app.player.yaw = app.fly.yaw0 + (el / FLY_SECS - 0.5) * 9 * app.DEG;
    if (el >= FLY_SECS) app.fly.next = true;
  }
  // (just after a frame is drawn: the picture as it is lies over the next spot's, fading)
  function flyNext() {
    app.title.crossFade(app.canvas, reducedMotion(app.display) ? 0 : FLY_FADE);
    flySpot((app.fly.k + 1) % app.fly.spots.length);
  }
  // What the title says of this world's progress: null for none yet.
  function titleProgress() {
    if (!app.way || !app.way.on) return null;
    const p = app.way.progress;
    const any = Object.keys(p.found).length || Object.keys(p.met).length || p.sketches.length || Object.keys(p.favours).length;
    if (!any) return null;
    // where: the nearest place found to where you stood, else the last found
    let where = null;
    const list = app.way.places.list.filter((pl) => p.found[pl.id] && ['village', 'fort', 'viewpoint', 'bridge', 'lake', 'coast'].includes(pl.kind));
    if (p.at && list.length) { let bd = Infinity; for (const pl of list) { const d = Math.hypot(pl.x - p.at[0], pl.z - p.at[1]); if (d < bd) { bd = d; where = pl.title; } } }
    else if (list.length) where = list.slice().sort((a, b) => (p.found[b.id][0] - p.found[a.id][0]) || (p.found[b.id][1] - p.found[a.id][1]))[0].title;
    return { standing: app.way.standing.title, where, at: p.at };
  }
  function showTitle() {
    if (!app.title || app.QUIET || app.state.failed) return false;
    app.home = { x: app.player.x, z: app.player.z, yaw: app.player.yaw, pitch: app.player.pitch, hour: app.state.hour, day: app.state.day, running: app.state.running, rate: app.state.rate, frozen: app.state.frozen, weather: app.state.weather, held: app.state.held, camName: app.state.camName };
    app.fly = { spots: flyoverSpots(), k: 0 };
    if (!app.fly.spots.length) app.fly = null; else flySpot(0);
    const prog = titleProgress();
    app.title.show({ progress: prog, seed: app.SEED, version: VERSION, visit: nextVisit(), reduced: reducedMotion(app.display) });
    if (!prog && app.way && app.way.meetOn) app.title.welcome.textContent = app.way.fav.meet && app.way.fav.meet.town ? START_FROM.replace('{town}', app.way.fav.meet.town) : START_LINE;
    if (app.sound) app.title.foot.textContent += ' · sound starts with your first click or key';
    app.lab.titleSpots = app.fly ? app.fly.spots.map((c) => ({ name: c.name, hour: c.hour, weather: c.weather })) : [];
    if (wantAutoDetail()) autoDetail();
    return true;
  }
  function leaveTitle() {
    if (!app.card.up) return;
    app.title.hide();
    app.fly = null;
    Object.assign(app.state, { hour: app.home.hour, day: app.home.day, running: app.home.running, rate: app.home.rate, frozen: app.home.frozen, weather: app.home.weather, held: app.home.held, camName: app.home.camName });
    const prog = titleProgress();
    if (!app.SHARED_AT && prog && prog.at) app.player.place(prog.at[0], prog.at[1], prog.at[2], 0);
    else app.player.place(app.home.x, app.home.z, app.home.yaw, app.home.pitch);
    app.input.clear();
    app.input.capture();
    // (a first walk: the keys that matter, a while longer; else only Escape)
    app.showHint(!prog);
  }

  // (phase 6) On the first visit the detail level is chosen by measuring this
  // machine: behind the title, each level from medium up for a second and a
  // bit, the highest whose frames take the workers and the draw at most
  // 10.5 ms nine times in ten (sixty
  // frames a second with room to spare: a level that stutters is worse than
  // one a step lower). Kept; the menu's Display changes it.
  const AUTO_MS = 10.5;
  function wantAutoDetail() {
    if (app.params.get('autodetail') === '1') return true;
    return !app.display.auto && !app.DISPLAY_KEPT && !app.params.has('density') && !navigator.webdriver;
  }
  async function autoDetail() {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const measure = async (ms) => {
      // (the workers' time for a frame and the page's draw, as the benchmark judges a frame)
      const got = [], c = { push: (x) => got.push((x.worker || 0) + (x.draw || 0)) };
      app.collectors.push(c);
      await wait(ms);
      app.collectors = app.collectors.filter((q) => q !== c);
      got.sort((a, b) => a - b);
      return got.length >= 8 ? got[Math.floor(got.length * 0.9)] : Infinity;
    };
    app.title.root.classList.add('measuring');
    await wait(1000);             // (the world's first second is slower: let it pass)
    const was = app.display.density, tried = [];
    let chosen = 0;
    for (const lv of [1, 2, 3]) {
      app.setDisplay('density', lv, false);
      await wait(700);
      const p90 = await measure(1300);
      tried.push({ level: app.DETAIL_NAMES[lv], p90: Math.round(p90 * 100) / 100 });
      if (p90 <= AUTO_MS) chosen = lv; else break;
    }
    app.display.auto = true;
    app.setDisplay('density', chosen, true);
    app.title.root.classList.remove('measuring');
    app.lab.autoDetail = { chosen: app.DETAIL_NAMES[chosen], tried, was: app.DETAIL_NAMES[was] };
    app.title.say(`Detail set to ${app.DETAIL_NAMES[chosen]}: it keeps sixty frames a second on this machine. Settings, then Display, changes it.`, 10000);
  }

  return { flyTick, flyNext, showTitle, leaveTitle, titleProgress };
}
