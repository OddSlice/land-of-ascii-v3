// The building kit (phase 3a): structures as exact shapes.
//
// A structure is described as data, a list of pieces (src/world/kit-pieces.js
// turns each into shapes); compileKit() turns the shapes of every structure in
// a world into flat tables that the renderer (src/scene/cpu/build.js), the
// shadows, the walking and the tools all read. The same description always
// compiles to the same tables, in any thread.
//
// The shapes, each turned about the vertical by its own angle, so a building
// can stand at any angle and is never locked to the grid:
// - BOX: an upright box (a wall, a tower, a floor, a step);
// - CYL: an upright cylinder (a round tower, a well);
// - PRISM: a gable roof, its ridge along the box's length;
// - STAIR: a flight of steps rising along the box's length, solid beneath;
// - PANE: a window's light, emissive, held at two rows like a flame.
// A shape can have openings cut out of it (holes): an upright box (a
// doorway, a room inside a tower), an upright cylinder (a round tower's
// inside) or an arch (a box with a half-round top: the gate's passage). A
// shape's top can be crenellated: a band along its top, cut into merlons and
// gaps along its length (or round it, for a cylinder).
//
// Local frame of a shape or hole turned by angle a: its u axis runs along
// (cos a, sin a) in world (x, z), its w axis along (-sin a, cos a); u is the
// length, w the depth.

// shape types
export const PT = { BOX: 1, CYL: 2, PRISM: 3, STAIR: 4, PANE: 5, ELL: 6, LOG: 7, REED: 8 };
// (phase 4b, the wild ground detail)
// - ELL: an ellipsoid (a boulder, a stone of an outcrop): half sizes hx along
//   u, hz along w, ry up and down from its middle at BASE (ry = Y1 - BASE);
//   cut flat at Y0 (below the ground it is sunk in)
// - LOG: a cylinder lying along u (a fallen trunk): half length hx, radius
//   hz, its axis at BASE; its round side is MAT, its cut ends MAT2
// - REED: a bed of reeds, a round of radius hx from Y0 up to about Y1, its
//   top ragged; it can be walked through (PASS), and it parts round a walker
// hole types
export const HT = { BOX: 1, CYL: 2, ARCH: 3 };
// shape flags
export const PF = {
  CRENEL: 1,            // the top band is crenellated
  GROW: 2,              // held at least two cells across far away (thin parts)
  INSIDE: 4,            // every surface of it is inside its room (a floor, a stair in a tower)
  WALK: 8,              // its top can be walked on (for the tools)
  // (phase 3b) a thin part (a fence rail or post, a signpost's arm, a
  // chimney's pot): held at least two cells across and two rows tall far
  // away, as GROW, but only while it really is at least HOLD_MIN of that;
  // smaller still, it is not drawn at all
  HOLD: 16,
  // (phase 4b) small wild detail far off: held at two cells across and two
  // rows tall, and faded by how much of that it really is (a person's far
  // silhouette's rule); under about 6% it is not drawn
  FADE: 32,
  // (phase 4b) not solid: nothing stands on it or is stopped by it (reeds)
  PASS: 64,
};
export const HOLD_MIN = 0.35;
// what a surface's texture is
// (ASHLAR, PAVING, TIMBERED and TILES, phase 3b: the villages' and bridges'
// dressed stone, paving, timber framing and shingle roofs, as MASONRY, FLAGS,
// FRAME and SHINGLE but without
// the detail that blinks as you walk right past or turn (see primShade); the
// fort keeps its own)
export const TX = { PLAIN: 0, MASONRY: 1, FRAME: 2, SHINGLE: 3, BOARDS: 4, FLAGS: 5, THATCH: 6, RUBBLE: 7, ASHLAR: 8, PAVING: 9, TIMBERED: 10, TILES: 11,
  // (phase 4b) the wild detail: a boulder's lichen and grain, an outcrop's
  // bedding, bark, a cut end's rings, reed stems
  BOULDER: 12, STRATA: 13, BARK: 14, RINGS: 15, REEDS: 16 };

// shape table: P_STRIDE numbers per shape
export const P_STRIDE = 28;
export const P = {
  TYPE: 0, CX: 1, CZ: 2, CA: 3, SA: 4, HX: 5, HZ: 6, Y0: 7, Y1: 8,
  MAT: 9, FLAGS: 10,
  MH: 11,               // crenel band height
  PER: 12,              // crenel period (metres along u; for a cylinder, merlons round it)
  MW: 13,               // the share of a period a merlon takes
  PH: 14,               // crenel phase (metres, or turns for a cylinder)
  RISE: 15, RUN: 16,    // a stair's step (counted up from BASE; its solid reaches down to Y0)
  H0: 17, HN: 18,       // its holes: first index and count
  ROOM: 19,             // the room its surfaces are inside (-1: outside)
  SEED: 20, TEX: 21,
  BASE: 22,             // the height masonry courses count from
  MAT2: 23, TEX2: 24,   // a roof's gable ends; a wall's top
  ZONE: 25,             // which side its outer surfaces face (see zoneBits)
  POWER: 26,            // a pane's brightness
  LIT: 27,              // (phase 4a) a window's light group * 2 + 1 if lit while anyone is awake there (0: none)
};
// hole table
export const H_STRIDE = 14;
export const H = {
  TYPE: 0, CX: 1, CZ: 2, CA: 3, SA: 4, HX: 5, HZ: 6, Y0: 7, Y1: 8,
  R: 9,                 // an arch's radius (its top is a half circle of it)
  ROOM: 10,             // the room its surfaces are inside (-1: outside)
  CLOSE: 11,            // 1: closes when narrower than about two cells
  DEPTH: 12,            // an opening's reveal: the depth of the wall it goes through (0: a room, not an opening)
};

// Light zones: which torches light a surface. Bit 0 outside, bit 1 a yard,
// and one of the next 29 bits for each room. A torch lights only surfaces
// sharing a bit with its mask. (Phase 3b: there are more rooms than bits, so
// compileKit gives two rooms the same bit only when they are far enough
// apart that no torch can reach both: kit.roomBits.)
export const ZONE_OUT = 1, ZONE_YARD = 2;
export const ZONE_ALL = 0x7fffffff;
const ROOM_BITS = 29, ROOM_APART = 60;
export const roomBit = (kit, r) => (r >= 0 && kit.roomBits && r < kit.roomBits.length ? kit.roomBits[r] : 0);

// ---- building up a kit -------------------------------------------------------

export class KitBuilder {
  constructor() {
    this.prims = [];
    this.holes = [];
    this.rooms = [];
    this.torches = [];
    this.yards = [];       // polygons [[x, z], ...] that are yards (for light zones)
    this.cleared = [];     // polygons trees must keep out of
  }

  // A shape. `o`: { type, x, z, a (radians), hx, hz, y0, y1, mat, flags, ...,
  // holes: [{ type, x, z, a, hx, hz, y0, y1, r, room, close }] } (hole
  // positions in world space).
  // (phase 5b) `late`: added after everything else when the kit is compiled,
  // so a shape added to an old place (a tower's furniture) moves no other
  // shape's index, and so no unseeded shape's seed (its index)
  add(o) {
    if (o.late) { (this.late || (this.late = [])).push(o); return -1; }
    const h0 = this.holes.length;
    for (const h of o.holes || []) this.holes.push(h);
    const id = this.prims.length;
    this.prims.push({ ...o, h0, hn: this.holes.length - h0, id });
    return id;
  }

  // A room: `open` rooms (a passage) also take the light of torches outside.
  // Openings: [{ x, y, z, nx, ny, nz, area }], each facing into the room.
  room(openings, open = false) {
    this.rooms.push({ openings, open });
    return this.rooms.length - 1;
  }

  // A torch: on a post (`mount: 'post'`) or on a bracket from a wall (`nx`,
  // `nz`: the wall's outward normal), or a hearth's fire (`mount:
  // 'hearth'`), its flame at height `y`; `mask`: which zones it lights (the
  // yard, outside), and `rooms`: which rooms.
  torch(t) { if (t.late) (this.lateTorches || (this.lateTorches = [])).push(t); else this.torches.push(t); }
  // the late shapes and torches after the rest (they have no openings)
  settle() {
    for (const o of this.late || []) { const { late, ...rest } = o; void late; this.prims.push({ ...rest, h0: this.holes.length, hn: 0, id: this.prims.length }); }
    for (const t of this.lateTorches || []) { const { late, ...rest } = t; void late; this.torches.push(rest); }
    this.late = []; this.lateTorches = [];
  }
}

// ---- compiling ---------------------------------------------------------------

const GRID = 4;           // metres per square of the walking and lookup index

export function compileKit(b) {
  if (b.settle) b.settle();
  const np = b.prims.length, nh = b.holes.length;
  const prims = new Float64Array(np * P_STRIDE);
  const holes = new Float64Array(nh * H_STRIDE);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, top = -Infinity;
  b.prims.forEach((o, i) => {
    const q = i * P_STRIDE, a = o.a || 0;
    prims[q + P.TYPE] = o.type; prims[q + P.CX] = o.x; prims[q + P.CZ] = o.z;
    prims[q + P.CA] = Math.cos(a); prims[q + P.SA] = Math.sin(a);
    prims[q + P.HX] = o.hx; prims[q + P.HZ] = o.type === PT.CYL || o.type === PT.REED ? o.hx : o.hz;
    prims[q + P.Y0] = o.y0; prims[q + P.Y1] = o.y1;
    prims[q + P.MAT] = o.mat; prims[q + P.FLAGS] = o.flags || 0;
    prims[q + P.MH] = o.mh || 0; prims[q + P.PER] = o.per || 0; prims[q + P.MW] = o.mw || 0; prims[q + P.PH] = o.ph || 0;
    prims[q + P.RISE] = o.rise || 0; prims[q + P.RUN] = o.run || 0;
    prims[q + P.H0] = o.h0; prims[q + P.HN] = o.hn;
    prims[q + P.ROOM] = o.room !== undefined ? o.room : -1;
    prims[q + P.SEED] = o.seed || i; prims[q + P.TEX] = o.tex || 0;
    prims[q + P.BASE] = o.base !== undefined ? o.base : o.y0;
    prims[q + P.MAT2] = o.mat2 !== undefined ? o.mat2 : o.mat; prims[q + P.TEX2] = o.tex2 !== undefined ? o.tex2 : (o.tex || 0);
    prims[q + P.ZONE] = o.zone !== undefined ? o.zone : -1;
    prims[q + P.POWER] = o.power || 0;
    prims[q + P.LIT] = o.lit || 0;
    const R = reachOf(prims, q);
    x0 = Math.min(x0, o.x - R); x1 = Math.max(x1, o.x + R); z0 = Math.min(z0, o.z - R); z1 = Math.max(z1, o.z + R);
    top = Math.max(top, o.y1);
  });
  b.holes.forEach((h, i) => {
    const q = i * H_STRIDE, a = h.a || 0;
    holes[q + H.TYPE] = h.type; holes[q + H.CX] = h.x; holes[q + H.CZ] = h.z;
    holes[q + H.CA] = Math.cos(a); holes[q + H.SA] = Math.sin(a);
    holes[q + H.HX] = h.hx; holes[q + H.HZ] = h.type === HT.CYL ? h.hx : h.hz;
    holes[q + H.Y0] = h.y0; holes[q + H.Y1] = h.y1;
    holes[q + H.R] = h.type === HT.ARCH ? h.hx : 0;
    holes[q + H.ROOM] = h.room !== undefined ? h.room : -1;
    holes[q + H.CLOSE] = h.close ? 1 : 0;
    holes[q + H.DEPTH] = h.depth || 0;
  });
  // each room's light bit: the lowest no room within ROOM_APART metres has
  const roomBits = [], at = b.rooms.map((r) => {
    const o = r.openings;
    return o.length ? [o.reduce((a, p) => a + p.x, 0) / o.length, o.reduce((a, p) => a + p.z, 0) / o.length] : [0, 0];
  });
  at.forEach((p, r) => {
    let used = 0;
    for (let q = 0; q < r; q++) if (Math.hypot(at[q][0] - p[0], at[q][1] - p[1]) < ROOM_APART) used |= roomBits[q];
    let k = 0;
    while (k < ROOM_BITS && used & (1 << (2 + k))) k++;
    roomBits.push(k < ROOM_BITS ? 1 << (2 + k) : 0);
  });
  const kit = {
    prims, holes, np, nh, roomBits,
    rooms: b.rooms.map((r) => ({ open: r.open, ops: Float64Array.from(r.openings.flatMap((o) => [o.x, o.y, o.z, o.nx, o.ny, o.nz, o.area])) })),
    torches: b.torches.map((t) => {
      let mask = t.mask || 0;
      for (const r of t.rooms || []) mask |= r >= 0 && r < roomBits.length ? roomBits[r] : 0;
      return { ...t, mask };
    }),
    yards: b.yards.map((p) => p.map((v) => [v[0], v[1]])),
    cleared: b.cleared.map((p) => p.map((v) => [v[0], v[1]])),
    box: np ? { x0, x1, z0, z1, top } : { x0: 0, x1: 0, z0: 0, z1: 0, top: -Infinity },
  };
  indexKit(kit);
  return kit;
}

// The description, as plain data, for a world's packed form; the kit is
// compiled again from it in each thread.
export function kitData(b) {
  if (b.settle) b.settle();
  return { prims: b.prims, holes: b.holes, rooms: b.rooms, torches: b.torches, yards: b.yards, cleared: b.cleared };
}
export function kitFromData(d) {
  const b = new KitBuilder();
  b.prims = d.prims; b.holes = d.holes; b.rooms = d.rooms; b.torches = d.torches; b.yards = d.yards; b.cleared = d.cleared || [];
  return compileKit(b);
}

// How far a shape reaches from its centre, horizontally.
export function reachOf(prims, q) {
  const t = prims[q + P.TYPE], hx = prims[q + P.HX], hz = prims[q + P.HZ];
  return t === PT.CYL || t === PT.REED ? hx : t === PT.ELL ? Math.max(hx, hz) : Math.sqrt(hx * hx + hz * hz);
}

// A lookup of the shapes over GRID-metre squares, for walking and the tools.
function indexKit(kit) {
  const { box } = kit;
  if (!kit.np) { kit.grid = null; return; }
  const gx0 = Math.floor((box.x0 - 1) / GRID), gz0 = Math.floor((box.z0 - 1) / GRID);
  const gw = Math.floor((box.x1 + 1) / GRID) - gx0 + 1, gh = Math.floor((box.z1 + 1) / GRID) - gz0 + 1;
  const cells = Array.from({ length: gw * gh }, () => []);
  for (let i = 0; i < kit.np; i++) {
    const q = i * P_STRIDE, R = reachOf(kit.prims, q) + 0.5, x = kit.prims[q + P.CX], z = kit.prims[q + P.CZ];
    for (let gz = Math.floor((z - R) / GRID); gz <= Math.floor((z + R) / GRID); gz++) {
      for (let gx = Math.floor((x - R) / GRID); gx <= Math.floor((x + R) / GRID); gx++) cells[(gz - gz0) * gw + gx - gx0].push(i);
    }
  }
  kit.grid = { gx0, gz0, gw, gh, cells: cells.map((c) => Int32Array.from(c)) };
}

// The shapes whose footprint can reach (x, z) (within `pad` metres).
function near(kit, x, z, out, pad = 0) {
  out.length = 0;
  const g = kit.grid;
  if (!g) return out;
  const b = kit.box;
  if (x < b.x0 - pad || x > b.x1 + pad || z < b.z0 - pad || z > b.z1 + pad) return out;
  for (let gz = Math.floor((z - pad) / GRID); gz <= Math.floor((z + pad) / GRID); gz++) {
    for (let gx = Math.floor((x - pad) / GRID); gx <= Math.floor((x + pad) / GRID); gx++) {
      const cx = gx - g.gx0, cz = gz - g.gz0;
      if (cx < 0 || cz < 0 || cx >= g.gw || cz >= g.gh) continue;
      for (const i of g.cells[cz * g.gw + cx]) if (!out.includes(i)) out.push(i);
    }
  }
  return out;
}

// ---- point tests ----------------------------------------------------------------

// The top of shape q at local (u, w) (its crenels as they really are), or
// -Infinity if (u, w) is outside its footprint.
function topAt(kit, q, u, w) {
  const S = kit.prims, t = S[q + P.TYPE], hx = S[q + P.HX], hz = S[q + P.HZ];
  // (phase 4b) the wild shapes: their own tops; reeds have none
  if (t === PT.ELL) { const e = 1 - (u / hx) * (u / hx) - (w / hz) * (w / hz); return e < 0 ? -Infinity : S[q + P.BASE] + (S[q + P.Y1] - S[q + P.BASE]) * Math.sqrt(e); }
  if (t === PT.LOG) { if (u < -hx || u > hx || w < -hz || w > hz) return -Infinity; return S[q + P.BASE] + Math.sqrt(hz * hz - w * w); }
  if (t === PT.REED) return -Infinity;
  if (t === PT.CYL) { if (u * u + w * w > hx * hx) return -Infinity; }
  else if (u < -hx || u > hx || w < -hz || w > hz) return -Infinity;
  const y1 = S[q + P.Y1];
  if (t === PT.PRISM) return y1 - (y1 - S[q + P.Y0]) * Math.abs(w) / hz;
  if (t === PT.STAIR) {
    // (steps count up from the stair's base, its solid going down to y0)
    const k = Math.max(0, Math.min(Math.floor((u + hx) / S[q + P.RUN]), Math.round(2 * hx / S[q + P.RUN]) - 1));
    return S[q + P.BASE] + (k + 1) * S[q + P.RISE];
  }
  if (S[q + P.FLAGS] & PF.CRENEL) return inMerlon(S, q, u, w) ? y1 : y1 - S[q + P.MH];
  return y1;
}

export function inMerlon(S, q, u, w) {
  const per = S[q + P.PER], mw = S[q + P.MW], ph = S[q + P.PH];
  let f;
  if (S[q + P.TYPE] === PT.CYL) f = (Math.atan2(w, u) / (2 * Math.PI) + 0.5) * per + ph;
  else f = (u + ph) / per;
  f -= Math.floor(f);
  return f < mw;
}

// Is world point (x, y, z) inside the hole h's opening?
function inHole(kit, h, x, y, z) {
  const Hs = kit.holes, o = h * H_STRIDE, t = Hs[o + H.TYPE];
  const dx = x - Hs[o + H.CX], dz = z - Hs[o + H.CZ], ca = Hs[o + H.CA], sa = Hs[o + H.SA];
  const u = dx * ca + dz * sa, w = -dx * sa + dz * ca, hx = Hs[o + H.HX], hz = Hs[o + H.HZ];
  if (y < Hs[o + H.Y0] || y > Hs[o + H.Y1]) return false;
  if (t === HT.CYL) return u * u + w * w < hx * hx;
  if (u <= -hx || u >= hx || w <= -hz || w >= hz) return false;
  if (t === HT.ARCH) {
    const r = Hs[o + H.R], ys = Hs[o + H.Y1] - r;
    if (y > ys) return u * u + (y - ys) * (y - ys) < r * r;
  }
  return true;
}

// Is world point (x, y, z) inside the solid of shape i (not in its openings)?
export function inPrim(kit, i, x, y, z) {
  const S = kit.prims, q = i * P_STRIDE, t = S[q + P.TYPE];
  if (t === PT.PANE || t === PT.REED) return false;
  if (y < S[q + P.Y0]) return false;
  const dx = x - S[q + P.CX], dz = z - S[q + P.CZ], ca = S[q + P.CA], sa = S[q + P.SA];
  const u = dx * ca + dz * sa, w = -dx * sa + dz * ca;
  const top = topAt(kit, q, u, w);
  if (y > top) return false;
  // (phase 4b) round shapes have a round underside, as their top
  if ((t === PT.ELL || t === PT.LOG) && y < 2 * S[q + P.BASE] - top) return false;
  for (let h = S[q + P.H0], e = h + S[q + P.HN]; h < e; h++) if (inHole(kit, h, x, y, z)) return false;
  return true;
}

const NEAR_TMP = [];
// (the walking tests allocate nothing: they run many times a frame, and
// garbage made there stalls a frame when collected; after phase 3a)
const LS = new Int32Array(4096), LB = new Int32Array(4096), YS = new Float64Array(8192);

// Is world point (x, y, z) inside any shape's solid?
// (phase 4a) The room whose floor holds (x, z) at about height y (a shape
// marked INSIDE and WALK under the point, its top within half a metre of y),
// or -1 outside.
export function roomAt(kit, x, z, y) {
  if (!kit) return -1;
  const list = near(kit, x, z, NEAR_TMP), S = kit.prims;
  let best = -1, bd = Infinity;
  for (const i of list) {
    const q = i * P_STRIDE, room = S[q + P.ROOM];
    if (room < 0 || (S[q + P.FLAGS] & (PF.INSIDE | PF.WALK)) !== (PF.INSIDE | PF.WALK)) continue;
    const ox = x - S[q + P.CX], oz = z - S[q + P.CZ], u = ox * S[q + P.CA] + oz * S[q + P.SA], w = -ox * S[q + P.SA] + oz * S[q + P.CA];
    if (Math.abs(u) > S[q + P.HX] || Math.abs(w) > S[q + P.HZ]) continue;
    const d = Math.abs(S[q + P.Y1] - y);
    if (d < 0.5 && d < bd) { bd = d; best = room; }
  }
  return best;
}

export function solidAt(kit, x, y, z) {
  const list = near(kit, x, z, NEAR_TMP);
  for (const i of list) if (inPrim(kit, i, x, y, z)) return true;
  return false;
}

// The highest surface at (x, z) that one could stand on, no higher than
// `maxY` (-Infinity if none): a shape's top, a step, a crenel's floor, the
// sill of an opening.
export function supportAt(kit, x, z, maxY) {
  // (only the shapes whose bounds reach the point can hold it up or be over it)
  const n = within(kit, near(kit, x, z, NEAR_TMP), x, z, 0, -Infinity, Infinity, LS);
  let best = -Infinity;
  const S = kit.prims, Hs = kit.holes;
  for (let a = 0; a < n; a++) {
    const q = LS[a] * P_STRIDE, t = S[q + P.TYPE];
    if (t === PT.PANE || t === PT.REED) continue;
    const dx = x - S[q + P.CX], dz = z - S[q + P.CZ], ca = S[q + P.CA], sa = S[q + P.SA];
    const u = dx * ca + dz * sa, w = -dx * sa + dz * ca;
    const top = topAt(kit, q, u, w);
    if (top === -Infinity) continue;
    if (top <= maxY && top > best && holds(kit, LS, n, x, top, z)) best = top;
    for (let h = S[q + P.H0], e = h + S[q + P.HN]; h < e; h++) {
      const y = Hs[h * H_STRIDE + H.Y0];
      if (y <= maxY && y > best && holds(kit, LS, n, x, y, z)) best = y;
    }
  }
  return best;
}

// (phase 5b) The shape a foot at (x, feet, z) stands on, for its sound: the
// offset of the shape whose solid is just under it, or -1 (the ground).
// (just under the feet, or a step's height under them: on a stair the feet
// ride the next step's edge)
export function primUnder(kit, x, z, feet) {
  if (!kit || !kit.np) return -1;
  const list = near(kit, x, z, NEAR_TMP);
  for (const dy of [0.04, 0.3]) for (const i of list) if (inPrim(kit, i, x, feet - dy, z)) return i * P_STRIDE;
  return -1;
}

// Is there solid just under height y at (x, z), and none just over it?
function holds(kit, list, n, x, y, z) {
  return solidAtList(kit, list, n, x, y - 0.02, z) && !solidAtList(kit, list, n, x, y + 0.02, z);
}

// Of `list`, the shapes whose bounding circle comes within r of (x, z) and
// whose heights overlap lo..hi, into `out`; how many.
function within(kit, list, x, z, r, lo, hi, out) {
  const S = kit.prims;
  let n = 0;
  for (let a = 0; a < list.length && n < out.length; a++) {
    const i = list[a], q = i * P_STRIDE, dx = x - S[q + P.CX], dz = z - S[q + P.CZ], R = reachOf(S, q) + r + 1e-6;
    if (dx * dx + dz * dz <= R * R && S[q + P.Y0] <= hi && S[q + P.Y1] >= lo) out[n++] = i;
  }
  return n;
}

function solidAtList(kit, list, n, x, y, z) {
  for (let a = 0; a < n; a++) if (inPrim(kit, list[a], x, y, z)) return true;
  return false;
}

// Would an upright body of radius r round (x, z), from height lo to hi,
// overlap any shape's solid? Tested at 24 points round its edge and its
// middle (a corner of stone, a doorway's jamb, can come no more than 4 cm
// in between them; between 12 it could by 8), at lo, hi and every height
// between where a shape or opening starts or ends, so a slab or a lintel
// cannot slip between the samples.
// (the heights to sample, gathered by add())
let ym = 0;
function add(y, lo, hi) { if (y > lo && y < hi && ym < YS.length) YS[ym++] = y; }
const RING = Float64Array.from({ length: 48 }, (_, k) => (k & 1 ? Math.sin : Math.cos)((k >> 1) * Math.PI / 12));
export function bodyBlocked(kit, x, z, lo, hi, r) {
  // (only the shapes whose bounds reach the body, from lo to hi: after
  // phase 3a, so a stair's many steps are not sampled when it is further off)
  const n = within(kit, near(kit, x, z, NEAR_TMP, r + 0.1), x, z, r, lo, hi, LB);
  if (!n) return false;
  const S = kit.prims, Hs = kit.holes;
  ym = 0;
  YS[ym++] = lo; YS[ym++] = hi; YS[ym++] = (lo + hi) / 2;
  for (let a = 0; a < n; a++) {
    const q = LB[a] * P_STRIDE;
    const y0 = S[q + P.Y0], y1 = S[q + P.Y1], yc = y1 - S[q + P.MH];
    add(y0 + 0.01, lo, hi); add(y0 - 0.01, lo, hi); add(y1 + 0.01, lo, hi); add(y1 - 0.01, lo, hi); add(yc + 0.01, lo, hi); add(yc - 0.01, lo, hi);
    // (phase 4b) a round shape is widest at its middle
    if (S[q + P.TYPE] === PT.ELL || S[q + P.TYPE] === PT.LOG) add(S[q + P.BASE], lo, hi);
    if (S[q + P.TYPE] === PT.STAIR) {
      const k = Math.round(2 * S[q + P.HX] / S[q + P.RUN]), base = S[q + P.BASE], rise = S[q + P.RISE];
      // (only the steps between lo and hi)
      const k0 = Math.max(1, Math.floor((lo - base) / rise)), k1 = Math.min(k, Math.ceil((hi - base) / rise));
      for (let j = k0; j <= k1; j++) add(base + j * rise - 0.01, lo, hi);
    }
    for (let h = S[q + P.H0], e = h + S[q + P.HN]; h < e; h++) {
      const o = h * H_STRIDE, hy0 = Hs[o + H.Y0], hy1 = Hs[o + H.Y1], hr = hy1 - Hs[o + H.R];
      add(hy0 + 0.01, lo, hi); add(hy0 - 0.01, lo, hi); add(hy1 + 0.01, lo, hi); add(hy1 - 0.01, lo, hi); add(hr + 0.01, lo, hi); add(hr - 0.01, lo, hi);
      // (phase 3b: under an arch's curve, every 10 cm, so the body cannot
      // slip into its haunch between two samples; a bridge's arches, by the bank)
      if (Hs[o + H.TYPE] === HT.ARCH) for (let y = Math.max(hr, lo) + 0.05; y < Math.min(hy1, hi); y += 0.1) add(y, lo, hi);
    }
  }
  for (let j = 0, m = ym; j < m; j++) {
    const y = YS[j];
    if (solidAtList(kit, LB, n, x, y, z)) return true;
    for (let k = 0; k < 48; k += 2) if (solidAtList(kit, LB, n, x + RING[k] * r, y, z + RING[k + 1] * r)) return true;
    // (phase 4a: and a ring at half the radius, so a post thinner than the
    // body, between its middle and its edge, is not missed)
    for (let k = 0; k < 48; k += 4) if (solidAtList(kit, LB, n, x + RING[k] * r * 0.5, y, z + RING[k + 1] * r * 0.5)) return true;
  }
  return false;
}

// ---- light zones and interior light ----------------------------------------------

function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// The zone bits of an outside surface at (x, z): in a yard or outside.
export function zoneAt(kit, x, z) {
  if (!kit || !kit.yards.length) return ZONE_ALL;
  // (phase 3b: the yards' own bounds, not the whole kit's, which now spans
  // the map with the villages and bridges)
  const b = kit.yardBox || (kit.yardBox = yardBounds(kit.yards));
  if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return ZONE_OUT;
  for (const p of kit.yards) if (inPoly(p, x, z)) return ZONE_YARD;
  return ZONE_OUT;
}

function yardBounds(yards) {
  const b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const p of yards) for (const [x, z] of p) { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (z < b.z0) b.z0 = z; if (z > b.z1) b.z1 = z; }
  return b;
}

export function inYard(kit, x, z) { for (const p of kit.yards) if (inPoly(p, x, z)) return true; return false; }
export function inCleared(kit, x, z) { for (const p of kit.cleared) if (inPoly(p, x, z)) return true; return false; }

// How much of the sky's soft light reaches a point inside room r: through
// each opening, by its area over the square of the distance, as far as the
// point faces it and lies before it (0..1).
export function shelterOf(kit, r, x, y, z, nx, ny, nz) {
  const R = kit.rooms[r];
  if (!R) return 1;
  const ops = R.ops;
  let sum = 0;
  for (let k = 0; k < ops.length; k += 7) {
    const lx = ops[k] - x, ly = ops[k + 1] - y, lz = ops[k + 2] - z;
    const d2 = lx * lx + ly * ly + lz * lz + 0.25, d = Math.sqrt(d2);
    // the point must lie on the room's side of the opening
    const before = -(lx * ops[k + 3] + ly * ops[k + 4] + lz * ops[k + 5]) / d;
    if (before <= 0) continue;
    const facing = (lx * nx + ly * ny + lz * nz) / d;
    const f = 0.35 + 0.65 * (facing > 0 ? facing : 0);
    sum += ops[k + 6] * before * f / (d2 * 0.9 + ops[k + 6]);
  }
  return sum > 1 ? 1 : sum;
}

// ---- shadows ------------------------------------------------------------------------

// Raise occluder heights (a grid of node heights, NN a side) by the kit's
// shapes: each node under a shape takes its top, unless an opening cuts
// through that top there (a round tower's inside); crenels count as half.
// (`step`: nodes that many metres apart, for a coarser grid; 1 for the
// shadows' own)
export function raiseOccluders(kit, occ, N, NN, step = 1) {
  if (!kit || !kit.np) return;
  // (shape by shape over its own footprint, phase 3b: the kit's box now
  // spans the villages too; the same heights as node by node)
  const S = kit.prims, Hs = kit.holes;
  for (let i = 0; i < kit.np; i++) {
    const q = i * P_STRIDE, t = S[q + P.TYPE];
    if (t === PT.PANE) continue;
    const R = reachOf(S, q), cx = S[q + P.CX], cz = S[q + P.CZ], ca = S[q + P.CA], sa = S[q + P.SA];
    const cren = (S[q + P.FLAGS] & PF.CRENEL) !== 0;
    for (let gz = Math.max(0, Math.ceil((cz - R) / step)); gz <= Math.min(N, Math.floor((cz + R) / step)); gz++) {
      for (let gx = Math.max(0, Math.ceil((cx - R) / step)); gx <= Math.min(N, Math.floor((cx + R) / step)); gx++) {
        const x = gx * step, z = gz * step;
        const dx = x - cx, dz = z - cz, u = dx * ca + dz * sa, w = -dx * sa + dz * ca;
        let y = topAt(kit, q, u, w);
        const j = gz * NN + gx;
        if (y === -Infinity || y <= occ[j]) continue;
        if (cren) y = S[q + P.Y1] - S[q + P.MH] * (1 - S[q + P.MW]);
        let cut = false;
        for (let h = S[q + P.H0], e = h + S[q + P.HN]; h < e; h++) {
          const o = h * H_STRIDE;
          if (Hs[o + H.Y1] >= S[q + P.Y1] - 1e-6 && inHole(kit, h, x, Hs[o + H.Y1] - 1e-3, z)) { cut = true; break; }
        }
        if (!cut && y > occ[j]) occ[j] = y;
      }
    }
  }
}
