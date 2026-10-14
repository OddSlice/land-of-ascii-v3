// The player's progress (phase 5a), the only state the game keeps: which
// places are found, which parts of the land have been seen and walked, who
// has been met and when last seen, the sketches, the favours taken and
// done, the standing and the lantern. One record per world (seed), in the
// browser's local storage, written on every change (gathered up and
// written at most every few seconds, and when the page is left) and read on
// load. Storage can be missing or throw (a private window, blocked site
// data, a full store): the game then keeps progress for the session only,
// and says so once (`note`).
//
// What is written is small: the seen and walked grids as runs of bits, the
// rest as short lists. Each sketch is its own entry, written once.
// The backup text holds everything, sketches too, deflated, as plain
// letters a person can copy and paste back.
export const VERSION = 1;
export const PREFIX = 'land-of-ascii-v3.';
const SEEN_TILE = 16, WALK_TILE = 8;

export const gridSize = (N, tile) => Math.ceil(N / tile) + 1;

export function freshProgress(seed, N) {
  const sn = gridSize(N, SEEN_TILE), wn = gridSize(N, WALK_TILE);
  return {
    v: VERSION, seed,
    seen: new Uint8Array(Math.ceil(sn * sn / 8)), sn,
    walked: new Uint8Array(Math.ceil(wn * wn / 8)), wn,
    found: {},          // place id -> [day, hour]
    met: {},            // person id -> [day, hour] last seen (after the first greeting)
    favours: {},        // favour id -> { s: state, t: [day, hour] }
    lantern: false,     // given
    lit: false,         // carried and lit
    sketches: [],       // { id, day, hour, place, weather, cols, rows, notable }
    nextSketch: 1,
    first: false,       // the first favour has been offered
    at: null,           // (phase 6) where you last stood: [x, z, yaw (radians)], for Continue
  };
}

// Favour states.
export const F = { NEW: 0, ASKED: 1, TAKEN: 2, GOT: 3, DONE: 4 };

export const bit = (a, i) => (a[i >> 3] >> (i & 7)) & 1;
export const setBit = (a, i) => { const m = 1 << (i & 7); if (a[i >> 3] & m) return false; a[i >> 3] |= m; return true; };
export const countBits = (a) => { let n = 0; for (let i = 0; i < a.length; i++) { let x = a[i]; while (x) { x &= x - 1; n++; } } return n; };

// ---- encoding ---------------------------------------------------------------------

// A bitset as runs (alternating zeros and ones, starting with zeros), each a
// variable-length number, in base 64.
let packBuf = new Uint8Array(1 << 12);
export function packBits(a, n) {
  let len = 0;
  const put = (x) => {
    if (len + 5 > packBuf.length) { const b = new Uint8Array(packBuf.length * 2); b.set(packBuf); packBuf = b; }
    while (x >= 128) { packBuf[len++] = (x & 127) | 128; x >>>= 7; }
    packBuf[len++] = x;
  };
  let cur = 0, run = 0;
  for (let i = 0; i < n;) {
    // (whole bytes of the same bit at once)
    if ((i & 7) === 0 && i + 8 <= n) {
      const by = a[i >> 3];
      if (by === (cur ? 255 : 0)) { run += 8; i += 8; continue; }
    }
    const b = (a[i >> 3] >> (i & 7)) & 1;
    if (b === cur) run++;
    else { put(run); cur = b; run = 1; }
    i++;
  }
  put(run);
  return toB64(packBuf.subarray(0, len));
}
export function unpackBits(s, n) {
  const bytes = fromB64(s), a = new Uint8Array(Math.ceil(n / 8));
  let i = 0, k = 0, cur = 0;
  while (k < bytes.length && i < n) {
    let x = 0, sh = 0, b;
    do { b = bytes[k++]; x |= (b & 127) << sh; sh += 7; } while (b & 128 && k < bytes.length);
    if (cur) for (let j = 0; j < x && i + j < n; j++) setBit(a, i + j);
    i += x; cur ^= 1;
  }
  return a;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 3) {
    const a = u8[i], b = u8[i + 1], c = u8[i + 2];
    s += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)] + (b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]) + (c === undefined ? '=' : B64[c & 63]);
  }
  return s;
}
export function fromB64(s) {
  s = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor(s.length * 3 / 4));
  let k = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = B64.indexOf(s[i]), b = B64.indexOf(s[i + 1]), c = i + 2 < s.length ? B64.indexOf(s[i + 2]) : -1, d = i + 3 < s.length ? B64.indexOf(s[i + 3]) : -1;
    out[k++] = (a << 2) | (b >> 4);
    if (c >= 0) out[k++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[k++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, k);
}

// The record as plain JSON (the grids packed).
// (`packed`: the seen and walked squares already packed, when a save is
// spread over frames)
export function toJSON(p, packed = null) {
  return JSON.stringify({
    v: p.v, seed: p.seed, sn: p.sn, wn: p.wn,
    seen: packed ? packed.seen : packBits(p.seen, p.sn * p.sn), walked: packed ? packed.walked : packBits(p.walked, p.wn * p.wn),
    found: p.found, met: p.met, favours: p.favours, lantern: p.lantern, lit: p.lit,
    sketches: p.sketches, nextSketch: p.nextSketch, first: p.first,
    ...(p.at ? { at: p.at } : {}),
  });
}
// Back from JSON, checked; null if it is not a record of this kind.
export function fromJSON(text, seed, N) {
  let o;
  try { o = JSON.parse(text); } catch { return null; }
  if (!o || typeof o !== 'object' || o.v !== VERSION || (seed !== undefined && o.seed !== seed)) return null;
  const p = freshProgress(o.seed, N);
  if (o.sn !== p.sn || o.wn !== p.wn) return null;
  try { p.seen = unpackBits(String(o.seen || ''), p.sn * p.sn); p.walked = unpackBits(String(o.walked || ''), p.wn * p.wn); } catch { return null; }
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  p.found = obj(o.found); p.met = obj(o.met); p.favours = obj(o.favours);
  p.lantern = !!o.lantern; p.lit = !!o.lit && p.lantern; p.first = !!o.first;
  p.sketches = Array.isArray(o.sketches) ? o.sketches.filter((s) => s && Number.isInteger(s.id)) : [];
  p.nextSketch = Number.isInteger(o.nextSketch) ? o.nextSketch : 1 + Math.max(0, ...p.sketches.map((s) => s.id));
  // (phase 6; older records have none)
  if (Array.isArray(o.at) && o.at.length === 3 && o.at.every(Number.isFinite) && o.at[0] >= 0 && o.at[1] >= 0 && o.at[0] <= N && o.at[1] <= N) p.at = o.at.slice();
  return p;
}

// ---- sketches as text for storage ---------------------------------------------------

// A sketch's cells (8 bytes each, the last unused) as 7 bytes a cell,
// deflated, in base 64.
export async function packSketch(cells) {
  const n = cells.length / 8, raw = new Uint8Array(n * 7);
  for (let i = 0; i < n; i++) raw.set(cells.subarray(i * 8, i * 8 + 7), i * 7);
  return toB64(await deflate(raw));
}
export async function unpackSketch(s) {
  const raw = await inflate(fromB64(s)), n = raw.length / 7, cells = new Uint8Array(n * 8);
  for (let i = 0; i < n; i++) cells.set(raw.subarray(i * 7, i * 7 + 7), i * 8);
  return cells;
}

async function pipe(u8, stream) {
  const s = new Blob([u8]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(s).arrayBuffer());
}
export const deflate = (u8) => pipe(u8, new CompressionStream('deflate'));
export const inflate = (u8) => pipe(u8, new DecompressionStream('deflate'));

// ---- the backup text ------------------------------------------------------------------

const HEAD = 'Land of Ascii: wayfaring progress';
// Everything saved for a world, sketches too, as text to copy.
export async function backupText(p, sketchData) {
  const body = JSON.stringify({ progress: JSON.parse(toJSON(p)), sketches: sketchData });
  const b = toB64(await deflate(new TextEncoder().encode(body)));
  const lines = [];
  for (let i = 0; i < b.length; i += 76) lines.push(b.slice(i, i + 76));
  return `${HEAD}, seed ${p.seed}\n${lines.join('\n')}\nend\n`;
}
// Back from pasted text: { progress, sketches } or a reason it is not.
export async function readBackup(text, N) {
  const t = String(text || '');
  const m = t.match(/wayfaring progress, seed (\d+)/);
  if (!m) return { error: 'that is not a backup from this game' };
  const body = t.slice(t.indexOf('\n', m.index) + 1).replace(/\nend[\s\S]*$/, '');
  let o;
  try { o = JSON.parse(new TextDecoder().decode(await inflate(fromB64(body)))); } catch { return { error: 'the backup is damaged or cut short' }; }
  const p = o && o.progress ? fromJSON(JSON.stringify(o.progress), Number(m[1]), N) : null;
  if (!p) return { error: 'the backup is damaged or from another version' };
  const sk = o.sketches && typeof o.sketches === 'object' ? o.sketches : {};
  return { progress: p, sketches: sk };
}

// ---- local storage -----------------------------------------------------------------

// The store for one world. `off`: nothing is read or written (the tools,
// which run with progress cleared); `mem`: the session's own copy when the
// browser keeps nothing.
export class Store {
  constructor(seed, { off = false } = {}) {
    this.seed = seed;
    this.off = off;
    this.mem = new Map();
    this.ok = !off && Store.works();
    this.note = this.ok || off ? '' : 'This browser is not keeping anything for this page, so what you do here lasts until you leave.';
    this.failed = false;
  }
  static works() {
    try { const k = `${PREFIX}probe`; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch { return false; }
  }
  key(name) { return `${PREFIX}${name}.${this.seed}`; }
  get(name) {
    if (this.off) return null;
    if (!this.ok) return this.mem.get(name) ?? null;
    try { return localStorage.getItem(this.key(name)); } catch { return this.mem.get(name) ?? null; }
  }
  set(name, value) {
    if (this.off) return true;
    this.mem.set(name, value);
    if (!this.ok) return false;
    try { localStorage.setItem(this.key(name), value); return true; } catch {
      // (full, or taken away since): keep it for the session, and say so once
      if (!this.failed) { this.failed = true; this.note = 'The browser would not keep the last change (its storage is full or blocked), so it lasts until you leave.'; }
      return false;
    }
  }
  remove(name) {
    this.mem.delete(name);
    if (!this.ok || this.off) return;
    try { localStorage.removeItem(this.key(name)); } catch { /* nothing kept anyway */ }
  }
  // Everything this world keeps (progress and sketches), removed.
  clear(sketchIds) {
    this.remove('progress');
    for (const id of sketchIds) this.remove(`sketch.${id}`);
  }
}
