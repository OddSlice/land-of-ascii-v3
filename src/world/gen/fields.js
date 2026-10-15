// The fields round a village (phase 3b; src/world/gen/village.js): blocks
// of strips along the contour, their bounds (a fence or a dry-stone wall
// with a gate gap), and the ground they lie on.
import { SCALE } from '../scale.js';
import { hash2 } from '../noise.js';
import { KIND, CG } from './water.js';
import { heightAt } from './sites.js';
import { inPoly } from './fort.js';
import { rect, overlaps, over } from './placing.js';

const K = SCALE.kit, V = SCALE.village;
const TAU = Math.PI * 2;

// Blocks of strips round a village: each a rectangle turned along the lie of
// the land (its length along the contour), cut across into strips of crop,
// stubble and fallow; on gentle open ground, off the ways, the water, the
// stands and every building. Returns the blocks; `bounds` puts a fence or a
// wall along one or two of each block's sides, with a gate gap.
// (phase 4b) `more`: { have, want, tries, size, slopeK } asks for further
// blocks beside those already laid (`have`), for a village with too few to
// graze one: more candidates, smaller, on a little steeper ground.
export function planFields(q, rec, env, more = null) {
  const { H, N, kind, wetDist, F, thr, seed } = env, NN = N + 1;
  const r = (k) => hash2(q * 613 + k, 77, seed + 9301);
  const gAt = (x, z) => heightAt(H, N, x, z);
  const want = more ? more.want : V.fields[0] + Math.floor((V.fields[1] - V.fields[0] + 1) * r(1));
  const blocks = more ? more.have.slice() : [];
  const size = more ? more.size : 1, slope = V.fieldSlope * (more ? more.slopeK : 1), tries = more ? more.tries : 160;
  const C = [rec.centre.x, rec.centre.z];
  // just past the houses (the barns may stand further out)
  const ds = rec.houses.map((h) => Math.hypot(h.x - C[0], h.z - C[1])).sort((a, b) => a - b);
  const houseR = (ds.length ? ds[Math.floor(ds.length * 0.85)] : 30) + 12;
  // candidates: round the village first, then beside a block already laid
  // (fields lie side by side along the contour)
  const cands = [];
  // (asking for more: beside the blocks already laid first)
  if (more) for (const b of more.have) for (const side of [1, -1]) cands.push({ t: 5000 + b.id * 2 + (side > 0 ? 0 : 1), beside: { ...b, side } });
  for (let t = 0; t < tries; t++) cands.push({ t: more ? 1000 + t : t, beside: null });
  for (let ci = 0; ci < cands.length && blocks.length < want; ci++) {
    const { t, beside } = cands[ci];
    const L = (V.fieldL[0] + (V.fieldL[1] - V.fieldL[0]) * hash2(t, 4, seed + q * 41)) * size;
    const W = (V.fieldW[0] + (V.fieldW[1] - V.fieldW[0]) * hash2(t, 5, seed + q * 41)) * size;
    let cx, cz, ang;
    if (beside) {
      ang = beside.a;
      const off = beside.L + L + 5;
      cx = beside.x + beside.ca * off * beside.side; cz = beside.z + beside.sa * off * beside.side;
    } else {
      const a = hash2(t, 3, seed + q * 41) * TAU, ring = houseR + W + 4 + 70 * hash2(t, 2, seed + q * 41) * hash2(t, 8, seed + q * 41);
      cx = C[0] + Math.cos(a) * ring; cz = C[1] + Math.sin(a) * ring;
      // along the contour: across the slope here
      const e = 6, gx = (gAt(cx + e, cz) - gAt(cx - e, cz)) / (2 * e), gz = (gAt(cx, cz + e) - gAt(cx, cz - e)) / (2 * e);
      ang = Math.hypot(gx, gz) > 1e-4 ? Math.atan2(gz, gx) + Math.PI / 2 : a + Math.PI / 2;
    }
    if (cx < 60 || cz < 60 || cx > N - 60 || cz > N - 60) continue;
    const R = rect(cx, cz, ang, L, W);
    let ok = true;
    for (const [px, pz] of over(R, 2, 4)) {
      const i = Math.round(px), k = Math.round(pz);
      if (i < 1 || k < 1 || i >= N || k >= N) { ok = false; break; }
      const j = k * NN + i;
      if (kind[j] !== KIND.NONE || wetDist[j] < 6) { ok = false; break; }
      const f = fieldOf(F, px, pz);
      if (f === f && f > thr - 0.06) { ok = false; break; }
      // gentle ground only
      const sx = (gAt(px + 2, pz) - gAt(px - 2, pz)) / 4, sz = (gAt(px, pz + 2) - gAt(px, pz - 2)) / 4;
      if (Math.hypot(sx, sz) > slope) { ok = false; break; }
      if (env.ways.clear(px, pz, 12) < 3) { ok = false; break; }
      if (env.cleared.some((p) => inPoly(p, px, pz))) { ok = false; break; }
    }
    if (!ok) continue;
    if (env.built.some((B) => overlaps(R, B, 5))) continue;
    if (env.fields.some((B) => overlaps(R, B, 4))) continue;
    // the strips: across the block (along w), each V.strip wide
    const strips = [];
    let w0 = -W;
    let s = 0;
    while (w0 < W - 1) {
      const sw = Math.min(W - w0, V.strip[0] + (V.strip[1] - V.strip[0]) * hash2(t * 31 + s, 6, seed + q * 41));
      const kt = hash2(t * 31 + s, 7, seed + q * 41);
      strips.push({ w0, w1: w0 + sw, kind: kt < 0.45 ? 1 : kt < 0.75 ? 2 : 3 });
      w0 += sw; s++;
    }
    // (a last sliver joins the strip before it)
    if (strips.length > 1 && strips[strips.length - 1].w1 - strips[strips.length - 1].w0 < V.strip[0] * 0.6) { const l = strips.pop(); strips[strips.length - 1].w1 = l.w1; }
    const count = [0, 0, 0, 0];
    for (const st of strips) count[st.kind] += st.w1 - st.w0;
    const main = count.indexOf(Math.max(count[1], count[2], count[3]));
    const blk = { ...R, L, W, strips, main, id: env.fields.length, village: q };
    blocks.push(blk);
    env.fields.push(R);
    // try its neighbours along the contour next
    for (const side of [1, -1]) cands.splice(ci + 1, 0, { t: t * 7 + 1000 + (side > 0 ? 1 : 2), beside: { ...blk, side } });
  }
  return blocks;
}
function fieldOf(F, x, z) {
  const i = Math.round(x / CG), k = Math.round(z / CG), nn = F.nn || Math.round(Math.sqrt(F.ff.length));
  if (i < 0 || k < 0 || i >= nn || k >= nn) return NaN;
  return F.ff[k * nn + i];
}

// The fences and walls round a block: along the one or two sides nearest
// the village, each with a gate gap in its middle (its post points, as the
// pieces want them). Returns { pieces, gates: [[x, z]] }.
// (phase 4b) `all`: fenced on every side (a pasture, so its flock or herd
// stays in), with its one gate still on the side nearest the village.
export function boundField(blk, rec, env, style, all = false) {
  const { H, N, seed } = env;
  const gAt = (x, z) => heightAt(H, N, x, z);
  const pieces = [], gates = [];
  const sides = [];
  // the four sides: [u0, w0] -> [u1, w1], with the outward normal
  const L = blk.L + 1, W = blk.W + 1;
  for (const [a, b] of [[[-L, W], [L, W], [0, 1]], [[L, -W], [-L, -W], [0, -1]], [[L, W], [L, -W], [1, 0]], [[-L, -W], [-L, W], [-1, 0]]]) {
    const mx = (a[0] + b[0]) / 2, mw = (a[1] + b[1]) / 2;
    const X = blk.x + mx * blk.ca - mw * blk.sa, Z = blk.z + mx * blk.sa + mw * blk.ca;
    sides.push({ a, b, d: Math.hypot(X - rec.centre.x, Z - rec.centre.z) });
  }
  sides.sort((p, q) => p.d - q.d);
  const n = all ? 4 : 1 + (hash2(blk.id, 9, seed + 77) < 0.5 ? 1 : 0);
  const step = style === 'fence' ? K.fence.span : K.drystone.piece;
  sides.slice(0, n).forEach((sd, si) => {
    const toW = (u, w) => [blk.x + u * blk.ca - w * blk.sa, blk.z + u * blk.sa + w * blk.ca];
    const len = Math.hypot(sd.b[0] - sd.a[0], sd.b[1] - sd.a[1]);
    const gap = K.fence.gate;
    const run = (t0, t1) => {
      const pts = [];
      const m = Math.max(1, Math.round((t1 - t0) / step));
      for (let i = 0; i <= m; i++) {
        const t = t0 + (t1 - t0) * i / m;
        const u = sd.a[0] + (sd.b[0] - sd.a[0]) * t / len, w = sd.a[1] + (sd.b[1] - sd.a[1]) * t / len;
        const [x, z] = toW(u, w);
        pts.push([x, z, gAt(x, z)]);
      }
      return pts;
    };
    const ang = Math.atan2(sd.b[1] - sd.a[1], sd.b[0] - sd.a[0]) + blk.a;
    // (a pasture's other sides have a gap at the middle too, so two
    // pastures side by side never close each other's gate; only the first
    // is its gate for people)
    const g0 = len / 2 - gap / 2, g1 = len / 2 + gap / 2;
    if (all && si > 0) {
      pieces.push({ kind: style, pts: run(0, g0), angle: ang, seed: 3600 + blk.id * 8 + si * 2 });
      pieces.push({ kind: style, pts: run(g1, len), angle: ang, seed: 3601 + blk.id * 8 + si * 2 });
      return;
    }
    const A = run(0, g0), B = run(g1, len);
    pieces.push({ kind: style, pts: A, angle: ang, seed: 3600 + blk.id * 8 + si * 2 });
    pieces.push({ kind: style, pts: B, angle: ang, seed: 3601 + blk.id * 8 + si * 2 });
    if (style === 'fence') pieces.push({ kind: 'gateposts', pts: [A[A.length - 1], B[0]], angle: ang, seed: 3650 + blk.id });
    // the gate gap, a little outside
    const gu = (sd.a[0] + sd.b[0]) / 2, gw = (sd.a[1] + sd.b[1]) / 2;
    const out = Math.hypot(gu, gw) || 1;
    gates.push(toW(gu + gu / out * 2.5, gw + gw / out * 2.5));
  });
  return { pieces, gates };
}

// The fields into the ground's arrays: wField (how much of a node is
// field, 0..255) and fieldKind (1 crop, 2 stubble, 3 fallow), and the
// blocks' table for the furrows (their angle, their main kind).
export function layFields(N, blocks) {
  const NN = N + 1, wField = new Uint8Array(NN * NN), fieldKind = new Uint8Array(NN * NN), fieldId = new Uint8Array(NN * NN);
  for (const b of blocks) {
    const R = Math.hypot(b.L, b.W) + 2;
    for (let z = Math.max(0, Math.floor(b.z - R)); z <= Math.min(N, Math.ceil(b.z + R)); z++) {
      for (let x = Math.max(0, Math.floor(b.x - R)); x <= Math.min(N, Math.ceil(b.x + R)); x++) {
        const dx = x - b.x, dz = z - b.z, u = dx * b.ca + dz * b.sa, w = -dx * b.sa + dz * b.ca;
        const e = Math.min(b.L - Math.abs(u), b.W - Math.abs(w));
        if (e < -0.6) continue;
        const cov = Math.max(0, Math.min(1, (e + 0.6) / 1.2));
        const j = z * NN + x, v = Math.round(255 * cov);
        if (v <= wField[j]) continue;
        wField[j] = v;
        const st = b.strips.find((s) => w >= s.w0 && w < s.w1) || (w < 0 ? b.strips[0] : b.strips[b.strips.length - 1]);
        fieldKind[j] = st.kind;
        fieldId[j] = b.id + 1;
      }
    }
  }
  // per block: cos, sin of its angle (the furrows run along u), its main kind
  const table = new Float32Array(Math.max(1, blocks.length) * 4);
  blocks.forEach((b) => { table[b.id * 4] = b.ca; table[b.id * 4 + 1] = b.sa; table[b.id * 4 + 2] = b.main; table[b.id * 4 + 3] = (b.strips.length ? 2 * b.W / b.strips.length : 8); });
  return { wField, fieldKind, fieldId, fieldTable: table };
}
