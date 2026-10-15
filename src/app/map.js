// The overhead map (M): the whole world from straight above, in the same
// glyph cells as the view. Each cell gets a hit record for what lies under
// it (water, forest, road, sand, rock, snow or meadow, lit by the day's sun
// from its slope), and the same resolve step and palette as the view turn
// those into glyphs and colours. The recorded sites and the player (with
// their heading) are marked on top. The land layer is worked out once per
// grid size; only the marks change from frame to frame.
import { LOOK } from '../look.js';
import { MAT, HIT_STRIDE, REC, CELL_STRIDE, MAT_NONE } from '../contract.js';
import { makePalette, resolveStripe } from '../resolve.js';
import { MAP_GLYPH } from '../glyphs.js';
import { sunDir } from '../world/sky.js';
import { bil1, bilU8, bilD } from '../scene/cpu/sample.js';
import { GLYPHS } from '../glyphs.js';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const M = LOOK.map;

export class MapView {
  constructor(world) {
    this.world = world;
    this.on = false;
    this.key = '';
    // trees counted per 8 m square, for forest cells
    const T = world.objects.trees, n = Math.ceil(world.N / 8);
    this.trees = new Uint16Array(n * n); this.tn = n;
    for (const t of T) this.trees[Math.min(n - 1, Math.floor(t.z / 8)) * n + Math.min(n - 1, Math.floor(t.x / 8))]++;
  }

  toggle() { this.on = !this.on; }

  // The map for a grid of cols x rows cells, with the player marked.
  // (phase 5a) `fog`: what you have seen ({ seen, sn, walked, wn, found }),
  // or null for the whole map as before: then only the land you have seen
  // is drawn, the roads only where you have walked them, and the sites
  // only once found.
  // (0.5.5) `marks: false`: no one-glyph marks for the places and you (the
  // page's drawn layer, src/app/mapover.js, marks them); the fort's walls stay.
  render(cols, rows, player, fog = null, { marks = true } = {}) {
    const key = `${cols}x${rows}`;
    if (key !== this.key) this.build(cols, rows);
    const cells = this.base.slice();
    if (fog) this.cover(cells, cols, fog);
    const mark = (wx, wz, glyph, colour) => {
      const c = this.cellOf(wx, wz);
      if (!c) return;
      const o = (c[1] * cols + c[0]) * CELL_STRIDE;
      cells.set(this.markBg, o); cells[o + 3] = glyph; cells.set(colour, o + 4);
    };
    const s = this.world.sites, mk = hex(M.mark), you = hex(M.you);
    // the fort: its walls, all the way round
    const poly = fog && !fog.found.fort ? [] : s.fort.poly;
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (this.mw / 2)));
      for (let k = 0; k <= n; k++) mark(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, MAP_GLYPH.fort, mk);
    });
    if (!marks) return cells;
    s.villages.forEach((v, q) => { if (!fog || fog.found[`village${q}`]) mark(v.x, v.z, MAP_GLYPH.village, mk); });
    s.viewpoints.forEach((v, q) => { if (!fog || fog.found[`view${q}`]) mark(v.x, v.z, MAP_GLYPH.viewpoint, mk); });
    mark(s.spawn.x, s.spawn.z, MAP_GLYPH.spawn, mk);
    // the heading: two cells ahead, in the glyph nearest its direction
    // (a cell is mw metres wide and twice as tall, and twice as tall on
    // screen too, so a direction on the map is the direction in the world)
    const dx = Math.sin(player.yaw), dz = Math.cos(player.yaw);
    const oct = ((Math.round(Math.atan2(dx, dz) / (Math.PI / 4)) % 8) + 8) % 8;
    const g = MAP_GLYPH.heading[oct % 4];
    const step = Math.min(this.mw / Math.max(1e-6, Math.abs(dx)), this.mh / Math.max(1e-6, Math.abs(dz)));
    for (const k of [1, 2]) mark(player.x + dx * step * k, player.z + dz * step * k, g, you);
    mark(player.x, player.z, MAP_GLYPH.you, you);
    return cells;
  }

  // (0.5.5) where the map sits in the grid, for the drawn layer
  geometry() { return { cols: this.cols, rows: this.rows, x0: this.x0, y0: this.y0, w: this.w, h: this.h, N: this.world.N }; }

  cellOf(x, z) {
    const cx = Math.floor(this.x0 + x / this.mw), cy = Math.floor(this.y0 + (this.world.N - z) / this.mh);
    return cx >= this.x0 && cy >= this.y0 && cx < this.x0 + this.w && cy < this.y0 + this.h ? [cx, cy] : null;
  }

  build(cols, rows) {
    this.key = `${cols}x${rows}`; this.cols = cols; this.rows = rows;
    const W = this.world, T = W.terrain, N = W.N, NN = W.NN;
    // a square map: cells are twice as tall as wide, so a cell covers mh
    // metres north to south and mh / 2 west to east
    this.h = Math.max(4, Math.min(rows - 2, Math.floor((cols - 4) / 2)));
    this.w = this.h * 2;
    this.mh = N / this.h; this.mw = N / this.w;
    this.x0 = Math.floor((cols - this.w) / 2); this.y0 = Math.floor((rows - this.h) / 2);
    const hits = new Uint8Array(cols * rows * HIT_STRIDE);
    for (let i = 0; i < cols * rows; i++) { hits[i * HIT_STRIDE + REC] = MAT_NONE; hits[i * HIT_STRIDE + 2 * REC] = MAT_NONE; }
    const hits2 = new Uint8Array(cols * rows * HIT_STRIDE), roads = [];
    const sun = sunDir(LOOK.hours.day);
    const surf = { ground: T.levels[0].H, N, NN };
    const w8 = (o, mat, light, tone, dist) => {
      hits[o] = mat; hits[o + 1] = Math.max(0, Math.min(255, Math.round(light * 255)));
      hits[o + 2] = 0; hits[o + 3] = 0; hits[o + 4] = 0;
      hits[o + 5] = Math.max(0, Math.min(255, Math.round(128 + tone * 127)));
      const d = Math.min(65534, Math.round(dist * 10)); hits[o + 6] = d & 255; hits[o + 7] = d >> 8;
    };
    for (let cy = 0; cy < this.h; cy++) {
      for (let cx = 0; cx < this.w; cx++) {
        const x = (cx + 0.5) * this.mw, z = N - (cy + 0.5) * this.mh;
        const o = ((this.y0 + cy) * cols + this.x0 + cx) * HIT_STRIDE;
        // the slope over the cell, for light
        const e = this.mh / 2;
        const sx = (bil1(T.ground, x + e, z, N, NN) - bil1(T.ground, x - e, z, N, NN)) / (2 * e);
        const sz = (bil1(T.ground, x, z + e, N, NN) - bil1(T.ground, x, z - e, N, NN)) / (2 * e);
        const nl = Math.hypot(sx, sz, 1);
        const lam = Math.max(0, (-sx * sun[0] + sun[1] - sz * sun[2]) / nl);
        const tone = 0.5 * bilD(T.tone, x, z, N, NN) * (T.toneK || 1);
        // what lies under it: water first, then forest, roads, then the ground
        // (narrow rivers are looked for across the cell, so they stay whole)
        let wx = x, wz = z, wet = bilU8(T.wWater, x, z, N, NN) > 0.5;
        for (let q = -1; q <= 1 && !wet; q++) for (let r = -1; r <= 1 && !wet; r++) {
          const px = x + q * this.mw / 3, pz = z + r * this.mh / 3;
          if (bilU8(T.wWater, px, pz, N, NN) > 0.5) { wet = true; wx = px; wz = pz; }
        }
        if (wet) {
          const depth = Math.max(0, bil1(surf.ground, wx, wz, N, NN) - bil1(T.ground, wx, wz, N, NN));
          w8(o, MAT.WATER, sun[1], 0.1 * 2 - 1, 1);
          w8(o + REC, MAT.SKY, 1, 0, 0); hits[o + REC + 6] = 255; hits[o + REC + 7] = 255;
          w8(o + 2 * REC, MAT.BED, lam, 0, depth);
          continue;
        }
        let road = false;
        for (let q = -1; q <= 1 && !road; q++) for (let r = -1; r <= 1 && !road; r++) if (bilU8(T.wRoad, x + q * this.mw / 3, z + r * this.mh / 3, N, NN) > 0.5) road = true;
        const ti = Math.min(this.tn - 1, Math.floor(z / 8)) * this.tn + Math.min(this.tn - 1, Math.floor(x / 8));
        let mat;
        if (this.trees[ti] || bilU8(T.wFloor, x, z, N, NN) > 0.6) mat = MAT.CONIFER;
        else if (bilU8(T.wSnow, x, z, N, NN) > 0.5) mat = MAT.SNOW;
        else if (bilU8(T.wRock, x, z, N, NN) > 0.5) mat = MAT.ROCK;
        else if (bilU8(T.wSand, x, z, N, NN) > 0.5) mat = MAT.SAND;
        else mat = MAT.GRASS;
        // (phase 5a: the land under a road too, for a road not yet walked)
        if (road) { roads.push(cy * this.w + cx); w8(o, mat, lam, tone, 1); hits2.set(hits.subarray(o, o + HIT_STRIDE), o); w8(o, MAT.DIRT, lam, tone, 1); continue; }
        w8(o, mat, lam, tone, 1);
      }
    }
    const cells = new Uint8Array(cols * rows * CELL_STRIDE);
    resolveStripe(makePalette(LOOK.hours.day), hits, cells, cols, rows, 0);
    // (phase 5a) the roads' cells drawn as the land under them, for the map
    // of what you have seen
    const plain = new Uint8Array(cols * rows * CELL_STRIDE);
    for (const r of roads) {
      const cx = r % this.w, cy = (r - cx) / this.w, o = ((this.y0 + cy) * cols + this.x0 + cx) * HIT_STRIDE;
      hits.set(hits2.subarray(o, o + HIT_STRIDE), o);
    }
    resolveStripe(makePalette(LOOK.hours.day), hits, plain, cols, rows, 0);
    this.plain = plain; this.roadCells = roads;
    // round the map: plain frame colour
    const fr = hex(M.frame);
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      if (cx >= this.x0 && cx < this.x0 + this.w && cy >= this.y0 && cy < this.y0 + this.h) continue;
      const o = (cy * cols + cx) * CELL_STRIDE;
      cells.set(fr, o); cells[o + 3] = 0; cells.set(fr, o + 4);
    }
    this.base = cells;
    this.markBg = Uint8Array.from(hex(M.markBg));
    this.unknownBg = Uint8Array.from(hex(M.unknown)); this.unknownInk = Uint8Array.from(hex(M.unknownInk));
    this.unknownGlyph = GLYPHS.indexOf(M.unknownGlyph);
  }

  // (phase 5a) Over the whole map: land not yet seen as plain paper, roads
  // not yet walked as the land under them.
  cover(cells, cols, fog) {
    const { seen, sn, walked, wn } = fog, mw = this.mw, mh = this.mh, N = this.world.N, E = M.unknownEvery;
    if (!this.dark || this.dark.length !== this.w * this.h) this.dark = new Uint8Array(this.w * this.h);
    for (let cy = 0; cy < this.h; cy++) for (let cx = 0; cx < this.w; cx++) {
      const x = (cx + 0.5) * mw, z = N - (cy + 0.5) * mh;
      const g = Math.min(sn - 1, Math.floor(z / 16)) * sn + Math.min(sn - 1, Math.floor(x / 16));
      const o = ((this.y0 + cy) * cols + this.x0 + cx) * CELL_STRIDE;
      this.dark[cy * this.w + cx] = 0;
      if (!((seen[g >> 3] >> (g & 7)) & 1)) {
        this.dark[cy * this.w + cx] = 1;
        cells.set(this.unknownBg, o);
        cells[o + 3] = cx % E === 0 && cy % 2 === 0 ? this.unknownGlyph : 0;
        cells.set(this.unknownInk, o + 4);
      }
    }
    // a road's cell keeps its road only where one of the 8 m squares it
    // covers has been walked
    for (const r of this.roadCells) {
      const cx = r % this.w, cy = (r - cx) / this.w, o = ((this.y0 + cy) * cols + this.x0 + cx) * CELL_STRIDE;
      if (this.dark[r]) continue;
      const x0 = cx * mw, x1 = (cx + 1) * mw, z1 = N - cy * mh, z0 = N - (cy + 1) * mh;
      let walkedHere = false;
      for (let gz = Math.max(0, Math.floor(z0 / 8)); gz <= Math.min(wn - 1, Math.floor(z1 / 8)) && !walkedHere; gz++) {
        for (let gx = Math.max(0, Math.floor(x0 / 8)); gx <= Math.min(wn - 1, Math.floor(x1 / 8)); gx++) { const k = gz * wn + gx; if ((walked[k >> 3] >> (k & 7)) & 1) { walkedHere = true; break; } }
      }
      if (!walkedHere) cells.set(this.plain.subarray(o, o + CELL_STRIDE), o);
    }
  }
}
