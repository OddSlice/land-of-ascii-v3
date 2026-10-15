// The game as the menu and the title screen see it (src/app/menu.js reads
// and sets everything through it): the Display choices, the clock and the
// weather, the cameras and the scenes, a new world, sharing, full screen,
// the keys a player can change, the people, the animals and the progress,
// and the benchmark (src/app/benchrun.js). It reaches the page's state
// through `app` (src/main.js).
import { BenchRun, browserName } from './benchrun.js';
import { ACTIONS, defaultKeys, isDefault, keyLabel, refuse } from './keys.js';
import { LOOK } from '../look.js';
import { moonLit } from '../world/sky.js';

export function makeGame(app) {
  const reload = (q) => { location.search = q.toString(); };

  const game = {
    scene: app.WORLD ? 'world' : app.STRESS ? 'stress' : app.YARD ? 'yard' : 'lab',
    seed: app.SEED,
    cameras: app.CAMS,
    get display() { return app.display; },
    // (phase 5b) the Sound section's
    get sound() { return app.sound; },
    setDisplay: app.setDisplay,
    get rate() { return app.state.running ? app.state.rate : 0; },
    setRate(r) { if (r === 0) app.state.running = false; else { app.state.rate = r; app.state.running = true; app.state.frozen = false; } },
    get weather() { return app.state.weather; },
    setWeather(m) { app.state.weather = m; },
    setTime(name) { app.setTime(name); },
    camera(i) { app.useCamera(i); },
    newWorld(seed) { const q = new URLSearchParams(location.search); q.delete('at'); q.delete('hour'); q.set('seed', String(seed !== undefined ? seed : (Math.random() * 1e6) >>> 0)); reload(q); },
    goScene(sc) {
      const q = new URLSearchParams(location.search);
      q.delete('lab'); q.delete('stress'); q.delete('yard');
      if (sc === 'lab') q.set('lab', '1'); else if (sc === 'stress') q.set('stress', '1'); else if (sc === 'yard') q.set('yard', '1');
      reload(q);
    },
    // A link to this exact world (its seed), to the clipboard.
    copyLink() { return this.copyText(app.shareLink(false)); },
    // (phase 6) Share this world: the link, with where you stand and the hour if asked
    shareLink(withPlace) { return app.shareLink(withPlace); },
    share(withPlace) { return this.copyText(app.shareLink(withPlace)); },
    // (phase 6) full screen, and the keys a player can change
    fullscreen: () => app.toggleFullscreen(),
    get isFullscreen() { return !!document.fullscreenElement; },
    keys: {
      actions: ACTIONS, label: keyLabel,
      get: () => ({ ...app.keys }),
      isDefault: () => isDefault(app.keys),
      // the next key pressed binds `action`; done(code) or done(null, why)
      listen(action, done) {
        app.input.listen = (code) => {
          if (code === 'Escape') { done(null, 'unchanged'); return; }
          const why = refuse(app.keys, action, code);
          if (why) { done(null, why); return; }
          app.setKeys({ ...app.keys, [action]: code });
          done(code);
        };
      },
      cancel() { app.input.listen = null; },
      reset() { app.setKeys(defaultKeys()); },
    },
    // Some text to the clipboard (the benchmark's result too).
    async copyText(link) {
      try { await navigator.clipboard.writeText(link); return true; } catch { /* try the old way */ }
      try {
        const t = document.createElement('textarea');
        t.value = link; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.append(t); t.select();
        const ok = document.execCommand('copy');
        t.remove();
        return ok;
      } catch { return false; }
    },
    // Where the clock and the sky stand, for the menu: `preset` names the time
    // of day only while the clock stands exactly on it.
    now() {
      return {
        clock: app.clockText(), timeName: app.keyName(app.state.hour), day: app.state.day, running: app.state.running,
        preset: ['dawn', 'day', 'dusk', 'night'].find((k) => Math.abs(app.state.hour - LOOK.hours[k]) < 1e-9) || null,
        moon: Math.round(100 * moonLit(app.state.hour, app.state.day)),
        weather: app.WORLD || app.state.weather !== 'fair' ? app.weatherName() : 'fair',
      };
    },
    weatherLine() {
      if (!app.WORLD && app.state.weather === 'fair') return 'The Look Lab and the stress scene keep fair weather unless one is held here.';
      if (typeof app.state.weather === 'object') return `set by a tool: ${app.weatherName()}${app.state.weather.wet ? ', wet ground' : ''}`;
      return app.state.weather === 'auto' ? `now ${app.weatherName()}, from the forecast for seed ${app.SEED}, day ${app.state.day}` : `held: ${app.state.weather}`;
    },
    // (phase 4a) everyone, for the menu's list
    get people() { return app.people ? app.lab.people : null; },
    // (phase 4b) the animals, for the menu's counts and its camera buttons
    get animals() { return app.animals ? app.lab.animals : null; },
    // (phase 5a) what is saved for this world, for the menu's World section
    get progress() {
      if (!app.way || !app.way.on) return null;
      return { line: () => app.way.saveLine(), note: () => app.way.store.note, backup: () => app.way.backup(), restore: (t) => app.way.restore(t), clear: () => app.way.clear(), open: (seed) => this.newWorld(seed) };
    },
    workersLine() {
      if (!app.THREADS) return 'everything on the page, no workers';
      if (!app.WORLD) return `${app.THREADS} workers, each building its own copy of the scene`;
      return app.SHARED ? `${app.THREADS} workers, sharing one copy of the world (shared memory)`
        : `${app.THREADS} workers, each with its own copy of the world (${app.ISOLATED ? 'shared memory off' : 'the page is not cross-origin isolated'})`;
    },
    close({ recapture }) { app.closeMenu(recapture); },
  };
  game.bench = new BenchRun({
    cameras: app.CAMS,
    save: () => ({ hour: app.state.hour, t: app.state.t, day: app.state.day, running: app.state.running, frozen: app.state.frozen, weather: app.state.weather, cam: app.state.cam, camName: app.state.camName, held: app.state.held,
      x: app.player.x, z: app.player.z, feet: app.player.feet, yaw: app.player.yaw, pitch: app.player.pitch, vy: app.player.vy, eyeLag: app.player.eyeLag }),
    restore: (s) => {
      Object.assign(app.state, { hour: s.hour, t: s.t, day: s.day, running: s.running, frozen: s.frozen, weather: s.weather, cam: s.cam, camName: s.camName, held: s.held });
      Object.assign(app.player, { x: s.x, z: s.z, feet: s.feet, yaw: s.yaw, pitch: s.pitch, vy: s.vy, eyeLag: s.eyeLag });
    },
    useCamera: (i) => app.useCamera(i),
    setWeather: (w) => { app.state.weather = w; },
    freeze: () => { app.state.frozen = true; app.state.running = false; },
    whenIdle: () => app.lab.whenIdle(),
    timings: (n) => app.lab.timings(n),
    info: () => ({
      when: new Date().toISOString().slice(0, 16).replace('T', ' '), browser: browserName(),
      workers: app.THREADS ? `${app.THREADS} workers` : 'no workers', shared: app.SHARED,
      detail: app.DETAIL_NAMES[app.state.preset] || String(app.state.preset), cells: `${app.grid.cells} cells, ${app.grid.cols} x ${app.grid.rows}`,
      scene: game.scene, seed: app.WORLD ? app.SEED : undefined, screen: `${innerWidth} x ${innerHeight} at ${devicePixelRatio}`,
    }),
  });
  return game;
}
