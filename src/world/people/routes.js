// Routes (phase 4a; src/world/people/people.js): one place's line up to
// the network, the way along it, and the other place's line down, sampled
// every half metre by the player's own walking rules. Found once, the first
// time a plan needs them, and kept.
import { sampleRoute, latticeWay, clearLine } from './walk.js';

// The chain of a place up to the network: [place, parent, ..., root].
function chain(P, id) { const out = []; for (let k = id; k >= 0; k = P.places[k].via) out.push(k); return out; }

// The line from a place to its parent (or to the network), found once.
function linkOf(P, id) {
  const pl = P.places[id];
  if (pl.link) return pl.link;
  const { move } = P;
  if (pl.via >= 0) {
    const pa = P.places[pl.via], a = [pl.ax, pl.az], b = [pa.ax, pa.az];
    // (a closed door's line is its doorstep itself)
    if (pl.kind === 'closed') return (pl.link = [b]);
    if (clearLine(move, a, b, pl.ft)) pl.link = [a, b];
    else pl.link = latticeWay(move, a, b, pl.ft, 10, 5000) || (P.bad.push({ place: id, to: pl.via }), [a, b]);
    return pl.link;
  }
  // to the nearest node of the network it can reach
  const net = P.net, near = net.nearby(pl.ax, pl.az, 45);
  for (const k of near.slice(0, 8)) {
    const b = [net.x[k], net.z[k]];
    if (clearLine(move, [pl.ax, pl.az], b, pl.ft)) { pl.node = k; return (pl.link = [[pl.ax, pl.az], b]); }
  }
  for (const k of near.slice(0, 3)) {
    const way = latticeWay(move, [pl.ax, pl.az], [net.x[k], net.z[k]], pl.ft, 10, 5000);
    if (way) { pl.node = k; return (pl.link = way); }
  }
  // (the nearest nodes can lie across a stream or behind a wall: further
  // ones, with a wider search)
  for (const k of net.nearby(pl.ax, pl.az, 90).slice(0, 12)) {
    const way = latticeWay(move, [pl.ax, pl.az], [net.x[k], net.z[k]], pl.ft, 16, 20000);
    if (way) { pl.node = k; return (pl.link = way); }
  }
  P.bad.push({ place: id, to: 'network' });
  pl.node = near[0] !== undefined ? near[0] : 0;
  return (pl.link = [[pl.ax, pl.az], [net.x[pl.node], net.z[pl.node]]]);
}

// The route from place a to place b: { x, z, y, cum, len, n } sampled every
// half metre (the feet's height at each), or null if it cannot be walked.
export function routeOf(P, a, b) {
  const key = a * 65536 + b;
  if (P.routes.has(key)) return P.routes.get(key);
  const ca = chain(P, a), cb = chain(P, b);
  const pts = [];
  // (phase 4b) between two spots of one pasture: straight across, where clear
  const pa0 = P.places[a], pb0 = P.places[b];
  if (pa0.kind === 'pasture' && pb0.kind === 'pasture' && pa0.via === pb0.via && clearLine(P.move, [pa0.ax, pa0.az], [pb0.ax, pb0.az], pa0.ft)) {
    const line = sampleRoute(P.move, [[pa0.ax, pa0.az], [pb0.ax, pb0.az]], pa0.ft);
    if (line) {
      const cum = new Float64Array(line.n);
      for (let i = 1; i < line.n; i++) cum[i] = cum[i - 1] + Math.hypot(line.x[i] - line.x[i - 1], line.z[i] - line.z[i - 1]);
      line.cum = cum; line.len = cum[line.n - 1]; line.hideA = 0.35; line.hideB = 0.35;
      P.routes.set(key, line);
      return line;
    }
  }
  const common = ca.find((k) => cb.includes(k));
  const up = (c, until) => { for (const k of c) { if (k === until) break; const L = linkOf(P, k); for (let i = 0; i < L.length - 1; i++) pts.push(L[i]); } };
  const down = (c, until) => {
    const seg = [];
    for (const k of c) { if (k === until) break; const L = linkOf(P, k); seg.push(L); }
    for (let s = seg.length - 1; s >= 0; s--) { const L = seg[s]; for (let i = L.length - 1; i >= 1; i--) pts.push(L[i]); }
  };
  if (common !== undefined) {
    up(ca, common);
    pts.push([P.places[common].ax, P.places[common].az]);
    down(cb, common);
  } else {
    up(ca, -1);
    const ra = P.places[ca[ca.length - 1]], rb = P.places[cb[cb.length - 1]];
    linkOf(P, ra.id); linkOf(P, rb.id);
    const way = P.net.path(ra.node, rb.node);
    if (way) for (const k of way) pts.push([P.net.x[k], P.net.z[k]]);
    down(cb, -1);
  }
  pts.push([P.places[b].ax, P.places[b].az]);
  // drop repeats
  const clean = [pts[0]];
  for (let i = 1; i < pts.length; i++) { const q = clean[clean.length - 1]; if (Math.hypot(pts[i][0] - q[0], pts[i][1] - q[1]) > 0.05) clean.push(pts[i]); }
  P.lastPts = clean;
  let line = clean.length > 1 ? sampleRoute(P.move, clean, P.places[a].ft) : { x: Float64Array.of(clean[0][0]), z: Float64Array.of(clean[0][1]), y: Float64Array.of(P.places[a].ft), n: 1 };
  // through a closed door: the last (or first) steps go in through it,
  // straight, at its sill (no player could; the person is gone inside)
  if (line) {
    const pa = P.places[a], pb = P.places[b];
    const thr = (pl) => { const xs = [], zs = []; for (let k = 1; k <= 3; k++) { const f = k / 3; xs.push(pl.ax + (pl.x - pl.ax) * f); zs.push(pl.az + (pl.z - pl.az) * f); } return { xs, zs }; };
    if (pb.kind === 'closed') { const { xs, zs } = thr(pb); line = { x: Float64Array.from([...line.x, ...xs]), z: Float64Array.from([...line.z, ...zs]), y: Float64Array.from([...line.y, pb.floor, pb.floor, pb.floor]), n: line.n + 3 }; }
    if (pa.kind === 'closed') { const { xs, zs } = thr(pa); line = { x: Float64Array.from([...xs.reverse(), ...line.x]), z: Float64Array.from([...zs.reverse(), ...line.z]), y: Float64Array.from([pa.floor, pa.floor, pa.floor, ...line.y]), n: line.n + 3 }; }
  }
  if (line && line.n < 2) line = { x: Float64Array.of(line.x[0], line.x[0]), z: Float64Array.of(line.z[0], line.z[0]), y: Float64Array.of(line.y[0], line.y[0]), n: 2 };
  if (line) {
    const cum = new Float64Array(line.n);
    for (let i = 1; i < line.n; i++) cum[i] = cum[i - 1] + Math.hypot(line.x[i] - line.x[i - 1], line.z[i] - line.z[i - 1]);
    line.cum = cum; line.len = cum[line.n - 1];
    // through a closed door: hidden until the body is clear of the house
    // (at least the last 35 cm; more where the wall is thick or the door deep)
    const clearAt = (k) => !P.p.blocked(line.x[k], line.z[k], line.y[k]);
    line.hideA = 0.35; line.hideB = 0.35;
    if (P.places[a].kind === 'closed') { let k = 0; while (k < line.n - 1 && (k < 3 || !clearAt(k) || !clearAt(k + 1))) k++; line.hideA = Math.max(0.35, cum[Math.min(k + 1, line.n - 1)]); }
    if (P.places[b].kind === 'closed') { let k = line.n - 1; while (k > 0 && (k > line.n - 4 || !clearAt(k) || !clearAt(k - 1))) k--; line.hideB = Math.max(0.35, line.len - cum[Math.max(k - 1, 0)]); }
  } else P.bad.push({ route: [a, b] });
  P.routes.set(key, line);
  return line;
}
