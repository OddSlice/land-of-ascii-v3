// The benchmark in the menu (phase 3b): every fixed camera, in fair
// weather and then in rain, at the detail level in use, with the clock
// frozen at the camera's own time. Measured as tools/bench.mjs measures: the
// slowest worker's march and resolve, the median over 60 frames after a
// frame with the shadows caught up and 30 more to warm up.
//
// It runs only when asked (a button in the menu), and puts everything back
// as it was (the clock, the weather, the camera and where you stood) when
// it ends, when it is cancelled, or when the menu closes; a run cancelled
// part way does not touch anything after that.

const WEATHERS = ['fair', 'rain'];
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };

export class BenchRun {
  // `hooks`: { cameras, save(), restore(s), useCamera(i), setWeather(w),
  // freeze(), whenIdle(), timings(n), info() }
  constructor(hooks) {
    this.h = hooks;
    this.running = false;
    this.gen = 0;
    this.saved = null;
    this.rows = [];
    this.info = null;
  }

  // Run it; `progress(done, total, line)` after each camera. Resolves with
  // the rows, or null if it was cancelled.
  async run(progress = () => {}) {
    if (this.running) return null;
    const h = this.h, gen = ++this.gen;
    this.running = true;
    this.saved = h.save();
    this.rows = [];
    this.info = h.info();
    const total = h.cameras.length * WEATHERS.length;
    let done = 0;
    try {
      for (const weather of WEATHERS) {
        for (let i = 0; i < h.cameras.length; i++) {
          if (gen !== this.gen) return null;
          h.useCamera(i);
          h.setWeather(weather);
          h.freeze();
          await h.whenIdle();
          if (gen !== this.gen) return null;
          await h.timings(30);
          if (gen !== this.gen) return null;
          const t = await h.timings(60);
          if (gen !== this.gen) return null;
          const iv = t.map((x) => x.interval).filter((x) => x > 0);
          const row = { cam: i, name: h.cameras[i].name, weather, worker: median(t.map((x) => x.worker)), fps: 1000 / median(iv) };
          this.rows.push(row);
          done++;
          progress(done, total, row);
        }
      }
      return this.rows;
    } finally {
      // (a cancelled run has put things back already)
      if (gen === this.gen) this.finish();
    }
  }

  // Stop now and put everything back (`onCancel`, if set, is told).
  cancel() {
    if (!this.running) return;
    this.gen++;
    this.finish();
    if (this.onCancel) this.onCancel();
  }

  finish() {
    if (this.saved) this.h.restore(this.saved);
    this.saved = null;
    this.running = false;
  }

  // The result as plain text, to paste into a message.
  text() {
    const inf = this.info || {};
    const cams = [...new Set(this.rows.map((r) => r.cam))];
    const get = (c, w) => this.rows.find((r) => r.cam === c && r.weather === w);
    const f = (v, d = 2) => (v === undefined || v !== v ? '-' : v.toFixed(d));
    const lines = [
      `Land of Ascii benchmark, ${inf.when || ''}`,
      `${inf.browser} · ${inf.workers} · shared memory ${inf.shared ? 'yes' : 'no'} · detail ${inf.detail} (${inf.cells}) · ${inf.scene}${inf.seed !== undefined ? ` seed ${inf.seed}` : ''} · screen ${inf.screen}`,
      'frame time = the slowest worker\'s time for a frame (ms), the median of 60',
      '',
      'camera | fair ms | rain ms | fair fps | rain fps',
    ];
    for (const c of cams) {
      const a = get(c, 'fair'), b = get(c, 'rain'), r = a || b;
      lines.push(`${c + 1} ${r.name} | ${f(a && a.worker)} | ${f(b && b.worker)} | ${f(a && a.fps, 0)} | ${f(b && b.fps, 0)}`);
    }
    const worst = this.rows.reduce((m, r) => (!m || r.worker > m.worker ? r : m), null);
    if (worst) lines.push('', `slowest: ${f(worst.worker)} ms, ${worst.cam + 1} ${worst.name} (${worst.weather})`);
    return lines.join('\n');
  }
}

// The browser's name and version, and the system, in a few words.
export function browserName() {
  const ua = navigator.userAgent || '';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : /iPhone|iPad/.test(ua) ? 'iOS' : 'unknown system';
  let m;
  if ((m = ua.match(/Edg\/(\d+)/))) return `Edge ${m[1]} (${os})`;
  if ((m = ua.match(/Firefox\/(\d+)/))) return `Firefox ${m[1]} (${os})`;
  if ((m = ua.match(/Chrome\/(\d+)/))) return `Chrome ${m[1]} (${os})`;
  if ((m = ua.match(/Version\/(\d+)[^ ]* Safari/))) return `Safari ${m[1]} (${os})`;
  return `${ua.slice(0, 40)} (${os})`;
}
