// The villages' pieces (phase 3b), as the fort's (kit-pieces.js): each turns
// a piece of a description into the kit's shapes, rooms, torches and
// windows.
//
//   { kind: 'cottage' | 'hall', at, angle, floor, low, w, d, walls, timber,
//     roof: 'thatch' | 'shingle', enter, lit, chimney, seed }
//   { kind: 'barn', ... }, { kind: 'chapel', ..., tower }, { kind: 'shelter', ... }
//   { kind: 'jetty', a: [x, z], b: [x, z], y, bed }
//   { kind: 'fence' | 'drystone', pts: [[x, z, ground], ...] }
//   { kind: 'haystack' | 'bench' | 'signpost', at, angle, base, arms: [angle, ...] }
//   { kind: 'bridge', style: 'timber' | 'stone', pts: [[x, z, y], ...], water, bed, arches }
//
// A house stands at `floor` (the top of its floor) on a footing of rough
// stone down to below `low`, the lowest ground under it, so it takes up the
// slope instead of levelling its plot. Its front, with the door, faces local
// +w. `walls` and `timber` are the tints (MAT.PLASTER, PLASTER2, ...).
// Houses one can `enter` have a room with a hearth, a table, a bed and a
// shelf; the others a closed door. `lit`: lit windows at night.
import { PT, HT, PF, TX, ZONE_OUT } from './kit.js';
import { MAT } from '../contract.js';
import { SCALE } from './scale.js';
import { frame, bracketTorch, postTorch } from './kit-pieces.js';

const K = SCALE.kit;

// A window `ww` by `wh` at u on the face at w = `face` (outward +w) of F,
// sill at y: a recess `depth` deep with a pane at its back, lit at night if
// `lit` (else dark glass). Pushes its hole; returns its middle (for a room's
// openings).
function pane(b, F, u, face, y, ww, wh, depth, holes, room, lit, seed) {
  const [hx, hz] = F.at(u, face - depth / 2 + 0.05);
  holes.push({ type: HT.BOX, x: hx, z: hz, a: F.a, hx: ww / 2, hz: depth / 2 + 0.05, y0: y, y1: y + wh, room, close: 1, depth });
  const [px, pz] = F.at(u, face - depth + 0.04);
  b.add({ type: PT.PANE, x: px, z: pz, a: F.a, hx: ww / 2 - 0.04, hz: 0.03, y0: y + 0.04, y1: y + wh - 0.04, mat: MAT.WINDOW, power: lit ? 1 : 0.02, seed });
  return { x: hx, z: hz, y: y + wh / 2 };
}

// The footing under a box hw by hd: rough stone from below the lowest
// ground to just over the floor's foot.
function footing(b, F, hw, hd, floor, low, seed) {
  b.add({ type: PT.BOX, x: F.x, z: F.z, a: F.a, hx: hw + 0.08, hz: hd + 0.08, y0: low - 0.35, y1: floor - 0.02, mat: MAT.STONE, tex: TX.RUBBLE, tex2: TX.PAVING, base: low - 0.35, seed, flags: PF.WALK });
}

// A gable roof over a box hw by hd from height y, its ridge along u.
function roof(b, F, hw, hd, y, pitch, over, kind, gable, room, seed) {
  const rh = pitch * (hd + over);
  const thatch = kind === 'thatch';
  b.add({ type: PT.PRISM, x: F.x, z: F.z, a: F.a, hx: hw + over * (thatch ? 0.8 : 0.6), hz: hd + over, y0: y, y1: y + rh,
    mat: thatch ? MAT.THATCH : MAT.ROOF, mat2: gable, tex: TX.BOARDS, tex2: thatch ? TX.THATCH : TX.TILES, seed, room: room === undefined ? -1 : room });
  return y + rh;
}

// A chimney through the roof at u: stone, from under the eaves to above the ridge.
function chimney(b, F, u, w, y0, ridge, seed) {
  const C = K.chimney, [x, z] = F.at(u, w);
  b.add({ type: PT.BOX, x, z, a: F.a, hx: C.half, hz: C.half, y0, y1: ridge + C.above, mat: MAT.MASONRY, tex: TX.ASHLAR, tex2: TX.PAVING, base: y0, seed, flags: PF.HOLD });
}

// A closed door at u on the front face: a recess with a timber leaf in it.
function closedDoor(b, F, u, face, floor, dw, dh, holes, timber, seed) {
  const [x, z] = F.at(u, face - 0.08);
  holes.push({ type: HT.BOX, x, z, a: F.a, hx: dw / 2, hz: 0.13, y0: floor, y1: floor + dh, close: 1, depth: 0.16 });
  const [lx, lz] = F.at(u, face - 0.17);
  b.add({ type: PT.BOX, x: lx, z: lz, a: F.a, hx: dw / 2 + 0.02, hz: 0.05, y0: floor, y1: floor + dh, mat: timber, tex: TX.BOARDS, tex2: TX.BOARDS, seed });
}

// The things inside a room one can enter, against its back wall (local
// -w) and its sides, in a box iw by id (half, inside the walls) at floor:
// a hearth (with its fire, which lights the room), a table, a bed and a
// shelf. `side`: which end the hearth is at.
export function furnish(b, F, iw, id, floor, room, timber, seed, side = 1, phase = 0) {
  const Hh = K.hearth, T = K.table, Bd = K.bed, Sh = K.shelf;
  const inside = PF.INSIDE | PF.WALK;
  // the hearth: stone, in the middle of an end wall, its fire low in it
  const [hx, hz] = F.at(side * (iw - Hh.d), 0);
  b.add({ type: PT.BOX, x: hx, z: hz, a: F.a + Math.PI / 2, hx: Hh.w, hz: Hh.d, y0: floor - 0.1, y1: floor + Hh.h, mat: MAT.STONE, tex: TX.RUBBLE, tex2: TX.PAVING, room, flags: inside, seed });
  const [fx, fz] = F.at(side * (iw - Hh.d * 2 - 0.25), 0);
  b.torch({ x: fx, z: fz, base: floor + Hh.h - 0.02, h: 0.01, flameY: floor + Hh.h + 0.16, phase, mask: 0, rooms: [room], mount: 'hearth' });
  // a table in the middle, toward the hearth
  const [tx, tz] = F.at(side * iw * 0.15, 0.1);
  b.add({ type: PT.BOX, x: tx, z: tz, a: F.a, hx: T.w, hz: T.d, y0: floor + T.h - 0.06, y1: floor + T.h, mat: timber, tex: TX.BOARDS, tex2: TX.BOARDS, room, flags: inside, seed: seed + 1 });
  // (on two slim trestles, not a solid block: a block would stand black in the dark room)
  for (const sg of [-1, 1]) {
    const [lx, lz] = F.at(side * iw * 0.15 + sg * (T.w - 0.12), 0.1);
    b.add({ type: PT.BOX, x: lx, z: lz, a: F.a, hx: 0.05, hz: T.d * 0.75, y0: floor, y1: floor + T.h - 0.06, mat: timber, tex: TX.PLAIN, room, flags: inside | PF.GROW, seed: seed + 2 });
  }
  // a bed at the other end, along the back wall
  const [bx, bz] = F.at(-side * (iw - Bd.w - 0.05), -(id - Bd.d - 0.05));
  b.add({ type: PT.BOX, x: bx, z: bz, a: F.a, hx: Bd.w, hz: Bd.d, y0: floor, y1: floor + Bd.h, mat: MAT.PLASTER2, tex: TX.PLAIN, tex2: TX.PLAIN, room, flags: inside, seed: seed + 3 });
  // a shelf on the back wall, beside the hearth
  const [sx, sz] = F.at(side * iw * 0.35, -(id - Sh.d - 0.02));
  b.add({ type: PT.BOX, x: sx, z: sz, a: F.a, hx: Sh.w, hz: Sh.d, y0: floor, y1: floor + Sh.h, mat: timber, tex: TX.BOARDS, tex2: TX.BOARDS, room, flags: inside, seed: seed + 4 });
}

// A cottage or a larger house (`hall`: an upper storey under the eaves).
export function dwelling(b, p) {
  const hall = p.kind === 'hall', S = hall ? K.hall : K.cottage;
  const F = frame(p.at[0], p.at[1], p.angle), hw = p.w, hd = p.d, wt = S.wallT, floor = p.floor, seed = p.seed || 1001;
  const timber = p.timber || MAT.TIMBER, walls = p.walls || MAT.PLASTER;
  footing(b, F, hw, hd, floor, p.low, seed);
  const holes = [], ops = [];
  const room = p.enter ? b.room(ops) : undefined;
  const doorU = p.doorU || 0, dw = 1.2, dh = 2.2;
  if (p.enter) {
    const [x, z] = F.at(doorU, hd - wt / 2);
    holes.push({ type: HT.BOX, x, z, a: F.a, hx: dw / 2, hz: wt / 2 + 0.3, y0: floor - 0.05, y1: floor + dh, room, close: 1, depth: wt });
    const [nx, nz] = F.dir(0, -1);
    ops.push({ x, y: floor + dh / 2, z, nx, ny: 0, nz, area: dw * dh });
  } else closedDoor(b, F, doorU, hd, floor, dw, dh, holes, timber, seed + 7);
  // windows: either side of the door at the front, two at the back, one
  // in each end; a hall has a second row under its eaves
  const rows = hall ? [0.95, S.upper + 0.55] : [0.95];
  const through = p.enter ? wt + 0.1 : 0.22;
  let k = 0;
  for (const y of rows) {
    const upper = y > 2;
    for (const [u, sgn] of [[-hw * 0.55, 1], [hw * 0.55, 1], [-hw * 0.45, -1], [hw * 0.45, -1]]) {
      if (!upper && sgn > 0 && Math.abs(u - doorU) < 1.2) continue;
      const Fs = sgn > 0 ? F : frame(F.x, F.z, F.a + Math.PI);
      // (an upper window lights the upper storey, not the room one enters)
      const inRoom = p.enter && !upper;
      const o = pane(b, Fs, sgn > 0 ? u : -u, hd, floor + y, 0.62, upper ? 0.7 : 0.85, inRoom ? through : 0.22, holes, inRoom ? room : -1, p.lit && (k++ % 3 !== 2 || upper), seed + 20 + k);
      if (inRoom) { const [nx, nz] = Fs.dir(0, -1); ops.push({ x: o.x, y: o.y, z: o.z, nx, ny: 0, nz, area: 0.62 * 0.85 }); }
    }
  }
  if (p.enter) holes.push({ type: HT.BOX, x: F.x, z: F.z, a: F.a, hx: hw - wt, hz: hd - wt, y0: floor - 0.05, y1: floor + (hall ? S.upper : S.eave) - 0.05, room });
  b.add({ type: PT.BOX, x: F.x, z: F.z, a: F.a, hx: hw, hz: hd, y0: floor - 0.1, y1: floor + S.eave, mat: walls, tex: TX.TIMBERED, tex2: TX.PLAIN, base: floor, seed, holes, flags: PF.GROW });
  if (p.enter) {
    b.add({ type: PT.BOX, x: F.x, z: F.z, a: F.a, hx: hw - wt + 0.01, hz: hd - wt + 0.01, y0: floor - 0.1, y1: floor + 0.02, mat: timber, tex: TX.BOARDS, tex2: TX.BOARDS, room, flags: PF.INSIDE | PF.WALK, seed: seed + 1 });
    furnish(b, F, hw - wt, hd - wt, floor + 0.02, room, timber, seed + 40, p.hearthSide || 1, seed * 0.17);
  }
  const ridge = roof(b, F, hw, hd, floor + S.eave, S.pitch, S.overhang, p.roof, timber, room, seed + 2);
  if (p.chimney || p.enter) chimney(b, F, (p.hearthSide || 1) * (hw - wt - 0.35), 0, floor + S.eave - 0.3, ridge, seed + 3);
  return { room, F, door: F.at(doorU, hd + 1.2), floor };
}

// A barn: timber boards, a wide doorway on its long side (open: one can
// walk in), no windows, its roof low and broad.
export function barn(b, p) {
  const S = K.barn, F = frame(p.at[0], p.at[1], p.angle), hw = p.w, hd = p.d, wt = S.wallT, floor = p.floor, seed = p.seed || 1101;
  const timber = p.timber || MAT.TIMBER2;
  footing(b, F, hw, hd, floor, p.low, seed);
  const ops = [], holes = [];
  const room = b.room(ops);
  const [dx, dz] = F.at(0, hd - wt / 2), [nx, nz] = F.dir(0, -1);
  holes.push({ type: HT.BOX, x: dx, z: dz, a: F.a, hx: S.door[0] / 2, hz: wt / 2 + 0.3, y0: floor - 0.05, y1: floor + S.door[1], room, close: 1, depth: wt });
  ops.push({ x: dx, y: floor + S.door[1] / 2, z: dz, nx, ny: 0, nz, area: S.door[0] * S.door[1] });
  holes.push({ type: HT.BOX, x: F.x, z: F.z, a: F.a, hx: hw - wt, hz: hd - wt, y0: floor - 0.05, y1: floor + S.eave - 0.05, room });
  b.add({ type: PT.BOX, x: F.x, z: F.z, a: F.a, hx: hw, hz: hd, y0: floor - 0.1, y1: floor + S.eave, mat: timber, tex: TX.BOARDS, tex2: TX.PLAIN, base: floor, seed, holes, flags: PF.GROW });
  b.add({ type: PT.BOX, x: F.x, z: F.z, a: F.a, hx: hw - wt + 0.01, hz: hd - wt + 0.01, y0: floor - 0.1, y1: floor + 0.02, mat: MAT.YARD, tex: TX.PLAIN, tex2: TX.PLAIN, room, flags: PF.INSIDE | PF.WALK, seed: seed + 1 });
  // hay against the back wall
  const H = K.haystack, [sx, sz] = F.at(-hw * 0.4, -(hd - wt - H.d - 0.1));
  b.add({ type: PT.BOX, x: sx, z: sz, a: F.a, hx: H.w, hz: H.d, y0: floor, y1: floor + 1.2, mat: MAT.THATCH, tex: TX.PLAIN, tex2: TX.PLAIN, room, flags: PF.INSIDE | PF.WALK, seed: seed + 4 });
  roof(b, F, hw, hd, floor + S.eave, S.pitch, S.overhang, p.roof, timber, room, seed + 2);
  return { room, F, door: F.at(0, hd + 2), floor };
}

// A small chapel: a stone nave with tall arched windows, a door in its
// front gable end (local +u), and a bellcote over that gable or a short
// tower in front of it.
export function chapel(b, p) {
  const S = K.chapel, F = frame(p.at[0], p.at[1], p.angle), hw = p.w, hd = p.d, wt = S.wallT, floor = p.floor, seed = p.seed || 1201;
  footing(b, F, hw, hd, floor, p.low, seed);
  if (p.tower) { const [tx, tz] = F.at(hw + S.tower - 0.05, 0); footing(b, frame(tx, tz, F.a), S.tower, S.tower, floor, p.low, seed + 9); }
  const holes = [];
  // arched windows down both sides, lit at night
  for (const sgn of [1, -1]) {
    const Fs = sgn > 0 ? F : frame(F.x, F.z, F.a + Math.PI);
    for (const u of [-hw * 0.45, hw * 0.1]) {
      const [x, z] = Fs.at(u, hd - 0.3);
      holes.push({ type: HT.ARCH, x, z, a: Fs.a, hx: 0.32, hz: 0.35, y0: floor + 1.5, y1: floor + 3.3, close: 1, depth: 0.5 });
      const [px, pz] = Fs.at(u, hd - 0.56);
      b.add({ type: PT.PANE, x: px, z: pz, a: Fs.a, hx: 0.28, hz: 0.03, y0: floor + 1.55, y1: floor + 3.2, mat: MAT.WINDOW, power: p.lit ? 0.8 : 0.02, seed: seed + 10 });
    }
  }
  // the door in the front end (+u): an arched recess with a timber leaf
  const Fe = frame(F.x, F.z, F.a - Math.PI / 2);     // its +w is the nave's +u
  {
    const [x, z] = Fe.at(0, hw - 0.1);
    holes.push({ type: HT.ARCH, x, z, a: Fe.a, hx: 0.65, hz: 0.18, y0: floor, y1: floor + 2.75, close: 1, depth: 0.2 });
    const [lx, lz] = Fe.at(0, hw - 0.24);
    b.add({ type: PT.BOX, x: lx, z: lz, a: Fe.a, hx: 0.68, hz: 0.05, y0: floor, y1: floor + 2.4, mat: MAT.TIMBER, tex: TX.BOARDS, tex2: TX.BOARDS, seed: seed + 5 });
  }
  b.add({ type: PT.BOX, x: F.x, z: F.z, a: F.a, hx: hw, hz: hd, y0: floor - 0.1, y1: floor + S.eave, mat: MAT.MASONRY, tex: TX.ASHLAR, tex2: TX.PAVING, base: floor, seed, holes });
  const ridge = roof(b, F, hw, hd, floor + S.eave, S.pitch, S.overhang, 'shingle', MAT.MASONRY, undefined, seed + 2);
  if (p.tower) {
    // a short square tower in front of the door's gable, its own door the chapel's way in
    const T = S.tower, [tx, tz] = F.at(hw + T - 0.05, 0), Ft = frame(tx, tz, F.a);
    const th = [];
    const [ax, az] = Ft.at(T - 0.1, 0);
    th.push({ type: HT.ARCH, x: ax, z: az, a: F.a + Math.PI / 2, hx: 0.6, hz: 0.25, y0: floor, y1: floor + 2.5, close: 1, depth: 0.3 });
    // the bell openings near its top, on all four sides, into a hollow
    // belfry (a room, so it is dark inside)
    const bops = [], belfry = b.room(bops);
    for (let k = 0; k < 4; k++) {
      const Fk = frame(tx, tz, F.a + k * Math.PI / 2), [bx, bz] = Fk.at(0, T - 0.25), [nx, nz] = Fk.dir(0, -1);
      th.push({ type: HT.ARCH, x: bx, z: bz, a: Fk.a, hx: 0.42, hz: 0.35, y0: floor + S.towerH - 2.3, y1: floor + S.towerH - 0.8, room: belfry, close: 1, depth: 0.5 });
      bops.push({ x: bx, y: floor + S.towerH - 1.5, z: bz, nx, ny: 0, nz, area: 0.84 * 1.5 });
    }
    th.push({ type: HT.BOX, x: tx, z: tz, a: F.a, hx: T - 0.45, hz: T - 0.45, y0: floor + S.towerH - 2.5, y1: floor + S.towerH - 0.4, room: belfry });
    b.add({ type: PT.BOX, x: tx, z: tz, a: F.a, hx: T, hz: T, y0: floor - 0.1, y1: floor + S.towerH, mat: MAT.MASONRY, tex: TX.ASHLAR, tex2: TX.PAVING, base: floor, seed: seed + 6, holes: th });
    const [lx, lz] = Ft.at(T - 0.36, 0);
    b.add({ type: PT.BOX, x: lx, z: lz, a: F.a + Math.PI / 2, hx: 0.6, hz: 0.05, y0: floor, y1: floor + 2.2, mat: MAT.TIMBER, tex: TX.BOARDS, tex2: TX.BOARDS, seed: seed + 7 });
    // its cap: two gables crossing, so it reads as a low spire from every side
    for (const da of [0, Math.PI / 2]) b.add({ type: PT.PRISM, x: tx, z: tz, a: F.a + da, hx: T + 0.25, hz: T + 0.25, y0: floor + S.towerH, y1: floor + S.towerH + 2.2, mat: MAT.ROOF, mat2: MAT.MASONRY, tex: TX.ASHLAR, tex2: TX.TILES, seed: seed + 8 });
  } else {
    // a bellcote: a small stone frame on the front gable, open for its bell
    const [cx, cz] = F.at(hw - 0.3, 0);
    b.add({ type: PT.BOX, x: cx, z: cz, a: F.a, hx: 0.22, hz: 0.85, y0: ridge - 0.6, y1: ridge + 1.8, mat: MAT.MASONRY, tex: TX.ASHLAR, tex2: TX.PAVING, base: ridge - 0.6, seed: seed + 6,
      holes: [{ type: HT.ARCH, x: cx, z: cz, a: F.a + Math.PI / 2, hx: 0.48, hz: 0.4, y0: ridge + 0.25, y1: ridge + 1.4, close: 1, depth: 0.44 }] });
    b.add({ type: PT.PRISM, x: cx, z: cz, a: F.a + Math.PI / 2, hx: 1.0, hz: 0.4, y0: ridge + 1.8, y1: ridge + 2.3, mat: MAT.ROOF, mat2: MAT.MASONRY, tex: TX.ASHLAR, tex2: TX.TILES, seed: seed + 8 });
  }
  return { F, door: F.at(hw + (p.tower ? 2 * S.tower : 0) + 1.5, 0), floor };
}

// An open-sided market shelter: posts at its corners and halfway along,
// a roof, a counter.
export function shelter(b, p) {
  const S = K.shelter, F = frame(p.at[0], p.at[1], p.angle), hw = p.w, hd = p.d, base = p.base, seed = p.seed || 1301;
  const timber = p.timber || MAT.TIMBER;
  for (const u of [-hw, 0, hw]) for (const w of [-hd, hd]) {
    const [x, z] = F.at(u * 0.92, w * 0.9);
    b.add({ type: PT.BOX, x, z, a: F.a, hx: S.post, hz: S.post, y0: base - 0.4, y1: base + S.eave, mat: timber, tex: TX.PLAIN, flags: PF.GROW, seed: seed + 1 });
  }
  const T = K.table, [cx, cz] = F.at(0, -hd * 0.35);
  b.add({ type: PT.BOX, x: cx, z: cz, a: F.a, hx: hw * 0.7, hz: T.d, y0: base + 0.85, y1: base + 0.95, mat: timber, tex: TX.BOARDS, tex2: TX.BOARDS, flags: PF.WALK, seed: seed + 2 });
  b.add({ type: PT.BOX, x: cx, z: cz, a: F.a, hx: hw * 0.62, hz: T.d * 0.7, y0: base - 0.2, y1: base + 0.85, mat: timber, tex: TX.BOARDS, tex2: TX.BOARDS, seed: seed + 3 });
  roof(b, F, hw, hd, base + S.eave, S.pitch, 0.35, p.roof || 'shingle', timber, undefined, seed + 4);
}

// A jetty from the shore (a) out over the water (b): planks on posts.
export function jetty(b, p) {
  const J = K.jetty, [ax, az] = p.a, [bx, bz] = p.b, L = Math.hypot(bx - ax, bz - az), a = Math.atan2(bz - az, bx - ax);
  const F = frame((ax + bx) / 2, (az + bz) / 2, a), y = p.y, seed = p.seed || 1401;
  b.add({ type: PT.BOX, x: F.x, z: F.z, a, hx: L / 2, hz: J.width, y0: y - J.plank, y1: y, mat: MAT.TIMBER2, tex: TX.BOARDS, tex2: TX.BOARDS, flags: PF.WALK, seed });
  for (let u = -L / 2 + 0.3; u <= L / 2 + 1e-6; u += J.span) {
    for (const sgn of [-1, 1]) {
      const [x, z] = F.at(Math.min(u, L / 2 - 0.15), sgn * (J.width - 0.05));
      b.add({ type: PT.BOX, x, z, a, hx: J.post, hz: J.post, y0: p.bed - 0.6, y1: y + (u > L / 2 - J.span ? 0.7 : -0.02), mat: MAT.TIMBER2, tex: TX.PLAIN, flags: PF.GROW, seed: seed + 1 });
    }
  }
  return { end: F.at(L / 2 - 0.6, 0) };
}

// A fence along `pts` ([x, z, ground]): a post at every point, two rails
// between each pair. The points are where the generator put them (at most
// a span or two apart), so the rails follow the ground.
export function fence(b, p) {
  const Fn = K.fence, pts = p.pts, timber = p.timber || MAT.TIMBER2, seed = p.seed || 1501;
  for (let i = 0; i < pts.length; i++) {
    const [x, z, g] = pts[i];
    b.add({ type: PT.BOX, x, z, a: p.angle || 0, hx: Fn.post, hz: Fn.post, y0: g - 0.4, y1: g + Fn.height, mat: timber, tex: TX.PLAIN, flags: PF.HOLD, seed: seed + i });
    if (i === 0) continue;
    const [x0, z0, g0] = pts[i - 1], L = Math.hypot(x - x0, z - z0), a = Math.atan2(z - z0, x - x0), gm = (g + g0) / 2;
    for (const h of Fn.rails) {
      b.add({ type: PT.BOX, x: (x + x0) / 2, z: (z + z0) / 2, a, hx: L / 2, hz: Fn.rail, y0: gm + h - Fn.railH / 2, y1: gm + h + Fn.railH / 2, mat: timber, tex: TX.PLAIN, flags: PF.HOLD, seed: seed + i * 3 + 1 });
    }
  }
}

// A low dry-stone wall along `pts`, a piece for each pair of points.
export function drystone(b, p) {
  const Dw = K.drystone, pts = p.pts, seed = p.seed || 1601;
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0, g0] = pts[i - 1], [x1, z1, g1] = pts[i];
    const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0);
    // (each piece a little longer, so the pieces meet with no gap)
    b.add({ type: PT.BOX, x: (x0 + x1) / 2, z: (z0 + z1) / 2, a, hx: L / 2 + 0.12, hz: Dw.half, y0: Math.min(g0, g1) - 0.3, y1: (g0 + g1) / 2 + Dw.height - 0.02 * (i % 3),
      mat: MAT.STONE, tex: TX.RUBBLE, tex2: TX.RUBBLE, base: Math.min(g0, g1) - 0.3, seed: seed + i, flags: PF.WALK });
  }
}

// Two taller posts either side of a gate gap.
export function gateposts(b, p) {
  const Fn = K.fence, seed = p.seed || 1651;
  for (const [x, z, g] of p.pts) b.add({ type: PT.BOX, x, z, a: p.angle || 0, hx: Fn.post * 1.6, hz: Fn.post * 1.6, y0: g - 0.4, y1: g + Fn.height + 0.35, mat: p.timber || MAT.TIMBER2, tex: TX.PLAIN, flags: PF.HOLD, seed });
}

export function haystack(b, p) {
  const H = K.haystack, F = frame(p.at[0], p.at[1], p.angle || 0), base = p.base, seed = p.seed || 1701;
  b.add({ type: PT.BOX, x: F.x, z: F.z, a: F.a, hx: H.w, hz: H.d, y0: base - 0.3, y1: base + H.h, mat: MAT.THATCH, tex: TX.PLAIN, tex2: TX.PLAIN, seed, flags: PF.WALK });
  b.add({ type: PT.PRISM, x: F.x, z: F.z, a: F.a, hx: H.w + 0.1, hz: H.d + 0.15, y0: base + H.h, y1: base + H.h + H.roof, mat: MAT.THATCH, mat2: MAT.THATCH, tex: TX.PLAIN, tex2: TX.THATCH, seed: seed + 1 });
}

export function bench(b, p) {
  const Bn = K.bench, F = frame(p.at[0], p.at[1], p.angle || 0), base = p.base, seed = p.seed || 1751, timber = p.timber || MAT.TIMBER;
  b.add({ type: PT.BOX, x: F.x, z: F.z, a: F.a, hx: Bn.half, hz: Bn.depth, y0: base + Bn.seat - 0.07, y1: base + Bn.seat, mat: timber, tex: TX.BOARDS, tex2: TX.BOARDS, seed, flags: PF.HOLD | PF.WALK });
  for (const sgn of [-1, 1]) {
    const [x, z] = F.at(sgn * (Bn.half - 0.12), 0);
    b.add({ type: PT.BOX, x, z, a: F.a, hx: 0.06, hz: Bn.depth * 0.8, y0: base - 0.2, y1: base + Bn.seat - 0.07, mat: timber, tex: TX.PLAIN, flags: PF.HOLD, seed: seed + 1 });
  }
}

// A signpost: a post, and an arm pointing along each of `arms` (angles).
export function signpost(b, p) {
  const Sg = K.signpost, [x, z] = p.at, base = p.base, seed = p.seed || 1801, timber = p.timber || MAT.TIMBER2;
  b.add({ type: PT.BOX, x, z, a: p.arms[0] || 0, hx: Sg.post, hz: Sg.post, y0: base - 0.4, y1: base + Sg.height, mat: timber, tex: TX.PLAIN, flags: PF.HOLD, seed });
  p.arms.forEach((a, i) => {
    const y = base + Sg.height - 0.3 - i * 0.32, cx = x + Math.cos(a) * (Sg.arm + Sg.post), cz = z + Math.sin(a) * (Sg.arm + Sg.post);
    b.add({ type: PT.BOX, x: cx, z: cz, a, hx: Sg.arm, hz: Sg.armT, y0: y - Sg.armH / 2, y1: y + Sg.armH / 2, mat: MAT.TIMBER3, tex: TX.PLAIN, flags: PF.HOLD, seed: seed + 1 + i });
  });
}

// A post lantern: a torch on a post, lighting outside.
export function lantern(b, p) { postTorch(b, p.at[0], p.at[1], p.base, ZONE_OUT, p.phase || 0); }

// A bridge along `pts` ([x, z, y]: the road's centre and its surface over
// the crossing, bank to bank). Timber: a plank deck on pairs of posts, with
// rails. Stone: one body from the river bed up to the road, pierced by
// `arches` arches under it, with parapets; its road is level (the generator
// makes it so).
export function bridge(b, p) {
  const Bg = K.bridge, pts = p.pts, seed = p.seed || 1901;
  if (p.style === 'stone') {
    const [ax, az, ay] = pts[0], [bx, bz] = pts[pts.length - 1], L = Math.hypot(bx - ax, bz - az), a = Math.atan2(bz - az, bx - ax);
    const F = frame((ax + bx) / 2, (az + bz) / 2, a), y = ay, holes = [];
    // the arches: evenly along it, springing just over the water, and over
    // the water: the ends (the road's last 3 m onto the banks) stay solid but
    // for the last half metre before the water, so no bank fills an arch and
    // no corner of dry ground is left between an end and the bank
    const n = p.arches || 1, gap = 1.2, end = Math.max(1.2, Math.min(2.6, (L - (n - 1) * gap - 2.5 * n) / 2));
    const span = (L - 2 * end - (n - 1) * gap) / n, r = Math.min(span / 2, Math.max(0.8, y - Bg.deck - 0.5 - p.water) * 0.95);
    for (let k = 0; k < n; k++) {
      const u = -L / 2 + end + span / 2 + k * (span + gap), [hx, hz] = F.at(u, 0);
      holes.push({ type: HT.ARCH, x: hx, z: hz, a, hx: r, hz: Bg.half + 0.2, y0: p.bed - 2, y1: y - Bg.deck - 0.25, depth: 2 * Bg.half });
    }
    b.add({ type: PT.BOX, x: F.x, z: F.z, a, hx: L / 2, hz: Bg.half, y0: p.bed - 1.5, y1: y, mat: MAT.MASONRY, tex: TX.ASHLAR, tex2: TX.PAVING, base: p.bed - 1.5, seed, holes, flags: PF.WALK });
    // (the parapets plain dressed stone: their courses, seen along them as
    // you cross, blinked however they were drawn)
    for (const sgn of [-1, 1]) {
      const [x, z] = F.at(0, sgn * (Bg.half - Bg.parapet / 2));
      b.add({ type: PT.BOX, x, z, a, hx: L / 2, hz: Bg.parapet / 2, y0: y - 0.05, y1: y + Bg.parapetH, mat: MAT.MASONRY, tex: TX.PLAIN, tex2: TX.PAVING, base: y, seed: seed + 1 + sgn, flags: PF.WALK });
    }
    return;
  }
  // timber: a deck piece between each pair of points, posts every span
  let since = Bg.span;
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0, y0] = pts[i - 1], [x1, z1, y1] = pts[i];
    const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0), y = Math.max(y0, y1);
    const F = frame((x0 + x1) / 2, (z0 + z1) / 2, a);
    b.add({ type: PT.BOX, x: F.x, z: F.z, a, hx: L / 2 + 0.06, hz: Bg.half - 0.3, y0: y - Bg.deck, y1: y, mat: MAT.TIMBER, tex: TX.BOARDS, tex2: TX.BOARDS, seed: seed + i, flags: PF.WALK });
    for (const sgn of [-1, 1]) {
      const [rx, rz] = F.at(0, sgn * (Bg.half - 0.36));
      b.add({ type: PT.BOX, x: rx, z: rz, a, hx: L / 2 + 0.06, hz: 0.05, y0: y + Bg.rail - 0.12, y1: y + Bg.rail, mat: MAT.TIMBER, tex: TX.PLAIN, flags: PF.HOLD, seed: seed + 2 * i + 1 });
    }
    since += L;
    if (since >= Bg.span || i === pts.length - 1 || i === 1) {
      since = 0;
      for (const sgn of [-1, 1]) {
        const [px, pz] = F.at(L / 2, sgn * (Bg.half - 0.36));
        b.add({ type: PT.BOX, x: px, z: pz, a, hx: Bg.post, hz: Bg.post, y0: p.bed - 0.8, y1: y + Bg.rail + 0.08, mat: MAT.TIMBER, tex: TX.PLAIN, flags: PF.GROW, seed: seed + 5 * i });
      }
    }
  }
}

// Every village piece of a description (the fort's pieces are in kit-pieces.js).
export function buildVillagePiece(b, pc) {
  switch (pc.kind) {
    case 'cottage': case 'hall': return dwelling(b, pc);
    case 'barn': return barn(b, pc);
    case 'chapel': return chapel(b, pc);
    case 'shelter': return shelter(b, pc);
    case 'jetty': return jetty(b, pc);
    case 'fence': return fence(b, pc);
    case 'drystone': return drystone(b, pc);
    case 'gateposts': return gateposts(b, pc);
    case 'haystack': return haystack(b, pc);
    case 'bench': return bench(b, pc);
    case 'signpost': return signpost(b, pc);
    case 'lantern': return lantern(b, pc);
    case 'bridge': return bridge(b, pc);
    default: return undefined;
  }
}
export { bracketTorch };
