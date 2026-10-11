import { moonLit } from '../world/sky.js';

// The statistics on screen. `mode` is the menu's Display choice: 'none',
// 'minimal' (the default since after phase 2b, shown as "compact": the frame
// rate, the time a frame takes the slowest worker, the cell count, the time
// and the weather, on one line) or 'full' (frame rate, the time spent marching, resolving and
// drawing, the cell count, the time of day, under the night rule 'moon' the
// day count and how much of the moon is lit, the weather; in the generated
// world its seed and whether the workers share one copy of it; in the stress
// scene how long it took to build). H shows full statistics over the choice,
// or hides them if the choice is full. The keys are listed only in the menu.
export class Hud {
  constructor(el) {
    this.el = el;
    this.mode = 'none';
    this.forced = null;            // H (or lab.setHud): this instead of the mode
    this.next = 0;
    this.text = null;
  }

  get shown() { return this.forced || this.mode; }
  get visible() { return this.shown !== 'none'; }

  toggle() { this.forced = this.forced ? null : this.mode === 'full' ? 'none' : 'full'; this.next = 0; }
  setMode(m) { this.mode = m; this.forced = null; this.next = 0; }
  force(m) { this.forced = m; this.next = 0; }

  update(now, s) {
    if (now < this.next) return;
    this.next = now + 250;
    const show = this.shown;
    let text = '';
    if (show !== 'none') {
      const f = (v) => (v === undefined || isNaN(v) ? '–' : v.toFixed(1));
      const hh = Math.floor(s.hour), mm = Math.floor((s.hour - hh) * 60);
      const time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      const w = s.world;
      const mode = w ? (w.mode === 'fly' ? '   flying' : w.mode === 'swim' ? '   swimming' : w.mode === 'wade' ? '   wading' : w.mode === 'slide' ? '   sliding' : '') : '';
      const legend = w && w.map ? 'map: # fort site · o village sites · * viewpoints · + spawn · @ you (M closes)\n' : '';
      const weather = s.weather ? `, ${s.weather}` : '';
      if (show === 'minimal') {
        const work = s.march + s.resolve;
        text = `${String(Math.round(s.fps || 0)).padStart(3)} fps · ${isNaN(work) ? '–' : work.toFixed(1)} ms · ${s.cells.toLocaleString('en-US')} cells · ${time} ${s.timeName}${weather}${mode}\n${legend}`;
      } else {
        text =
          `${f(s.fps)} fps${s.pace > 1 ? ` (every ${s.pace === 2 ? '2nd' : s.pace === 3 ? '3rd' : `${s.pace}th`} refresh)` : ''}   march ${f(s.march)} ms   resolve ${f(s.resolve)} ms   draw ${f(s.draw)} ms\n` +
          `${s.cols} × ${s.rows} = ${s.cells.toLocaleString('en-US')} cells   density ${s.preset + 1}/4   ${s.threads ? `${s.threads} workers` : 'main thread'}\n` +
          `${time} ${s.timeName}${s.night === 'moon' ? `, day ${s.day}, moon ${Math.round(100 * moonLit(s.hour, s.day))}% lit` : ''}${weather}${s.running ? ' ▸ running' : ''}${s.frozen ? ' (frozen)' : ''}   ${s.camName}${mode}\n` +
          (w ? `world: seed ${w.seed}, built in ${(w.buildMs / 1000).toFixed(1)} s   ${!s.threads ? 'all on the page' : w.shared ? 'shared memory: the workers read one world, one sweeps the shadows'
            : `no shared memory (${w.isolated ? 'off' : 'page not cross-origin isolated'}): each worker holds its own copy`}\n` : '') +
          (s.stress ? `stress scene: built in ${Math.round(s.buildMs)} ms, shadow sweep ${f(s.sweepMs)} ms${s.settled ? '' : ', shadows catching up'}\n` : '') +
          legend;
      }
    }
    if (text !== this.text) {
      this.text = text;
      this.el.textContent = text;
      this.el.style.display = text ? '' : 'none';
    }
  }
}
