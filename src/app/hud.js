// The small HUD: frame rate, the time spent marching, resolving and drawing,
// the cell count and the time of day. H hides it.
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
    this.el.textContent =
      `${f(s.fps)} fps   march ${f(s.march)} ms   resolve ${f(s.resolve)} ms   draw ${f(s.draw)} ms\n` +
      `${s.cols} × ${s.rows} = ${s.cells.toLocaleString('en-US')} cells   density ${s.preset + 1}/4   ${s.threads ? `${s.threads} workers` : 'main thread'}\n` +
      `${time} ${s.timeName}${s.running ? ' ▸ running' : ''}${s.frozen ? ' (frozen)' : ''}   ${s.camName}\n` +
      `WASD walk · Shift run · click/drag look · 1 2 3 day dusk night · T time · C camera · G glyphs · R reference · −/+ density · H hide`;
  }
}
