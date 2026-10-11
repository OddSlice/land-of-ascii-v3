import { moonLit } from '../world/sky.js';

// The small HUD: frame rate, the time spent marching, resolving and drawing,
// the cell count, the time of day (and under the night rule 'moon' the day
// count and how much of the moon is lit); in the generated world its seed and
// whether the workers share one copy of it; in the stress scene how long it
// took to build. H hides it.
export class Hud {
  constructor(el) {
    this.el = el;
    this.visible = true;
    this.next = 0;
  }

  toggle() { this.visible = !this.visible; this.el.style.display = this.visible ? '' : 'none'; }

  update(now, s) {
    if (!this.visible || now < this.next) return;
    this.next = now + 250;
    const f = (v) => (v === undefined || isNaN(v) ? '–' : v.toFixed(1));
    const hh = Math.floor(s.hour), mm = Math.floor((s.hour - hh) * 60);
    const time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const w = s.world;
    const mode = w ? (w.mode === 'fly' ? '   flying' : w.mode === 'swim' ? '   swimming' : w.mode === 'wade' ? '   wading' : w.mode === 'slide' ? '   sliding' : '') : '';
    this.el.textContent =
      `${f(s.fps)} fps${s.pace > 1 ? ` (every ${s.pace === 2 ? '2nd' : s.pace === 3 ? '3rd' : `${s.pace}th`} refresh)` : ''}   march ${f(s.march)} ms   resolve ${f(s.resolve)} ms   draw ${f(s.draw)} ms\n` +
      `${s.cols} × ${s.rows} = ${s.cells.toLocaleString('en-US')} cells   density ${s.preset + 1}/4   ${s.threads ? `${s.threads} workers` : 'main thread'}\n` +
      `${time} ${s.timeName}${s.night === 'moon' ? `, day ${s.day}, moon ${Math.round(100 * moonLit(s.hour, s.day))}% lit` : ''}${s.running ? ' ▸ running' : ''}${s.frozen ? ' (frozen)' : ''}   ${s.camName}${mode}\n` +
      (w ? `world: seed ${w.seed}, built in ${(w.buildMs / 1000).toFixed(1)} s   ${!s.threads ? 'all on the page' : w.shared ? 'shared memory: the workers read one world, one sweeps the shadows'
        : `no shared memory (${w.isolated ? 'off' : 'page not cross-origin isolated'}): each worker holds its own copy`}\n` : '') +
      (s.stress ? `stress scene: built in ${Math.round(s.buildMs)} ms, shadow sweep ${f(s.sweepMs)} ms${s.settled ? '' : ', shadows catching up'}\n` : '') +
      (w && w.map ? 'map: # fort site · o village sites · * viewpoints · + spawn · @ you (M closes)\n' : '') +
      (w ? 'WASD walk · Shift run · F fly (Space up) · M map · R new world · click/drag look · 1 2 3 4 day dusk night dawn · T time · C camera · G glyphs · −/+ density · L look · H hide'
        : `WASD walk · Shift run · click/drag look · 1 2 3 4 day dusk night dawn · T time · C camera · G glyphs · R reference · −/+ density · X ${s.stress ? 'lab scene' : 'stress scene'} · L look · H hide`);
  }
}
