// The map's drawn layer (0.5.5): what the glyph map (src/app/map.js) cannot
// say in cells, laid over it in the page: the compass (north, east, south
// and west on the frame, and a rose), the places you have found with their
// names and a mark for each kind, the rivers' and the lake's names, a scale,
// a legend, and you: an arrow the way you face, with your view's wedge.
// Under it, which way you face and the nearest village or the fort.
//
// It is placed from the map's own cells: the canvas's place on the page,
// and the square of cells the map takes (MapView.geometry()), so a place's
// mark sits on its cell at any size. The marks and names are laid out again
// when the size or what you have found changes (at most once a second);
// the arrow moves every frame. Nothing here is drawn in the tools' pictures
// (the canvas's cells are as they were, less the old one-glyph marks).
import { placesOf, compass, namesOf } from '../game/places.js';

const SVG = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
// the marks: one stroke weight, as the menu's icons
const MARK = {
  village: '<path d="M4.5 11.5 12 5l7.5 6.5M6.5 10v8.5h11V10"/><path d="M10.5 18.5v-4.5h3v4.5"/>',
  fort: '<path d="M5 20V8h2.5v2.5H10V8h4v2.5h2.5V8H19v12z"/><path d="M10.5 20v-4a1.5 1.5 0 0 1 3 0v4"/>',
  viewpoint: '<path d="M3 19 10 7l3.5 6 2-3L21 19z"/>',
  bridge: '<path d="M3 9.5h18M3 9.5v8M21 9.5v8M6.5 17.5a5.5 5.5 0 0 1 11 0"/>',
  source: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/>',
  foot: '<path d="M3 18 8 11l3 3 5-7 5 11"/>',
  coast: '<path d="M3 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  lake: '<path d="M4 13c2.5-3 5-3 8 0s5.5 3 8 0"/><ellipse cx="12" cy="12" rx="9" ry="6"/>',
};
const LEGEND_MARKS = [['village', 'village'], ['fort', 'the fort'], ['viewpoint', 'hill'], ['bridge', 'bridge'], ['source', "a river's head"]];
const LEGEND_LAND = [['road', 'road'], ['water', 'water'], ['forest', 'forest'], ['meadow', 'meadow'], ['rock', 'rock and scree'], ['snow', 'snow'], ['unknown', 'not yet seen']];
const NICE = [50, 100, 200, 250, 500, 1000];
const km = (m) => (m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

export class MapOverlay {
  constructor(world, root) {
    this.world = world;
    this.root = root;
    this.places = placesOf(world).list;
    this.names = namesOf(world);
    this.key = '';
    this.el = {};
    root.innerHTML = `
      <div class="frame"></div>
      <div class="ns n">N</div><div class="ns s">S</div><div class="ew e">E</div><div class="ew w">W</div>
      <div class="rose">${SVG('<circle cx="24" cy="24" r="19"/><path class="tick" d="M24 3v5M24 40v5M3 24h5M40 24h5"/><path class="north" d="M24 8 28.5 24H19.5z"/><path class="south" d="M24 40 19.5 24h9z"/><text x="24" y="2.5">N</text>', '-2 -8 52 58')}</div>
      <div class="labels"></div>
      <div class="you">${SVG('<path class="cone" d="M0 0 L-34 -60 A70 70 0 0 1 34 -60 Z"/><circle class="ring" r="11"/><path class="arrow" d="M0 -10 7 8 0 4 -7 8z"/>', '-80 -80 160 160')}</div>
      <aside class="legend">
        <h2>Map</h2>
        <p class="found"></p>
        <ul class="marks">${LEGEND_MARKS.map(([k, t]) => `<li><span class="mk ${k}">${SVG(MARK[k])}</span>${t}</li>`).join('')}
          <li><span class="mk youmk">${SVG('<path d="M12 4 18 19 12 15.5 6 19z"/>')}</span>you, the way you face</li></ul>
        <ul class="land">${LEGEND_LAND.map(([k, t]) => `<li><span class="sw ${k}"></span>${t}</li>`).join('')}</ul>
      </aside>
      <div class="scale"><span class="bar"></span><span class="len"></span></div>
      <footer class="readout"><span class="facing"></span><span class="near"></span><span class="keys"><kbd>M</kbd>close</span></footer>`;
    for (const k of ['frame', 'labels', 'you', 'legend', 'scale', 'readout', 'rose']) this.el[k] = root.querySelector(`.${k}`);
    for (const k of ['n', 's', 'e', 'w']) this.el[k] = root.querySelector(`.${k === 'n' || k === 's' ? 'ns' : 'ew'}.${k}`);
    this.el.found = root.querySelector('.found');
    this.el.bar = root.querySelector('.scale .bar'); this.el.len = root.querySelector('.scale .len');
    this.el.facing = root.querySelector('.facing'); this.el.near = root.querySelector('.near');
    this.el.arrow = root.querySelector('.you svg');
  }

  show(on) { this.root.hidden = !on; if (!on) this.key = ''; }

  // g: the map's square of cells ({ cols, rows, x0, y0, w, h, N }); rect:
  // the canvas on the page; you: { x, z, yaw, hfov }; fog: null (all), or
  // { found, seen, sn } (what you have found and seen).
  update(g, rect, you, fog, now = performance.now()) {
    const cw = rect.width / g.cols, ch = rect.height / g.rows;
    const L = rect.left + g.x0 * cw, T = rect.top + g.y0 * ch, W = g.w * cw, H = g.h * ch;
    const at = (x, z) => [L + (x / g.N) * W, T + ((g.N - z) / g.N) * H];
    const nFound = fog ? Object.keys(fog.found).length : -1;
    const key = `${Math.round(L)},${Math.round(T)},${Math.round(W)},${Math.round(H)},${nFound},${Math.floor(now / 1000)}`;
    if (key !== this.key) { this.key = key; this.layout(g, { L, T, W, H }, at, fog, rect); }
    // you
    const [px, py] = at(you.x, you.z), deg = you.yaw * 180 / Math.PI;
    this.el.you.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
    this.el.arrow.style.transform = `rotate(${deg.toFixed(1)}deg)`;
    const cone = this.el.arrow.querySelector('.cone'), half = Math.min(1.3, (you.hfov || 1.4) / 2), r = 70;
    if (this.half !== half) { this.half = half; const sx = Math.sin(half) * r, sy = -Math.cos(half) * r; cone.setAttribute('d', `M0 0 L${-sx.toFixed(1)} ${sy.toFixed(1)} A${r} ${r} 0 0 1 ${sx.toFixed(1)} ${sy.toFixed(1)} Z`); }
    // which way you face, and the nearest village or the fort you know
    const word = compassOfYaw(you.yaw);
    if (word !== this.word) { this.word = word; this.el.facing.textContent = `facing ${word}`; }
    let best = null, bd = Infinity;
    for (const p of this.places) {
      if (p.kind !== 'village' && p.kind !== 'fort') continue;
      if (fog && !fog.found[p.id]) continue;
      const d = Math.hypot(p.x - you.x, p.z - you.z);
      if (d < bd) { bd = d; best = p; }
    }
    const near = best ? (bd < 60 ? `in ${best.title}` : `${best.title} ${km(bd)} ${compass(you.x, you.z, best.x, best.z)}`) : 'no village found yet';
    if (near !== this.nearText) { this.nearText = near; this.el.near.textContent = near; }
  }

  layout(g, box, at, fog, rect) {
    const { L, T, W, H } = box, el = this.el;
    const px = (v) => `${v.toFixed(1)}px`;
    Object.assign(el.frame.style, { left: px(L), top: px(T), width: px(W), height: px(H) });
    // the compass on the frame: N and S just inside it, E and W outside if there is room
    const side = L - rect.left;
    Object.assign(el.n.style, { left: px(L + W / 2), top: px(T + 6) });
    Object.assign(el.s.style, { left: px(L + W / 2), top: px(T + H - 6) });
    Object.assign(el.e.style, { left: px(L + W + (side > 30 ? 14 : -14)), top: px(T + H / 2) });
    Object.assign(el.w.style, { left: px(L - (side > 30 ? 14 : -14)), top: px(T + H / 2) });
    // the rose: in the right margin if it fits, else in the map's top right corner
    const roomR = rect.right - (L + W);
    Object.assign(el.rose.style, roomR > 110 ? { left: px(L + W + 24), top: px(T + 14) } : { left: px(L + W - 74), top: px(T + 26) });
    // the legend: in the left margin if it fits, else over the map's bottom left
    const wide = side >= 160;
    el.legend.classList.toggle('over', !wide);
    Object.assign(el.legend.style, wide ? { left: px(rect.left + 12), top: px(T + 14), width: px(Math.min(230, side - 44)), bottom: '' } : { left: px(L + 10), top: '', bottom: px(window.innerHeight - (T + H) + 10), width: '' });
    const all = this.places.length, found = fog ? Object.keys(fog.found).filter((k) => this.places.some((p) => p.id === k)).length : all;
    el.found.textContent = fog ? `${found} of ${all} places found` : `all ${all} places`;
    el.legend.querySelector('.sw.unknown').parentElement.hidden = !fog;
    // the scale: a round length about a sixth of the map
    const perPx = g.N / W, want = (W / 6) * perPx, len = NICE.reduce((b, n) => (Math.abs(n - want) < Math.abs(b - want) ? n : b), NICE[0]);
    el.bar.style.width = px(len / perPx); el.len.textContent = km(len);
    Object.assign(el.scale.style, { left: px(L + W - len / perPx - 18), top: px(T + H - 30) });
    // the readout: in the right margin under the rose, else along the map's top
    const side2 = roomR >= 150;
    el.readout.classList.toggle('side', side2);
    Object.assign(el.readout.style, side2 ? { left: px(L + W + 16), top: px(T + 96), width: px(Math.min(230, roomR - 28)) } : { left: px(L + 8), top: px(T + 34), width: px(W - 16) });
    // the names
    const out = [], boxes = [];
    const seen = (x, z) => {
      if (!fog || !fog.seen) return true;
      const gi = Math.min(fog.sn - 1, Math.max(0, Math.floor(z / 16))) * fog.sn + Math.min(fog.sn - 1, Math.max(0, Math.floor(x / 16)));
      return ((fog.seen[gi >> 3] >> (gi & 7)) & 1) === 1;
    };
    const fits = (b) => b.x0 >= L + 2 && b.x1 <= L + W - 2 && b.y0 >= T + 18 && b.y1 <= T + H - 2 && !boxes.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0);
    // (the land's own names first: the lake, the rivers, in the water's ink)
    const water = [];
    const lake = this.places.find((p) => p.kind === 'lake');
    if (lake && (!fog || fog.found.lake || seen(lake.x, lake.z))) water.push({ x: lake.x, z: lake.z, text: lake.title, ang: 0 });
    (this.world.rivers || []).forEach((rv, i) => {
      const k = Math.floor(rv.n * 0.42), k0 = Math.max(0, k - 25), k1 = Math.min(rv.n - 1, k + 25);
      if (!seen(rv.x[k], rv.z[k])) return;
      let ang = Math.atan2(-(rv.z[k1] - rv.z[k0]) * H / g.N, (rv.x[k1] - rv.x[k0]) * W / g.N) * 180 / Math.PI;
      if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      water.push({ x: rv.x[k], z: rv.z[k], text: this.names.rivers[i], ang: Math.max(-55, Math.min(55, ang)) });
    });
    for (const w of water) {
      const [x, y] = at(w.x, w.z), wd = w.text.length * 6.6 + 8;
      const b = { x0: x - wd / 2, x1: x + wd / 2, y0: y - 8, y1: y + 8 };
      if (!fits(b)) continue;
      boxes.push(b);
      out.push(`<span class="water" style="left:${px(x)};top:${px(y)};transform:translate(-50%,-50%) rotate(${w.ang.toFixed(0)}deg)">${esc(w.text)}</span>`);
    }
    // the places: a mark on the spot, the name beside it (right, left, above, below: the first that is clear)
    const order = { fort: 0, village: 1, viewpoint: 2, bridge: 3, coast: 4, source: 5, foot: 6 };
    const list = this.places.filter((p) => p.kind !== 'lake' && (!fog || fog.found[p.id])).sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
    for (const p of list) {
      const [x, y] = at(p.x, p.z), big = p.kind === 'village' || p.kind === 'fort';
      const text = shortName(p), cwid = big ? 7.4 : 6.4, wd = text.length * cwid + 10, hh = big ? 18 : 15, m = big ? 11 : 9;
      boxes.push({ x0: x - m, x1: x + m, y0: y - m, y1: y + m });
      out.push(`<span class="mark ${p.kind}" style="left:${px(x)};top:${px(y)}">${SVG(MARK[p.kind] || MARK.source)}</span>`);
      const tries = [[m + 3, -hh / 2], [-m - 3 - wd, -hh / 2], [-wd / 2, -m - 2 - hh], [-wd / 2, m + 2]];
      for (const [dx, dy] of tries) {
        const b = { x0: x + dx, x1: x + dx + wd, y0: y + dy, y1: y + dy + hh };
        if (!fits(b)) continue;
        boxes.push(b);
        out.push(`<span class="name ${big ? 'big' : ''} ${p.kind}" style="left:${px(b.x0)};top:${px(b.y0)}">${esc(text)}</span>`);
        break;
      }
    }
    el.labels.innerHTML = out.join('');
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// a shorter name for the map: "the bridge over the Skell" -> "Skell bridge"
function shortName(p) {
  const t = p.title;
  let m;
  if (p.kind === 'bridge' && (m = /over (?:the )?(.+)$/.exec(t))) return `${m[1]} bridge`;
  if (p.kind === 'source' && (m = /head of (?:the )?(.+)$/.exec(t))) return `${m[1]} head`;
  if (p.kind === 'foot') return 'foot of the hills';
  return t;
}
const WORDS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
function compassOfYaw(yaw) { return WORDS[((Math.round(yaw / (Math.PI / 4)) % 8) + 8) % 8]; }
