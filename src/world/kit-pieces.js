// The building kit's pieces (phase 3a). A structure is described as data:
//
//   { pieces: [
//       { kind: 'wall', a: [x, z], b: [x, z], base, out: 1 | -1 },
//       { kind: 'gate', at: [x, z], angle, base, out },
//       { kind: 'tower', shape: 'square' | 'round', at, size, base, inward, walls: [angle, angle] },
//       { kind: 'keep', at, angle, base, w, d },
//       { kind: 'stair', at, angle, base, height, side },
//       { kind: 'house', at, angle, base, w, d },
//       { kind: 'well', at, base },
//       { kind: 'torch', at, base, mount: 'post' } ...
//   ] }
//
// with sizes in metres, angles in radians (0 along +x, a quarter turn along
// +z) and `base` the height of the ground the piece stands on; buildStructure
// turns each piece into the kit's shapes (src/world/kit.js), its rooms, its
// torches and its windows. The sizes not given come from SCALE.kit
// (docs/scale.md). Nothing here is drawn or walked directly: compileKit()
// makes the tables everything else reads.
import { PT, HT, PF, TX, ZONE_OUT, ZONE_YARD, roomBit } from './kit.js';
import { MAT } from '../contract.js';
import { SCALE } from './scale.js';

const K = SCALE.kit;
const D2 = Math.PI / 2;

function frame(x, z, a) {
  const ca = Math.cos(a), sa = Math.sin(a);
  return { x, z, a, ca, sa, at: (u, w) => [x + u * ca - w * sa, z + u * sa + w * ca], dir: (u, w) => [u * ca - w * sa, u * sa + w * ca] };
}
const wrap = (a) => { while (a <= -Math.PI) a += 2 * Math.PI; while (a > Math.PI) a -= 2 * Math.PI; return a; };

// A crenellated parapet along a run (local u of frame F, centred at (u, w)),
// `len` long, `t` thick, its top `top` (breastwork and merlons above `y0`).
function parapet(b, F, u, w, len, t, y0, seed, along = 0, holes = undefined) {
  const W = K.wall, per = W.merlonW + W.crenelW, mw = W.merlonW / per;
  const [x, z] = F.at(u, w);
  // merlons centred on the run's middle
  return b.add({ type: PT.BOX, x, z, a: F.a + along, hx: len / 2, hz: t / 2, y0, y1: y0 + W.breast + W.merlon, mat: MAT.MASONRY,
    flags: PF.CRENEL | PF.GROW, mh: W.merlon, per, mw, ph: per * mw / 2 + per * 1000, tex: TX.MASONRY, tex2: TX.FLAGS, base: y0 - 6, seed, holes });
}

// The inside of a tower (or anything) a wall reaching into it must not
// fill: `cuts` on a wall are holes of these shapes ({ type, x, z, a, hx,
// hz, y0, y1 } as kit holes), reaching a few centimetres past the tower's
// own inner face into its wall, so the wall stops behind the tower's face
// and the tower's face is the one seen there.
export function towerInside(p) {
  const T = K.tower, wt = T.wallT, base = p.base, top = base + K.wall.height + T.above;
  const c = p.size - wt + 0.04;
  return p.shape === 'round' ? { type: HT.CYL, x: p.at[0], z: p.at[1], a: 0, hx: c, y0: base - 0.4, y1: top - K.slab - 0.03 }
    : { type: HT.BOX, x: p.at[0], z: p.at[1], a: squareTurn(p.inward, p.walls), hx: c, hz: c, y0: base - 0.4, y1: top - K.slab - 0.03 };
}

// How a square tower is turned: square to its walls (the angles they leave
// it at) as near as they allow, the worst of them as little off a face's
// middle as can be, searched a degree at a time round the way into the yard.
function squareTurn(inward, walls) {
  const wrapQ = (x) => x - D2 * Math.round(x / D2);
  let a = inward, worst = Infinity;
  for (let s = 0; s < 90; s++) {
    const t = inward + (s - 45) * Math.PI / 180, e = Math.max(...walls.map((w) => Math.abs(wrapQ(w - t))));
    if (e < worst - 1e-9) { worst = e; a = t; }
  }
  return a;
}

// A window: a recess `depth` deep in a wall whose outer face is at local w
// = face (outward +w) of frame F, at u, sill at y, with a lit pane at its back.
function windowIn(b, F, u, face, y, holes, room, seed, through = 0, lit = true) {
  const Wn = K.window, depth = through || Wn.depth;
  const [hx, hz] = F.at(u, face - depth / 2 + 0.05);
  holes.push({ type: HT.BOX, x: hx, z: hz, a: F.a, hx: Wn.width / 2, hz: depth / 2 + 0.05, y0: y, y1: y + Wn.height, room, close: 1, depth });
  if (lit) {
    const [px, pz] = F.at(u, face - depth + 0.04);
    b.add({ type: PT.PANE, x: px, z: pz, a: F.a, hx: Wn.width / 2 - 0.04, hz: 0.03, y0: y + 0.04, y1: y + Wn.height - 0.04, mat: MAT.WINDOW, power: 1, seed });
  }
  return { x: hx, z: hz, y: y + Wn.height / 2 };
}

// A torch on a bracket by a wall: the flame `off` metres out from the wall
// face at (x, z), its outward normal (nx, nz), at height y; or on a post.
function bracketTorch(b, x, z, nx, nz, y, mask, phase, off = 0.32) {
  b.torch({ x: x + nx * off, z: z + nz * off, base: y - 0.18 - 0.36, h: 0.36, flameY: y, phase, mask, mount: 'bracket' });
}
export function postTorch(b, x, z, base, mask, phase) {
  b.torch({ x, z, base, h: 2.1, flameY: base + 2.1 + 0.18, phase, mask, mount: 'post' });
}

// ---- the pieces -------------------------------------------------------------------

// A curtain wall from a to b: its walk on top, the parapet on its outer side
// (`out`: +1 if outside lies to local +w, the left of the way from a to b).
export function curtainWall(b, p) {
  const W = K.wall, [ax, az] = p.a, [bx, bz] = p.b;
  const L = Math.hypot(bx - ax, bz - az), a = Math.atan2(bz - az, bx - ax);
  const F = frame((ax + bx) / 2, (az + bz) / 2, a), base = p.base, top = base + W.height;
  const cuts = p.cuts || [];
  b.add({ type: PT.BOX, x: F.x, z: F.z, a, hx: L / 2, hz: W.thick / 2, y0: base - W.foot, y1: top, mat: MAT.MASONRY, flags: PF.WALK | PF.GROW,
    tex: TX.MASONRY, tex2: TX.FLAGS, base, seed: p.seed || 1, holes: cuts.map((c) => ({ ...c })) });
  parapet(b, F, 0, p.out * (W.thick / 2 - W.parapet / 2), L, W.parapet, top, (p.seed || 1) + 7, 0, cuts.map((c) => ({ ...c })));
  return { top, L, F };
}

// The gate: a block across the wall, the passage through it under an arch,
// parapets on its outer side, torches at its mouth and in the passage.
// `angle`: along the wall; `out`: outside lies to local +w.
export function gatehouse(b, p) {
  const W = K.wall, G = K.gate, base = p.base, top = base + W.height, out = p.out;
  const F = frame(p.at[0], p.at[1], p.angle);
  const crown = G.spring + G.width / 2;
  const ends = [-1, 1].map((sgn) => {
    const [ox, oz] = F.at(0, sgn * G.depth / 2), [nx, nz] = F.dir(0, -sgn);
    return { x: ox, y: base + crown * 0.55, z: oz, nx, ny: 0, nz, area: G.width * (G.spring + G.width * 0.4) };
  });
  const room = b.room(ends, true);
  b.add({ type: PT.BOX, x: F.x, z: F.z, a: F.a, hx: G.length / 2, hz: G.depth / 2, y0: base - W.foot, y1: top, mat: MAT.MASONRY, flags: PF.WALK,
    tex: TX.MASONRY, tex2: TX.FLAGS, base, seed: 101,
    holes: [{ type: HT.ARCH, x: F.x, z: F.z, a: F.a, hx: G.width / 2, hz: G.depth / 2 + 0.6, y0: base - W.foot - 0.5, y1: base + crown, room, depth: G.depth }] });
  // parapets: along the front, and on the sides of the part standing out
  // from the wall, up to the front's (no two shapes share a face: where two
  // did, a ray met one or the other by rounding, and the stone's courses blinked)
  parapet(b, F, 0, out * (G.depth / 2 - W.parapet / 2), G.length, W.parapet, top, 103);
  const sideLen = G.depth / 2 - W.thick / 2 - W.parapet;
  for (const sgn of [-1, 1]) parapet(b, F, sgn * (G.length / 2 - W.parapet / 2), out * (W.thick / 2 + sideLen / 2), sideLen, W.parapet, top, 105 + sgn, D2);
  // torches: two on the outer face beside the arch, two in the passage, one on the yard side
  const [fnx, fnz] = F.dir(0, out);
  for (const sgn of [-1, 1]) {
    const [x, z] = F.at(sgn * (G.width / 2 + 1.1), out * G.depth / 2);
    bracketTorch(b, x, z, fnx, fnz, base + 3.0, ZONE_OUT, 0.7 + sgn);
    const [px, pz] = F.at(sgn * G.width / 2, 0), [snx, snz] = F.dir(-sgn, 0);
    bracketTorch(b, px, pz, snx, snz, base + 2.7, ZONE_OUT | ZONE_YARD | roomBit(room), 2.3 + sgn, 0.25);
  }
  const [ix, iz] = F.at(G.width / 2 + 1.1, -out * G.depth / 2), [inx, inz] = F.dir(0, -out);
  bracketTorch(b, ix, iz, inx, inz, base + 3.0, ZONE_YARD, 4.1);
  return { top, room, front: F.at(0, out * (G.depth / 2 + 1)), back: F.at(0, -out * (G.depth / 2 + 1)), F };
}

// A tower at (x, z): `shape` square or round, `size` its half width or
// radius; `inward` the angle toward the yard; `walls` the angles at which
// the curtain walls leave it (its walk doors face them). Inside: a stair
// from the ground to the top, a floor at the walk's height between the walk
// doors, a hatch to the open top, a window lit at night.
export function tower(b, p) {
  const T = K.tower, W = K.wall, base = p.base, H = W.height, top = base + H + T.above, wt = T.wallT, slab = K.slab;
  const size = p.size, seed = p.seed || 201;
  const inward = p.inward;
  // walls in the tower's frame (+u toward the yard), the one to the left first
  let wa = p.walls.map((t) => wrap(t - inward)).sort((x, y) => y - x);
  const holes = [], lights = [];
  if (p.shape === 'round') return roundTower(b, p, wa, holes, lights, top);
  // a square tower: square to its walls as near as they allow, each leaving
  // through a face near its middle, where its walk door is (square cut, so
  // no corner of stone is sharper than a right angle). The yard sees the
  // corner between those two faces, so the ground door is in the first
  // wall's face on the yard's side of the wall. The stair runs along the face
  // opposite the second wall's, its open well at the end away from the
  // first wall's face, so every door opens onto a floor.
  const a = squareTurn(inward, p.walls);
  const F = frame(p.at[0], p.at[1], a);
  wa = p.walls.map((t) => wrap(t - a));
  const c = size - wt;                     // the inside, half width
  const faceOf = (t) => ((Math.round(wrap(t) / D2) % 4) + 4) % 4;
  const faceFrame = (k) => frame(p.at[0], p.at[1], a + k * D2);
  const kA = faceOf(wa[0]), kB = faceOf(wa[1]);
  const opposite = (kA - kB + 4) % 4 === 2;
  // rooms: the ground floor and the floor above share one room
  const ops = [];
  const room = b.room(ops);
  // the ground door: in face A on the yard's side of its wall (or, where the
  // walls leave through opposite faces, in the middle of the face toward the yard)
  const D0 = K.door, yd = [Math.cos(inward), Math.sin(inward)];
  let kG = kA, dc = 0;
  if (opposite) {
    kG = [0, 1, 2, 3].filter((k) => k !== kA && k !== kB).reduce((p0, k) => (Math.abs(wrap(k * D2 + a - inward)) < Math.abs(wrap(p0 * D2 + a - inward)) ? k : p0));
  } else {
    const FA = faceFrame(kA), along = FA.dir(0, 1), sY = along[0] * yd[0] + along[1] * yd[1] >= 0 ? 1 : -1;
    const dev = wrap(wa[0] - kA * D2), al = size * Math.tan(dev), hw = W.thick / 2 / Math.cos(dev);
    dc = Math.max(-(c - D0.width / 2 - 0.05), Math.min(c - D0.width / 2 - 0.05, al + sY * (hw + 0.1 + D0.width / 2)));
  }
  {
    const FF = faceFrame(kG), sY = Math.sign(dc) || 1;
    const [x, z] = FF.at(size - wt / 2, dc);
    holes.push({ type: HT.ARCH, x, z, a: FF.a + D2, hx: D0.width / 2, hz: wt / 2 + 0.5, y0: base - 0.4, y1: base + D0.height, room, close: 1, depth: wt });
    const [nx, nz] = FF.dir(-1, 0);
    ops.push({ x, y: base + 1.3, z, nx, ny: 0, nz, area: D0.width * D0.height });
    const tw = Math.max(-(size - 0.3), Math.min(size - 0.3, dc + sY * (D0.width / 2 + 0.6)));
    const [tx, tz] = FF.at(size, tw), [onx, onz] = FF.dir(1, 0);
    bracketTorch(b, tx, tz, onx, onz, base + 2.8, ZONE_YARD, seed * 0.37);
  }
  // the stair's frame: its back strips (-u) along the face opposite B (or,
  // with opposite walls, the free face away from the ground door); `sw`
  // turns it end for end so its landing and open well lie away from face A
  const kS = opposite ? (kG + 2) % 4 : (kB + 2) % 4;
  const SF = frame(p.at[0], p.at[1], a + kS * D2 + Math.PI);
  const sw = Math.abs(wrap(SF.a + D2 - (a + kA * D2))) < 0.1 ? -1 : 1;
  const at = (u, w) => SF.at(u, sw * w);
  // the stair: a solid flight up the back strip from the -w end, a landing,
  // a flight of slabs back along the next strip to a landing at the walk's
  // height, then slabs up over the first flight to a hatch in the top
  const S = K.towerStair, strip = 1.1, foot = 0.9;
  const n = Math.round(H / S.rise), rise = H / n;
  // (the first flight starts `foot` metres off the wall, so it can be
  // walked onto from its end)
  const n1 = Math.min(n - 6, Math.floor((2 * c - 1.0 - foot) / S.run)), n2 = n - n1;
  const uA = -c + strip / 2, uB = -c + strip * 1.5;
  {
    const L = n1 * S.run, [x, z] = at(uA, -c + foot + L / 2);
    b.add({ type: PT.STAIR, x, z, a: SF.a + sw * D2, hx: L / 2, hz: strip / 2, y0: base - 0.3, y1: base + n1 * rise, base, rise, run: S.run, mat: MAT.MASONRY, tex: TX.MASONRY, tex2: TX.FLAGS, room, flags: PF.INSIDE | PF.WALK, seed: seed + 1 });
  }
  const l1 = n1 * rise, w1 = -c + foot + n1 * S.run;
  {
    const [x, z] = at(-c + strip, (w1 + c) / 2);
    b.add({ type: PT.BOX, x, z, a: SF.a, hx: strip, hz: (c - w1) / 2, y0: base + l1 - slab, y1: base + l1, mat: MAT.MASONRY, tex: TX.MASONRY, tex2: TX.FLAGS, room, flags: PF.INSIDE | PF.WALK, seed: seed + 2 });
  }
  for (let k = 0; k < n2; k++) {
    const y1 = base + l1 + (k + 1) * rise, wc = w1 - (k + 0.5) * S.run;
    const [x, z] = at(uB, wc);
    b.add({ type: PT.BOX, x, z, a: SF.a, hx: strip / 2, hz: S.run / 2 + 0.03, y0: y1 - slab, y1, mat: MAT.MASONRY, tex: TX.MASONRY, tex2: TX.FLAGS, room, flags: PF.INSIDE | PF.WALK, seed: seed + 3 + k });
  }
  const wEnd = w1 - n2 * S.run;            // where the second flight reaches the walk's height
  // the floor at the walk's height: the back corner, and the rest
  {
    const [x, z] = at(-c + strip, (-c + wEnd) / 2);
    b.add({ type: PT.BOX, x, z, a: SF.a, hx: strip, hz: (wEnd + c) / 2 + 0.01, y0: base + H - slab, y1: base + H, mat: MAT.TIMBER, tex: TX.BOARDS, tex2: TX.BOARDS, room, flags: PF.INSIDE | PF.WALK, seed: seed + 40 });
    const [x2, z2] = at((-c + 2 * strip + c) / 2, 0);
    b.add({ type: PT.BOX, x: x2, z: z2, a: SF.a, hx: (c - (-c + 2 * strip)) / 2 + 0.01, hz: c + 0.01, y0: base + H - slab, y1: base + H, mat: MAT.TIMBER, tex: TX.BOARDS, tex2: TX.BOARDS, room, flags: PF.INSIDE | PF.WALK, seed: seed + 41 });
  }
  // up to the top: slabs over the first flight
  const n3 = Math.round(T.above / S.rise), r3 = T.above / n3;
  for (let k = 0; k < n3; k++) {
    const y1 = base + H + (k + 1) * r3, wc = wEnd + (k + 0.5) * S.run;
    const [x, z] = at(uA, wc);
    b.add({ type: PT.BOX, x, z, a: SF.a, hx: strip / 2, hz: S.run / 2 + 0.03, y0: y1 - slab, y1, mat: MAT.MASONRY, tex: TX.MASONRY, tex2: TX.FLAGS, room, flags: PF.INSIDE | PF.WALK, seed: seed + 60 + k });
  }
  {
    // the hatch: over the slabs a head would meet
    const w0 = wEnd - 0.2, w9 = wEnd + n3 * S.run + 0.35;
    const [x, z] = at(uA, (w0 + w9) / 2);
    holes.push({ type: HT.BOX, x, z, a: SF.a, hx: strip / 2 + 0.05, hz: (w9 - w0) / 2, y0: top - slab - 0.05, y1: top + 0.05, room });
    const [ox, oz] = at(uA, w9 - 0.5);
    ops.push({ x: ox, y: top - 0.2, z: oz, nx: 0, ny: -1, nz: 0, area: strip * (w9 - w0) });
  }
  // walk doors: where each wall's line crosses its face (face k's frame has
  // its u along the face's normal and its w along the face)
  for (const t of wa) {
    const k = faceOf(t), FF = faceFrame(k), D = K.walkDoor;
    const lim = c - D.width / 2 - 0.05;
    const al = Math.max(-lim, Math.min(lim, size * Math.tan(wrap(t - k * D2))));
    const [x, z] = FF.at(size - wt / 2, al);
    holes.push({ type: HT.ARCH, x, z, a: FF.a + D2, hx: D.width / 2, hz: wt / 2 + 0.5, y0: base + H - 0.05, y1: base + H + D.height, room, close: 1, depth: wt });
    const [nx, nz] = FF.dir(-1, 0);
    ops.push({ x, y: base + H + 1.2, z, nx, ny: 0, nz, area: D.width * D.height });
  }
  // a window lit at night, high on the face opposite A, which looks out
  lights.push(windowIn(b, frame(p.at[0], p.at[1], a + ((opposite ? kS : kA + 2) % 4) * D2 - D2), 0, size, base + H + 0.9, holes, room, seed + 80));
  // the body: hollow from the ground to under the top
  holes.push({ type: HT.BOX, x: F.x, z: F.z, a, hx: c, hz: c, y0: base - 0.35, y1: top - slab, room });
  b.add({ type: PT.BOX, x: F.x, z: F.z, a, hx: size, hz: size, y0: base - W.foot, y1: top, mat: MAT.MASONRY, flags: PF.WALK, tex: TX.MASONRY, tex2: TX.FLAGS, base, seed, holes });
  // the ground floor
  b.add({ type: PT.BOX, x: F.x, z: F.z, a, hx: c + 0.01, hz: c + 0.01, y0: base - 0.35, y1: base + 0.06, mat: MAT.MASONRY, tex: TX.FLAGS, tex2: TX.FLAGS, room, flags: PF.INSIDE | PF.WALK, seed: seed + 90 });
  // the parapet round the open top (two opposite sides the whole way, the
  // other two between them, so none shares a face)
  for (let k = 0; k < 4; k++) {
    const FF = faceFrame(k);
    parapet(b, FF, size - W.parapet / 2, 0, 2 * size - (k % 2) * 2 * W.parapet, W.parapet, top, seed + 100 + k, D2);
  }
  return { top, room, F, walkDoors: wa.length };
}

function roundTower(b, p, wa, holes, lights, top) {
  const T = K.tower, W = K.wall, base = p.base, H = W.height, wt = T.wallT, slab = K.slab;
  const r = p.size, ri = r - wt, seed = p.seed || 301;
  const a = p.inward, F = frame(p.at[0], p.at[1], a);
  const ops = [];
  const room = b.room(ops);
  const S = K.towerStair, band = S.width, rm = ri - band / 2;
  const dth = S.run / rm;
  const n = Math.round(H / S.rise), rise = H / n;
  // the ground door, straight toward the yard
  {
    const D = K.door, [x, z] = F.at(r - wt / 2, 0);
    holes.push({ type: HT.ARCH, x, z, a: a + D2, hx: D.width / 2, hz: wt / 2 + 0.5, y0: base - 0.4, y1: base + D.height, room, close: 1, depth: wt });
    ops.push({ x, y: base + 1.3, z, nx: -F.ca, ny: 0, nz: -F.sa, area: D.width * D.height });
    const [tx, tz] = F.at(r, D.width / 2 + 0.6), [onx, onz] = F.dir(1, 0);
    bracketTorch(b, tx, tz, onx, onz, base + 2.8, ZONE_YARD, seed * 0.37);
  }
  // the lower spiral, from beside the door round the back, up to the walk's
  // height; the upper spiral from the floor there to the top. (The walls
  // leave at wa[0] > 0 > wa[1]; the spirals keep clear of the walk doors.)
  const th0 = 30 * Math.PI / 180;
  const step = (th, y1, s) => {
    const [x, z] = F.at(Math.cos(th) * rm, Math.sin(th) * rm);
    b.add({ type: PT.BOX, x, z, a: a + th, hx: band / 2 + 0.06, hz: rm * dth / 2 + 0.05, y0: y1 - slab, y1, mat: MAT.MASONRY, tex: TX.MASONRY, tex2: TX.FLAGS, room, flags: PF.INSIDE | PF.WALK, seed: s });
  };
  for (let k = 0; k < n; k++) step(th0 + (k + 0.5) * dth, base + (k + 1) * rise, seed + 10 + k);
  const thLowEnd = th0 + n * dth;
  const thUp = Math.max(wa[0] + 0.28, 60 * Math.PI / 180);
  const n3 = Math.round(T.above / S.rise), r3 = T.above / n3;
  for (let k = 0; k < n3; k++) step(thUp + (k + 0.5) * dth, base + H + (k + 1) * r3, seed + 80 + k);
  // a box over a run of the spiral's band (for the holes in the floors)
  const bandBox = (t0, t1, y0, y1, holeRoom) => {
    const pts = [];
    for (let k = 0; k <= 8; k++) { const t = t0 + (t1 - t0) * k / 8; for (const rr of [ri - band - 0.1, ri + 0.05]) pts.push([Math.cos(t) * rr, Math.sin(t) * rr]); }
    const mid = (t0 + t1) / 2, cu = Math.cos(mid), cw = Math.sin(mid);
    let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity;
    for (const [u, w] of pts) { const pu = u * cu + w * cw, pw = -u * cw + w * cu; u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); w0 = Math.min(w0, pw); w1 = Math.max(w1, pw); }
    const [x, z] = F.at(((u0 + u1) / 2) * cu - ((w0 + w1) / 2) * cw, ((u0 + u1) / 2) * cw + ((w0 + w1) / 2) * cu);
    return { type: HT.BOX, x, z, a: a + mid, hx: (u1 - u0) / 2, hz: (w1 - w0) / 2, y0, y1, room: holeRoom };
  };
  // the floor at the walk's height, open over the lower spiral's top
  const kHigh = Math.max(0, Math.ceil((H - slab - 2.0) / rise) - 1);
  const floorHole = bandBox(th0 + kHigh * dth, thLowEnd + 0.05, base + H - slab - 0.05, base + H + 0.05, room);
  b.add({ type: PT.CYL, x: F.x, z: F.z, a, hx: ri + 0.01, y0: base + H - slab, y1: base + H, mat: MAT.TIMBER, tex: TX.BOARDS, tex2: TX.BOARDS, room, flags: PF.INSIDE | PF.WALK, seed: seed + 200, holes: [floorHole] });
  // the hatch to the top, over the upper spiral's top
  const hatch = bandBox(thUp - 0.05, thUp + n3 * dth + 0.15, top - slab - 0.05, top + 0.05, room);
  holes.push(hatch);
  ops.push({ x: hatch.x, y: top - 0.2, z: hatch.z, nx: 0, ny: -1, nz: 0, area: 2 * hatch.hx * 2 * hatch.hz });
  // walk doors toward each wall
  for (const t of wa) {
    const D = K.walkDoor, [x, z] = F.at(Math.cos(t) * (r - wt / 2), Math.sin(t) * (r - wt / 2));
    holes.push({ type: HT.ARCH, x, z, a: a + t + D2, hx: D.width / 2, hz: wt / 2 + 0.5, y0: base + H - 0.05, y1: base + H + D.height, room, close: 1, depth: wt });
    ops.push({ x, y: base + H + 1.2, z, nx: -Math.cos(a + t), ny: 0, nz: -Math.sin(a + t), area: D.width * D.height });
  }
  // a window lit at night, high on the side looking out
  {
    const FB = frame(p.at[0], p.at[1], a + Math.PI);
    lights.push(windowIn(b, frame(...FB.at(0, 0), a + Math.PI - D2), 0, r - 0.05, base + H + 0.9, holes, room, seed + 300));
  }
  holes.push({ type: HT.CYL, x: F.x, z: F.z, a, hx: ri, y0: base - 0.35, y1: top - slab, room });
  b.add({ type: PT.CYL, x: F.x, z: F.z, a, hx: r, y0: base - W.foot, y1: top, mat: MAT.MASONRY, flags: PF.WALK, tex: TX.MASONRY, tex2: TX.FLAGS, base, seed, holes });
  b.add({ type: PT.CYL, x: F.x, z: F.z, a, hx: ri + 0.01, y0: base - 0.35, y1: base + 0.06, mat: MAT.MASONRY, tex: TX.FLAGS, tex2: TX.FLAGS, room, flags: PF.INSIDE | PF.WALK, seed: seed + 90 });
  // the parapet round the top: a ring, its merlons round it
  const Wl = K.wall, per = Math.max(8, Math.round(2 * Math.PI * r / (Wl.merlonW + Wl.crenelW)));
  b.add({ type: PT.CYL, x: F.x, z: F.z, a, hx: r, y0: top, y1: top + Wl.breast + Wl.merlon, mat: MAT.MASONRY, flags: PF.CRENEL | PF.GROW,
    mh: Wl.merlon, per, mw: Wl.merlonW / (Wl.merlonW + Wl.crenelW), ph: 0.5, tex: TX.MASONRY, tex2: TX.FLAGS, base: top - 6, seed: seed + 400,
    holes: [{ type: HT.CYL, x: F.x, z: F.z, a, hx: r - Wl.parapet, y0: top - 0.1, y1: top + Wl.breast + Wl.merlon + 0.1 }] });
  return { top, room, F, walkDoors: wa.length };
}

// The keep: a large tower against the far wall, its door toward the yard
// (local +u), one hall inside lit by its door, slits and torches; lit
// windows high up; a crenellated top.
export function keep(b, p) {
  const Kp = K.keep, W = K.wall, base = p.base, top = base + W.height + Kp.above, wt = Kp.wallT, seed = p.seed || 401;
  const F = frame(p.at[0], p.at[1], p.angle), hd = p.d, hw = p.w;
  const ops = [];
  const room = b.room(ops);
  const holes = [];
  {
    const D = K.keepDoor, [x, z] = F.at(hd - wt / 2, 0);
    holes.push({ type: HT.ARCH, x, z, a: F.a + D2, hx: D.width / 2, hz: wt / 2 + 0.5, y0: base - 0.4, y1: base + D.height, room, close: 1, depth: wt });
    ops.push({ x, y: base + 1.6, z, nx: -F.ca, ny: 0, nz: -F.sa, area: D.width * D.height });
    const [nx, nz] = F.dir(1, 0);
    for (const sgn of [-1, 1]) { const [tx, tz] = F.at(hd, sgn * (D.width / 2 + 0.8)); bracketTorch(b, tx, tz, nx, nz, base + 3.2, ZONE_YARD, seed + sgn); }
  }
  // slits through the side walls, to light the hall
  const slit = { width: 0.45, height: 1.5 };
  for (const sgn of [-1, 1]) {
    for (const f of [-0.45, 0.45]) {
      const FF = frame(p.at[0], p.at[1], F.a + sgn * D2);
      const along = f * hd * 1.1;
      const [x, z] = FF.at(hw - wt / 2, -sgn * along);
      holes.push({ type: HT.BOX, x, z, a: FF.a + D2, hx: slit.width / 2, hz: wt / 2 + 0.3, y0: base + 2.0, y1: base + 2.0 + slit.height, room, close: 1, depth: wt });
      const [nx, nz] = FF.dir(-1, 0);
      ops.push({ x, y: base + 2.7, z, nx, ny: 0, nz, area: slit.width * slit.height * 1.4 });
    }
  }
  // torches in the hall, on its back wall
  {
    const [nx, nz] = F.dir(1, 0);
    for (const sgn of [-1, 1]) { const [x, z] = F.at(-hd + wt, sgn * (hw - wt) * 0.5); bracketTorch(b, x, z, nx, nz, base + 2.6, roomBit(room), seed * 0.13 + sgn, 0.3); }
  }
  // lit windows high on its faces
  const lights = [];
  const hallTop = base + Kp.hall;
  for (const [k, us] of [[0, [-0.3, 0.3]], [1, [0]], [3, [0]]]) {
    const FF = frame(p.at[0], p.at[1], F.a + k * D2 - D2);
    const ext = k % 2 === 0 ? hd : hw;
    const span = k % 2 === 0 ? hw : hd;
    for (const f of us) lights.push(windowIn(b, FF, f * span, ext, hallTop + 2.4, holes, -1, seed + 50 + k * 7 + (f > 0 ? 1 : 0)));
  }
  holes.push({ type: HT.BOX, x: F.x, z: F.z, a: F.a, hx: hd - wt, hz: hw - wt, y0: base - 0.35, y1: base + Kp.hall, room });
  b.add({ type: PT.BOX, x: F.x, z: F.z, a: F.a, hx: hd, hz: hw, y0: base - W.foot, y1: top, mat: MAT.MASONRY, flags: PF.WALK, tex: TX.MASONRY, tex2: TX.FLAGS, base, seed, holes });
  b.add({ type: PT.BOX, x: F.x, z: F.z, a: F.a, hx: hd - wt + 0.01, hz: hw - wt + 0.01, y0: base - 0.35, y1: base + 0.06, mat: MAT.MASONRY, tex: TX.FLAGS, tex2: TX.FLAGS, room, flags: PF.INSIDE | PF.WALK, seed: seed + 9 });
  for (let k = 0; k < 4; k++) {
    const FF = frame(p.at[0], p.at[1], F.a + k * D2), ext = k % 2 === 0 ? hd : hw, span = k % 2 === 0 ? hw : hd;
    parapet(b, FF, ext - W.parapet / 2, 0, 2 * span - (k % 2) * 2 * W.parapet, W.parapet, top, seed + 20 + k, D2);
  }
  return { top, room, F };
}

// A stone stair up to the walk, against a wall's inner face: rising along
// `angle` from (at) to the walk's height.
export function stoneStair(b, p) {
  const S = K.stair, base = p.base, H = p.height !== undefined ? p.height : K.wall.height;
  const n = Math.ceil(H / S.rise), rise = H / n, L = n * S.run;
  const F = frame(p.at[0], p.at[1], p.angle);
  const [x, z] = F.at(L / 2, 0);
  b.add({ type: PT.STAIR, x, z, a: p.angle, hx: L / 2, hz: S.width / 2, y0: base - 0.5, y1: base + H, base, rise, run: S.run, mat: MAT.MASONRY, tex: TX.MASONRY, tex2: TX.FLAGS, flags: PF.WALK, seed: p.seed || 501 });
  return { top: F.at(L - 0.3, 0), foot: F.at(-0.6, 0), L };
}

// A timber house: plaster between a timber frame, a shingle roof, a door
// toward local +w, small windows, one room.
export function house(b, p) {
  const Hs = K.house, base = p.base, seed = p.seed || 601, wt = Hs.wallT;
  const F = frame(p.at[0], p.at[1], p.angle), hw = p.w, hd = p.d;
  const ops = [], holes = [];
  const room = b.room(ops);
  {
    const [x, z] = F.at(p.doorU || 0, hd - wt / 2);
    holes.push({ type: HT.BOX, x, z, a: F.a, hx: 0.55, hz: wt / 2 + 0.3, y0: base - 0.4, y1: base + 2.15, room, close: 1, depth: wt });
    const [nx, nz] = F.dir(0, -1);
    ops.push({ x, y: base + 1.1, z, nx, ny: 0, nz, area: 1.1 * 2.15 });
    const [tx, tz] = F.at((p.doorU || 0) + 1.0, hd), [onx, onz] = F.dir(0, 1);
    bracketTorch(b, tx, tz, onx, onz, base + 2.4, ZONE_YARD, seed * 0.21);
  }
  for (const [u, w, sgn] of [[-hw * 0.5, hd, 1], [hw * 0.5, hd, 1], [0, -hd, -1]]) {
    if (Math.abs(u - (p.doorU || 0)) < 1.3 && sgn > 0) continue;
    const [x, z] = F.at(u, w - sgn * wt / 2);
    holes.push({ type: HT.BOX, x, z, a: F.a, hx: 0.32, hz: wt / 2 + 0.2, y0: base + 1.0, y1: base + 1.75, room, close: 1, depth: wt });
    const [nx, nz] = F.dir(0, -sgn);
    ops.push({ x, y: base + 1.35, z, nx, ny: 0, nz, area: 0.64 * 0.75 });
  }
  holes.push({ type: HT.BOX, x: F.x, z: F.z, a: F.a, hx: hw - wt, hz: hd - wt, y0: base - 0.35, y1: base + Hs.eave + 0.05, room });
  b.add({ type: PT.BOX, x: F.x, z: F.z, a: F.a, hx: hw, hz: hd, y0: base - 0.4, y1: base + Hs.eave, mat: MAT.PLASTER, tex: TX.FRAME, tex2: TX.PLAIN, base, seed, holes, flags: PF.GROW });
  b.add({ type: PT.BOX, x: F.x, z: F.z, a: F.a, hx: hw - wt + 0.01, hz: hd - wt + 0.01, y0: base - 0.35, y1: base + 0.08, mat: MAT.TIMBER, tex: TX.BOARDS, tex2: TX.BOARDS, room, flags: PF.INSIDE | PF.WALK, seed: seed + 1 });
  const ro = Hs.overhang, rh = Hs.pitch * (hd + ro);
  b.add({ type: PT.PRISM, x: F.x, z: F.z, a: F.a, hx: hw + ro * 0.6, hz: hd + ro, y0: base + Hs.eave, y1: base + Hs.eave + rh, mat: MAT.ROOF, mat2: MAT.TIMBER, tex: TX.BOARDS, tex2: TX.SHINGLE, seed: seed + 2, room });
  return { room, F };
}

// A well: a stone ring round a dark shaft, two posts, a beam and a little roof.
export function well(b, p) {
  const Wl = K.well, base = p.base, seed = p.seed || 701;
  const F = frame(p.at[0], p.at[1], p.angle || 0);
  b.add({ type: PT.CYL, x: F.x, z: F.z, hx: Wl.r, y0: base - 2, y1: base + Wl.height, mat: MAT.MASONRY, tex: TX.MASONRY, tex2: TX.FLAGS, base: base - 0.25, seed, flags: PF.WALK,
    holes: [{ type: HT.CYL, x: F.x, z: F.z, hx: Wl.r - Wl.wallT, y0: base - 2.5, y1: base + Wl.height + 0.1 }] });
  // the shaft: dark, just above the ground the ring stands on
  b.add({ type: PT.CYL, x: F.x, z: F.z, hx: Wl.r - Wl.wallT + 0.01, y0: base - 2.4, y1: base + Wl.shaft, mat: MAT.SHAFT, flags: PF.WALK, seed: seed + 1 });
  for (const sgn of [-1, 1]) {
    const [x, z] = F.at(sgn * (Wl.r + 0.05), 0);
    b.add({ type: PT.BOX, x, z, a: F.a, hx: 0.08, hz: 0.08, y0: base - 0.3, y1: base + 2.25, mat: MAT.TIMBER, tex: TX.PLAIN, flags: PF.GROW, seed: seed + 2 + sgn });
  }
  b.add({ type: PT.BOX, x: F.x, z: F.z, a: F.a, hx: Wl.r + 0.2, hz: 0.07, y0: base + 1.95, y1: base + 2.1, mat: MAT.TIMBER, tex: TX.PLAIN, flags: PF.GROW, seed: seed + 5 });
  b.add({ type: PT.PRISM, x: F.x, z: F.z, a: F.a, hx: Wl.r + 0.45, hz: 0.85, y0: base + 2.25, y1: base + 2.85, mat: MAT.ROOF, mat2: MAT.TIMBER, tex: TX.BOARDS, tex2: TX.SHINGLE, seed: seed + 6 });
}

// A window on its own (the yard): a short wall with a lit window in each face.
export function windowWall(b, p) {
  const base = p.base, F = frame(p.at[0], p.at[1], p.angle || 0), holes = [];
  windowIn(b, F, 0, 0.6, base + 1.8, holes, -1, p.seed || 801);
  windowIn(b, frame(p.at[0], p.at[1], (p.angle || 0) + Math.PI), 0, 0.6, base + 1.8, holes, -1, (p.seed || 801) + 1);
  b.add({ type: PT.BOX, x: F.x, z: F.z, a: F.a, hx: 2.4, hz: 0.6, y0: base - 0.5, y1: base + 4, mat: MAT.MASONRY, tex: TX.MASONRY, tex2: TX.FLAGS, base, holes, seed: p.seed || 801, flags: PF.WALK });
}

// Every piece of a structure's description, in order.
export function buildStructure(b, desc) {
  const out = [];
  for (const pc of desc.pieces) {
    switch (pc.kind) {
      case 'wall': out.push(curtainWall(b, pc)); break;
      case 'gate': out.push(gatehouse(b, pc)); break;
      case 'tower': out.push(tower(b, pc)); break;
      case 'keep': out.push(keep(b, pc)); break;
      case 'stair': out.push(stoneStair(b, pc)); break;
      case 'house': out.push(house(b, pc)); break;
      case 'well': out.push(well(b, pc)); break;
      case 'window': out.push(windowWall(b, pc)); break;
      case 'torch':
        if (pc.mount === 'bracket') bracketTorch(b, pc.at[0], pc.at[1], pc.normal[0], pc.normal[1], pc.y, pc.mask === undefined ? ZONE_OUT | ZONE_YARD : pc.mask, pc.phase || 0);
        else postTorch(b, pc.at[0], pc.at[1], pc.base, pc.mask === undefined ? ZONE_OUT | ZONE_YARD : pc.mask, pc.phase || 0);
        out.push(null); break;
      default: throw new Error(`no such piece: ${pc.kind}`);
    }
  }
  if (desc.yards) for (const y of desc.yards) b.yards.push(y);
  if (desc.cleared) for (const y of desc.cleared) b.cleared.push(y);
  return out;
}
