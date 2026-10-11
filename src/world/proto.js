// Phase 3a's two prototypes of one set of pieces (docs/phase3a.md, section 1):
// a 24 m crenellated wall with a gate arch, a round tower (radius 4 m, its
// top 9.5 m up, a doorway at its foot) and a timber house (7 by 5 m, eaves
// at 3 m, a pitched roof), each square to the grid and turned 30 degrees.
// - protoSpans(): as per-cell spans on the 1 m grid, like the lab's wall: a
//   cell holds one span, its bottom and top taken at the cell's centre, so
//   arches, round walls and roofs are stepped;
// - protoShapes(): as the kit's exact shapes.
// Both stand in the building yard with ?yard=1&proto=1 (which then holds
// only them): the spans to the west, the shapes to the east; the rows square
// to the grid at the south, seen from the north, the turned rows at the
// north, seen from the south, each with a pond before it, so nothing stands
// between a camera and what it looks at.
import { MAT } from '../contract.js';
import { spansFromCells, SPAN_MERLON } from './spans.js';

// (the building yard's ground, src/world/yard.js)
const D = Math.PI / 180, base = 10;
const ROWS = { square: 120, turned: 420 };                 // z of the rows square to the grid and turned 30 degrees
const XS = { spans: { wall: 80, tower: 135, house: 180 }, shapes: { wall: 330, tower: 385, house: 430 } };
const WALL = { half: 12, thick: 3.2, h: 6.5, merlon: 1.0, merlonW: 1.4, gap: 0.9, gate: 1.8, spring: 3.2 };
const TOWER = { r: 4, wt: 1.15, top: 9.5, door: 0.75, doorH: 2.7 };
const HOUSE = { w: 3.5, d: 2.5, eave: 3.0, pitch: 0.95, over: 0.45, wt: 0.3, door: 0.55, doorH: 2.15 };

const sets = [];
for (const set of ['spans', 'shapes']) for (const [row, z] of Object.entries(ROWS)) sets.push({ set, z, a: row === 'turned' ? 30 * D : 0, xs: XS[set] });

export const PROTO = {
  cameras: [],
  // ponds before the rows (from z0 to z1), between the near and middle cameras
  ponds: [[ROWS.square + 20, ROWS.square + 36], [ROWS.turned - 36, ROWS.turned - 20]],
};
// cameras: each piece near, at middle distance and far, both rows, both sets
// (the turned row first, from the south; the square row from the north)
for (const set of ['spans', 'shapes']) {
  for (const [row, z] of [['turned', ROWS.turned], ['square', ROWS.square]]) {
    const sgn = row === 'turned' ? -1 : 1;
    for (const [piece, x] of Object.entries(XS[set])) {
      for (const [dist, label] of [[14, 'near'], [50, 'middle'], [200, 'far']]) {
        const cx = x - dist * 0.26, cz = z + sgn * dist * 0.97;
        const name = `prototype, ${set}: ${piece}${row === 'square' ? ' (square)' : ''}, ${label}`;
        PROTO.cameras.push({ name, x: cx, z: cz, yaw: Math.atan2(x - cx, z - cz) * 180 / Math.PI, pitch: dist < 20 ? 6 : 1, time: 'day', proto: { set, piece, dist, row } });
      }
    }
  }
}

function local(x, z, a) { const ca = Math.cos(a), sa = Math.sin(a); return (px, pz) => { const dx = px - x, dz = pz - z; return [dx * ca + dz * sa, -dx * sa + dz * ca]; }; }

export function protoSpans() {
  const cells = new Map();
  const put = (ix, iz, c) => { const k = iz * 4096 + ix; if (!cells.has(k)) cells.set(k, { ix, iz, ...c }); };
  for (const s of sets.filter((v) => v.set === 'spans')) {
    // the wall, its gate in the middle, merlons on the outer edge (-w)
    {
      const x = s.xs.wall, L = local(x, s.z, s.a), R = WALL.half + WALL.thick;
      for (let iz = Math.floor(s.z - R); iz <= s.z + R; iz++) for (let ix = Math.floor(x - R); ix <= x + R; ix++) {
        const [u, w] = L(ix + 0.5, iz + 0.5);
        if (Math.abs(u) > WALL.half || Math.abs(w) > WALL.thick / 2) continue;
        let y0 = base - 2, flags = 0;
        if (w < -WALL.thick / 2 + 0.6) { const per = WALL.merlonW + WALL.gap, f = ((u + per * 100 + WALL.merlonW / 2) / per) % 1; if (f < WALL.merlonW / per) flags |= SPAN_MERLON; }
        if (Math.abs(u) < WALL.gate) y0 = base + WALL.spring + Math.sqrt(WALL.gate * WALL.gate - u * u);
        put(ix, iz, { y0, y1: base + WALL.h, flags, mat: MAT.STONE });
      }
    }
    // the round tower: a hollow ring, open at the top, a door toward -w
    {
      const x = s.xs.tower, L = local(x, s.z, s.a), R = TOWER.r + 1;
      for (let iz = Math.floor(s.z - R); iz <= s.z + R; iz++) for (let ix = Math.floor(x - R); ix <= x + R; ix++) {
        const [u, w] = L(ix + 0.5, iz + 0.5), rr = Math.hypot(u, w);
        if (rr > TOWER.r || rr < TOWER.r - TOWER.wt) continue;
        let y0 = base - 2, flags = 0;
        if (w < 0 && Math.abs(u) < TOWER.door) y0 = base + TOWER.doorH;
        const ang = Math.atan2(w, u), per = 2 * Math.PI / Math.round(2 * Math.PI * TOWER.r / 2.3);
        if (rr > TOWER.r - 0.7 && ((ang + 10 * Math.PI) % per) / per < 0.6) flags |= SPAN_MERLON;
        put(ix, iz, { y0, y1: base + TOWER.top, flags, mat: MAT.STONE });
      }
    }
    // the house: its walls up to the roof, the roof over the room, a door toward -w
    {
      const x = s.xs.house, L = local(x, s.z, s.a), R = HOUSE.w + 2;
      for (let iz = Math.floor(s.z - R); iz <= s.z + R; iz++) for (let ix = Math.floor(x - R); ix <= x + R; ix++) {
        const [u, w] = L(ix + 0.5, iz + 0.5);
        const ro = HOUSE.over;
        if (Math.abs(u) > HOUSE.w + ro * 0.6 || Math.abs(w) > HOUSE.d + ro) continue;
        const roof = base + HOUSE.eave + HOUSE.pitch * (HOUSE.d + ro - Math.abs(w));
        const inWall = Math.abs(u) <= HOUSE.w && Math.abs(w) <= HOUSE.d && (Math.abs(u) > HOUSE.w - HOUSE.wt || Math.abs(w) > HOUSE.d - HOUSE.wt);
        let y0 = base + HOUSE.eave;
        if (inWall) y0 = w < 0 && Math.abs(u) < HOUSE.door ? base + HOUSE.doorH : base - 0.4;
        put(ix, iz, { y0, y1: roof, flags: 0, mat: inWall ? MAT.PLASTER : MAT.ROOF, mat2: MAT.ROOF });
      }
    }
  }
  return spansFromCells([...cells.values()], { merlon: WALL.merlon, merlonW: WALL.merlonW, ground: base });
}

export function protoShapes() {
  const pieces = [];
  for (const s of sets.filter((v) => v.set === 'shapes')) {
    const f = (x, u, w) => [x + u * Math.cos(s.a) - w * Math.sin(s.a), s.z + u * Math.sin(s.a) + w * Math.cos(s.a)];
    // the wall in two runs either side of the gate block, outside to -w
    const X = s.xs;
    pieces.push({ kind: 'wall', a: f(X.wall, -WALL.half, 0), b: f(X.wall, -5 + 0.3, 0), base, out: -1, seed: 3 });
    pieces.push({ kind: 'wall', a: f(X.wall, 5 - 0.3, 0), b: f(X.wall, WALL.half, 0), base, out: -1, seed: 4 });
    pieces.push({ kind: 'gate', at: f(X.wall, 0, 0), angle: s.a, base, out: -1, seed: 5 });
    pieces.push({ kind: 'tower', shape: 'round', at: f(X.tower, 0, 0), size: TOWER.r, base, inward: s.a - Math.PI / 2, walls: [s.a - Math.PI / 2 + Math.PI / 3, s.a - Math.PI / 2 - Math.PI / 3], seed: 6 });
    pieces.push({ kind: 'house', at: f(X.house, 0, 0), angle: s.a + Math.PI, base, w: HOUSE.w, d: HOUSE.d, seed: 7 });
  }
  return { pieces };
}
