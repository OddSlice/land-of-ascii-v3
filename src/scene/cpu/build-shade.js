// The building kit's surfaces (phase 3a; the shapes themselves are met in
// build.js): what a cell sees on a shape once its ray has met it, its
// material and light, the masonry's joints, timber framing, shingle courses
// and paving faded by the cell's footprint before they can blink, a
// window's light, and (phase 4b) the wild detail's tone.
import { MAT, MAT_SHELTER, MAT_FAINT, HIT_STRIDE, REC } from '../../contract.js';
import { vnoise } from '../../world/noise.js';
import { LOOK } from '../../look.js';
import { reedTuft } from './wild.js';
import { LOST } from '../../world/things.js';
import { PT, TX, P, H, P_STRIDE, zoneAt, roomBit, shelterOf } from '../../world/kit.js';

// The share of a footprint f wide, centred at u, that falls on joints w wide
// centred on every multiple of P: the joint pattern box-filtered over the cell.
function jointCover(u, P, w, f) {
  const hw = w / 2, e = P - hw;
  const I = (x) => { const n = Math.floor(x / P), r = x - n * P; return n * w + (r < hw ? r : hw) + (r > e ? r - e : 0); };
  return (I(u + f / 2) - I(u - f / 2)) / f;
}
const SOFT = LOOK.materials.stone.tone / LOOK.materials.masonry.tone;
const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// The methods the object pass takes on (installBuildings, build.js).
export const shading = {
  // (phase 4b) The wild detail's tone: each kind of detail drawn only while
  // it is several cells across (art bible, never-do 28), else its average.
  wildTone(tex, S, q, x, y, z, fp, tu, graze = 1) {
    const WT = LOOK.wild, seed = S[q + P.SEED], own = ((Math.imul(seed | 0, 2654435761) >>> 0) / 4294967296 - 0.5);
    if (tex === TX.BOULDER) {
      // the stone's own shade, patches of lichen, a fine grain
      const lich = vnoise((x + y * 0.7) / WT.boulder.lichen[0], (z - y * 0.5) / WT.boulder.lichen[0], 4211 + (seed & 255)) * 2 - 1;
      const grain = vnoise(x / 0.09 + y * 3.1, z / 0.09 - y * 2.3, 4212) * 2 - 1;
      return WT.boulder.own * own + WT.boulder.lichen[1] * lich * (1 - smooth(WT.boulder.lichen[0] * 0.25, WT.boulder.lichen[0] * 0.7, fp)) + 0.12 * grain * (1 - smooth(0.03, 0.08, fp));
    }
    if (tex === TX.STRATA) {
      // bedding planes: darker bands along the height, drawn while a band is
      // a few rows tall
      const B = WT.outcrop.band, cov = jointCover(y + own * B, B, B * 0.3, Math.max(1e-4, fp));
      return WT.boulder.own * own - 0.55 * (cov - 0.3) * (1 - smooth(B * 0.18, B * 0.45, fp)) + 0.1 * (vnoise(x / 0.4, z / 0.4, 4213) * 2 - 1) * (1 - smooth(0.1, 0.3, fp));
    }
    if (tex === TX.BARK) {
      // grooves along the trunk and patches of moss, near only
      const g = jointCover(tu, WT.bark.groove, WT.bark.groove * 0.35, Math.max(1e-4, fp));
      const moss = vnoise(x / 0.7 + own * 13, z / 0.7, 4214) * 2 - 1;
      return 0.2 * own - 0.5 * (g - 0.35) * (1 - smooth(WT.bark.groove * 0.2, WT.bark.groove * 0.5, fp)) + 0.25 * moss * (1 - smooth(0.2, 0.6, fp));
    }
    if (tex === TX.RINGS) {
      // a cut end: rings round the heart, the heart darker
      let r;
      if (S[q + P.TYPE] === PT.LOG) {
        const ox = x - S[q + P.CX], oz = z - S[q + P.CZ], w = -ox * S[q + P.SA] + oz * S[q + P.CA];
        r = Math.hypot(w, y - S[q + P.BASE]) / S[q + P.HZ];
      } else r = Math.hypot(x - S[q + P.CX], z - S[q + P.CZ]) / S[q + P.HX];
      const ring = Math.cos(r * S[q + P.HZ] / WT.rings * Math.PI * 2);
      return 0.3 * ring * (1 - smooth(WT.rings * 0.25, WT.rings * 0.6, fp)) - 0.35 * (1 - Math.min(1, r)) * (1 - smooth(0.05, 0.2, fp)) + 0.15;
    }
    // reeds: paler at their tips and darker toward the water, and clumps of
    // stems each with a tone of its own (no dark gaps between them, which a
    // walk would sweep across the cells faster than they are wide, as the
    // boards' were), shown while a clump is five columns across, counting
    // how much a glancing view stretches it
    const R = WT.reed, h = Math.max(0.1, S[q + P.Y1] - S[q + P.Y0]), up = Math.min(1, Math.max(0, (y - S[q + P.Y0]) / h));
    const clump = Math.floor(tu / R.stem), t2 = ((Math.imul(clump * 73856093 ^ (seed | 0), 0x9e3779b1) >>> 0) / 4294967296) * 2 - 1;
    const fpu = Math.max(1e-4, fp) / Math.max(0.15, graze);
    // (phase 5b) the tufts: each one tone, taller tufts paler (the same
    // tufts as the bed's ragged top, src/scene/cpu/wild.js), drawn while a
    // tuft is a few columns across; one tone to a tuft, so a moving eye
    // carries each cell across a tuft's edge once
    const tf = 0.5 - reedTuft(tu + Math.PI * S[q + P.HX], S[q + P.HX], seed);
    return R.tip * (up - 0.5) + 0.22 * t2 * smooth(4, 6, R.stem / fpu) + R.tuft * tf * smooth(2.5, 4.5, R.wave / fpu) * (1 - smooth(R.mid[0], R.mid[1], R.wave / fpu)) + 0.15 * own;
  },

  // Shade a building's hit into cell ci (slot 0 direct, 1 mirrored).
  primShade(ci, dx, dz, s, ey, slot, after) {
    const { v, m, light, hit } = this;
    const K = this.kit, S = K.prims, q = hit.prim;
    const D = hit.D, x = v.ex + dx * D, y = ey + s * D, z = v.ez + dz * D;
    const len = Math.sqrt(1 + s * s);
    const leg = (D - after) * len;
    if (hit.mat === MAT.WINDOW) {
      // (phase 4a: with people, a house's windows are lit while someone
      // inside is awake; without, as they were)
      const lg = S[q + P.LIT], lit = this.litG;
      const power = lg && lit ? ((lit[lg >> 1] & 1) && (lg & 1) ? 1 : 0) : S[q + P.POWER] || 1;
      m.write(ci, slot, MAT.WINDOW, power, 0, 0, 0, hit.cover * 2 - 1, leg);
      return;
    }
    const nx = hit.nx, ny = hit.ny, nz = hit.nz;
    // the footprint of the cell on the surface, for fading detail
    const graze = Math.abs(dx * nx + s * ny + dz * nz) / len;
    const fp = D * len * v.colAngle / Math.max(0.05, graze);
    let mat = hit.mat, tone = 0;
    const tex = hit.kind === 0 ? S[q + P.TEX] : S[q + P.TEX2];
    // along a vertical face: the horizontal coordinate (a round shape's arc)
    let tu = 0;
    if (hit.kind === 0) {
      const ty = S[q + P.TYPE];
      if (ty === PT.CYL || ty === PT.REED) {
        const ca = S[q + P.CA], sa = S[q + P.SA], ox = x - S[q + P.CX], oz = z - S[q + P.CZ];
        tu = Math.atan2(-ox * sa + oz * ca, ox * ca + oz * sa) * S[q + P.HX];
      } else if (ty === PT.LOG) {
        // (phase 4b) round a log's axis
        const ox = x - S[q + P.CX], oz = z - S[q + P.CZ], w = -ox * S[q + P.SA] + oz * S[q + P.CA];
        tu = Math.atan2(y - S[q + P.BASE], w) * S[q + P.HZ];
      } else tu = x * -nz + z * nx;
    }
    const seed = S[q + P.SEED];
    const ashlar = tex === TX.ASHLAR;
    if ((tex === TX.MASONRY || ashlar) && hit.kind === 0) {
      // courses 0.55 m high, blocks 1.1 m long, offset every course (after
      // phase 3a). The courses' joints are drawn dark, at least about a row
      // wide, darkening each cell by how much of it they cover, so they
      // slide across the cells as you move instead of blinking; they stay
      // while a course is at least two and a half rows tall, fading out by
      // one and a half (a row is twice a column), and further off the wall
      // keeps their average darkness. The joints between blocks, which
      // walking sweeps sideways across the cells, are drawn only near (they
      // fade before they get thinner than two cells), and the blocks are
      // one tone: further out, either blinked more than the lab's wall.
      // (ashlar, phase 3b: a wall seen along its length spans a cell's
      // width of heights too, the ray's slope times the cell's footprint
      // along the wall; its joints are blurred by that, which kept them
      // blinking as you walk along a wall, a bridge's parapet say)
      const fy = D * len * len * v.rowAngle + (ashlar ? Math.abs(s) * fp : 0);
      // (ashlar's courses as tall as its big blocks, 1.1 m, drawn no
      // further off than the fine courses: further, at mid distance, their
      // lines blinked as you turned)
      const CH = ashlar ? 1.1 : 0.55;
      const by = y - S[q + P.BASE], row = Math.floor(by / 0.55);
      const kv = smooth(1.5, 2.5, 0.55 / fy);
      const jy = kv > 0 ? kv * jointCover(by, CH, Math.min(0.21, Math.max(0.05, 0.9 * fy)), fy) : 0;
      const cu = (tu + (row & 1) * 0.55) / 1.1, fu = cu - Math.floor(cu);
      // (ashlar, the villages' and bridges' stone: walking sweeps a block's
      // head joints sideways across the cells faster than a fine joint is
      // wide, so they blinked however they were drawn. Phase 4a: big blocks
      // instead, 2.2 m long and two courses high, their heads at least 0.14 m
      // wide and drawn by how much of the cell they cover, near only, and the
      // blocks differing in tone; the village flicker stays at or under the
      // fort courtyard's)
      let head, block;
      if (ashlar) {
        const row2 = Math.floor(by / 1.1), cu2 = (tu + (row2 & 1) * 1.1) / 2.2;
        head = jointCover(tu + (row2 & 1) * 1.1, 2.2, Math.max(0.14, 1.2 * fp), fp) * (1 - smooth(0.018, 0.04, fp));
        block = 0.26 * (((Math.imul(row2 * 73856093 ^ Math.floor(cu2) * 19349663 ^ seed, 0x9e3779b1) >>> 0) / 4294967296) * 2 - 1) * (1 - smooth(0.06, 0.16, fp));
      } else {
        // (phase 5b) the fort's head joints by how much of the cell they
        // cover (3b's coverage, as the ashlar's), held at least `held`
        // cells wide and darkened by their true share of that, so they last
        // to about 25 m instead of going by 15 m, and cannot blink between
        // columns as they narrow
        // (near, the joints as before: crisp, a joint at least a cell wide;
        // only past there, where they used to fade, by their coverage)
        const J = LOOK.masonry, wT = J.head, wH = Math.max(wT, J.held * fp);
        // (where they start and fade by distance: the footprint square on)
        const fpd = D * len * v.colAngle;
        const crisp = Math.min(fu, 1 - fu) * 1.1 < 0.05 + fp * 0.8 ? 1 - smooth(0.035, 0.09, fp) : 0, far = smooth(J.from[0], J.from[1], fpd);
        // (only on a wall seen fairly square on: along a wall, as on the
        // wall walk, a joint sweeps across the cells faster than it is wide)
        // (a cell across two courses takes each course's joints, offset
        // from the other's, by how much of it lies in that course)
        let cov = 0;
        if (far > 0) {
          const ya = by - fy / 2, yb = by + fy / 2, r0 = Math.floor(ya / 0.55), r1 = Math.floor(yb / 0.55);
          const hc = (r) => jointCover(tu + (r & 1) * 0.55, 1.1, wH, Math.max(1e-4, fp));
          const w1 = r1 === r0 ? 0 : Math.min(1, (yb - r1 * 0.55) / Math.max(1e-4, fy));
          cov = J.dark * ((1 - w1) * hc(r0) + w1 * hc(r1)) * Math.sqrt(wT / wH) * (1 - smooth(J.fade[0], J.fade[1], fpd)) * smooth(J.square[0], J.square[1], graze);
        }
        head = Math.max(crisp, cov * far);
        block = 0;
      }
      tone = -jy - (1 - jy) * 0.85 * head - 0.3 * (1 - kv) + (1 - jy) * block;
    } else if (tex === TX.PAVING || (ashlar && hit.kind !== 0)) {
      // (phase 3b) paving as FLAGS without the joints, which walking sweeps
      // across the rows faster than they are wide: only the slabs' tones,
      // and the joints' average darkness
      const ix = Math.floor(x / 0.9), iz = Math.floor((z + (ix & 1) * 0.45) / 0.9);
      const slabT = ((Math.imul(ix * 73856093 ^ iz * 19349663, 0x9e3779b1) >>> 0) / 4294967296) * 2 - 1;
      tone = -0.1 + 0.3 * slabT * (1 - smooth(0.06, 0.25, fp)) * smooth(4, 6, 0.9 / Math.max(1e-4, fp));
    } else if (tex === TX.FLAGS || (tex === TX.MASONRY && hit.kind !== 0)) {
      // paving: slabs about 0.9 m square, fixed to the world
      const fx = x / 0.9, fz = z / 0.9 + (Math.floor(x / 0.9) & 1) * 0.5;
      const ix = Math.floor(fx), iz = Math.floor(fz);
      const jx = Math.min(fx - ix, 1 - (fx - ix)) * 0.9, jz = Math.min(fz - iz, 1 - (fz - iz)) * 0.9;
      const joint = (jx < 0.04 + fp * 0.8 || jz < 0.04 + fp * 0.8) ? 1 : 0;
      const slabT = ((Math.imul(ix * 73856093 ^ iz * 19349663, 0x9e3779b1) >>> 0) / 4294967296) * 2 - 1;
      tone = -0.7 * joint * (1 - smooth(0.035, 0.09, fp)) + 0.3 * slabT * (1 - smooth(0.06, 0.25, fp));
    } else if ((tex === TX.FRAME || tex === TX.TIMBERED) && hit.kind === 0) {
      // a timber frame over plaster: posts every 1.6 m, a sill, a rail and a
      // head; drawn while a beam is at least about two cells wide, else the
      // wall only darkens by the share the beams cover
      const by = y - S[q + P.BASE], H = S[q + P.Y1] - S[q + P.BASE];
      const bw = 0.2;
      const pu = tu / 1.6 - Math.floor(tu / 1.6), onPost = Math.min(pu, 1 - pu) * 1.6 < bw / 2;
      const onRail = by < bw || Math.abs(by - 1.1) < bw / 2 || by > H - bw;
      // (posts drawn while at least two columns wide, rails while at least
      // two rows tall: a row is twice a column)
      // (timbered, the villages': posts drawn while four columns wide, as
      // turning sweeps them two a frame; the beams' grain only up and down;
      // the plaster's mottle while a patch is four columns wide)
      const tb = tex === TX.TIMBERED;
      const kp1 = tb ? smooth(bw / 3, bw / 4.5, fp) : smooth(bw / 1.6, bw / 2.4, fp), kr = smooth(bw / 3.2, bw / 4.8, fp);
      if ((onPost && kp1 > 0.5) || (onRail && kr > 0.5)) { mat = MAT.TIMBER; tone = 0.2 * Math.sin(by * 9 + (tb ? 0 : tu * 2)); }
      else tone = -0.35 * (1 - kp1) * 0.3 + 0.12 * ((Math.imul(Math.floor(tu * 2) * 73856093 ^ Math.floor(by * 2) * 19349663, 0x9e3779b1) >>> 0) / 4294967296 - 0.5) * (1 - (tb ? smooth(0.06, 0.12, fp) : smooth(0.2, 0.6, fp)));
    } else if (tex === TX.TILES && hit.kind === 1) {
      // (phase 3b) the villages' shingles: as SHINGLE, the courses' edges by
      // how much of the cell they cover, the tiles' tones while a tile is
      // five columns wide (turning sweeps them two a frame)
      const ca = S[q + P.CA], sa = S[q + P.SA], ox = x - S[q + P.CX], oz = z - S[q + P.CZ];
      const u = ox * ca + oz * sa, w = Math.abs(-ox * sa + oz * ca), row = Math.floor(w / 0.3);
      const col = Math.floor((u + (row & 1) * 0.22) / 0.45), f = Math.max(1e-4, fp);
      const tile = ((Math.imul(row * 73856093 ^ col * 19349663 ^ seed, 0x9e3779b1) >>> 0) / 4294967296) * 2 - 1;
      tone = -0.6 * jointCover(w - 0.027, 0.3, 0.054, f) * (1 - smooth(0.04, 0.1, fp)) + 0.35 * tile * smooth(4, 6, 0.45 / f);
    } else if (tex === TX.SHINGLE && hit.kind === 1) {
      // shingle courses 0.3 m apart down the slope, staggered tiles 0.45 m
      // wide; they fade with the footprint
      const ca = S[q + P.CA], sa = S[q + P.SA], ox = x - S[q + P.CX], oz = z - S[q + P.CZ];
      const u = ox * ca + oz * sa, w = Math.abs(-ox * sa + oz * ca);
      const cw = w / 0.3, row = Math.floor(cw), fr = cw - row;
      const cu = (u + (row & 1) * 0.22) / 0.45, col = Math.floor(cu);
      const edge = fr < 0.18 ? 1 : 0;
      const tile = ((Math.imul(row * 73856093 ^ col * 19349663 ^ seed, 0x9e3779b1) >>> 0) / 4294967296) * 2 - 1;
      tone = (-0.6 * edge) * (1 - smooth(0.04, 0.1, fp)) + 0.35 * tile * (1 - smooth(0.08, 0.3, fp));
    } else if (tex === TX.THATCH && hit.kind === 1) {
      // (phase 3b) thatch: coarse courses 0.4 m apart down the slope and a
      // streaky grain along it, both fading with the footprint
      const ca = S[q + P.CA], sa = S[q + P.SA], ox = x - S[q + P.CX], oz = z - S[q + P.CZ];
      const u = ox * ca + oz * sa, w = Math.abs(-ox * sa + oz * ca);
      const cw = w / 0.4, row = Math.floor(cw), fr = cw - row;
      const streak = ((Math.imul(Math.floor(u / 0.18) * 73856093 ^ row * 19349663 ^ seed, 0x9e3779b1) >>> 0) / 4294967296) * 2 - 1;
      // (the courses' edges by how much of the cell they cover; the streaks,
      // 0.18 m wide, while four columns wide)
      void fr;
      tone = -0.45 * jointCover(w - 0.044, 0.4, 0.088, Math.max(1e-4, fp)) * (1 - smooth(0.05, 0.13, fp)) + 0.3 * streak * smooth(4, 6, 0.18 / Math.max(1e-4, fp)) + 0.15 * Math.sin(u * 0.9 + seed) * (1 - smooth(0.3, 0.8, fp));
    } else if (tex === TX.RUBBLE && hit.kind === 0) {
      // (phase 3b) a dry-stone wall: uneven stones in rough courses. The
      // courses' joints are drawn by how much of the cell they cover, while a
      // course is at least two and a half rows tall (as the masonry's); the
      // joints between stones are left out, as the ashlar's heads are, since
      // walking sweeps them across the cells faster than they are wide; the
      // stones' tones fade a little later
      const by = y - S[q + P.BASE], row = Math.floor(by / 0.28), Lc = 0.42 + 0.12 * ((row * 7) % 3);
      const col = Math.floor((tu + row * 0.37) / Lc), fy = D * len * len * v.rowAngle + Math.abs(s) * fp;
      const joint = smooth(1.5, 2.5, 0.28 / fy) * jointCover(by, 0.28, Math.min(0.1, Math.max(0.05, 0.9 * fy)), fy);
      const stone = ((Math.imul(row * 73856093 ^ col * 19349663 ^ seed * 83492791, 0x9e3779b1) >>> 0) / 4294967296) * 2 - 1;
      tone = -0.8 * joint * (1 - smooth(0.03, 0.08, fp)) + 0.35 * stone * (1 - smooth(0.05, 0.16, fp)) * smooth(4, 6, Lc / Math.max(1e-4, fp));
    } else if (tex === TX.BOARDS) {
      // boards 0.22 m wide along u
      const ca = S[q + P.CA], sa = S[q + P.SA], ox = x - S[q + P.CX], oz = z - S[q + P.CZ];
      const w = hit.kind === 0 ? tu : -ox * sa + oz * ca;
      const row = Math.floor(w / 0.22);
      // (phase 3b: no gaps, which walking sweeps across the cells faster
      // than they are wide, so they blinked; the boards read by their own
      // tones while a board is five columns wide, which turning, two columns
      // a frame, cannot blink, and the gaps' average darkness)
      const plank = ((Math.imul(row * 73856093 ^ seed, 0x9e3779b1) >>> 0) / 4294967296) * 2 - 1;
      tone = -0.12 + 0.3 * plank * smooth(4, 6, 0.22 / Math.max(1e-4, fp));
    } else if (tex >= TX.BOULDER) {
      tone = this.wildTone(tex, S, q, x, y, z, fp, tu, Math.abs(dx * nx + dz * nz));
    } else if (K === this.figKit) {
      // (phase 4a) a person's clothes and skin: even, one tone to a part (a
      // grain fixed to the world would cut across a body narrower than its
      // squares, and its edges blink as one walks past)
      tone = 0;
    } else {
      // plain: a faint grain fixed to the world
      tone = 0.15 * (((Math.imul(Math.floor(x * 1.7) * 73856093 ^ Math.floor(y * 1.7) * 19349663 ^ Math.floor(z * 1.7) * 83492791, 0x9e3779b1) >>> 0) / 4294967296) * 2 - 1) * (1 - smooth(0.15, 0.5, fp));
    }
    // (the fort's dressed stone darkens more with tone than other stone, for
    // its joints: its paving and plain faces keep the stone's own strength)
    if (mat === MAT.MASONRY && !((tex === TX.MASONRY || ashlar) && hit.kind === 0)) tone *= SOFT;
    // a reveal (an opening's side, a merlon's side) seen nearly edge on is a
    // sliver: under about two and a half cells wide it takes the light of the
    // face it is cut into, so it cannot blink as it narrows and widens
    let lx = nx, ly = ny, lz = nz;
    if (hit.rev && (hit.rev !== 1 || K.holes[hit.revO + H.DEPTH] > 0)) {
      let mx, mz, L;
      if (hit.rev === 1) { const Hs = K.holes, o = hit.revO; mx = -Hs[o + H.SA]; mz = Hs[o + H.CA]; L = Hs[o + H.DEPTH]; }
      else if (S[q + P.TYPE] === PT.CYL) { const ox = x - S[q + P.CX], oz = z - S[q + P.CZ], l = Math.sqrt(ox * ox + oz * oz) || 1; mx = ox / l; mz = oz / l; L = 1; }
      else { mx = -S[q + P.SA]; mz = S[q + P.CA]; L = 2 * S[q + P.HZ]; }
      if (mx * dx + mz * dz > 0) { mx = -mx; mz = -mz; }
      const k = smooth(1, 2.5, L * Math.abs(dx * nx + dz * nz) / Math.max(1e-3, D * v.colAngle));
      if (k < 1) { lx = k * nx + (1 - k) * mx; ly = k * ny; lz = k * nz + (1 - k) * mz; const l = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1; lx /= l; ly /= l; lz /= l; }
    } else if (K === this.figKit && ny > -0.5 && ny < 0.5) {
      // (phase 4a) a side of a person's part seen nearly edge on is a sliver
      // too: under about two and a half cells wide it takes the light of
      // the face beside it, as a reveal does
      const ca = S[q + P.CA], sa = S[q + P.SA], onU = Math.abs(nx * ca + nz * sa) > 0.7;
      let mx = onU ? -sa : ca, mz = onU ? ca : sa;
      const L = 2 * (onU ? S[q + P.HZ] : S[q + P.HX]);
      if (mx * dx + mz * dz > 0) { mx = -mx; mz = -mz; }
      const k = smooth(1, 2.5, L * Math.abs(dx * nx + dz * nz) / Math.max(1e-3, D * v.colAngle));
      if (k < 1) { lx = k * nx + (1 - k) * mx; lz = k * nz + (1 - k) * mz; const l = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1; lx /= l; ly /= l; lz /= l; }
    }
    const Ld = light.L;
    let lam = lx * Ld[0] + ly * Ld[1] + lz * Ld[2];
    if (lam < 0) lam = 0;
    // (a person's part: its shadow taken once, at its middle, so a face is
    // lit evenly and a soft shadow's edge cannot cross it and blink)
    const fig = K === this.figKit, sx = fig ? S[q + P.CX] : x, sz = fig ? S[q + P.CZ] : z, sy = fig ? (S[q + P.Y0] + S[q + P.Y1]) / 2 : y;
    const shadow = light.shadowAt(sx + lx * 0.6, sy + ly * 0.6 + 0.05, sz + lz * 0.6);
    const cloud = light.cloudAt(x, z);
    // which torches light it: those of its room, or of its side of the walls
    // (a doorway's or a window's sides are lit as the wall's face outside;
    // the gate's deep passage is a room)
    const room = hit.rev === 1 && K.holes[hit.revO + H.DEPTH] > 0 && K.holes[hit.revO + H.DEPTH] < 2 ? -1 : hit.room;
    const zone = room >= 0 ? roomBit(K, room) | (K.rooms[room] && K.rooms[room].open ? zoneAt(K, x + nx * 0.6, z + nz * 0.6) : 0) : zoneAt(K, x + nx * 0.6, z + nz * 0.6);
    let glow = m.glowAt(x, y, z, lx, ly, lz, zone, true);
    // (phase 5b) a lost thing shines: it catches what light there is
    if (K === this.figKit && K.shine && K.shine[q / P_STRIDE]) {
      const SH = LOST.shine;
      lam += (1 - lam) * SH.light; glow = Math.min(1, glow * SH.glow); tone += SH.tone;
    }
    m.write(ci, slot, mat, lam, shadow, room >= 0 ? 0 : cloud, glow, tone, leg);
    if (slot === 0 && room >= 0) {
      // inside: how much of the sky's soft light reaches it
      const sh = shelterOf(K, room, x, y, z, lx, ly, lz);
      const o = ci * HIT_STRIDE + 2 * REC;
      m.hits[o] = MAT_SHELTER;
      m.hits[o + 1] = sh <= 0 ? 0 : sh >= 1 ? 255 : (sh * 255 + 0.5) | 0;
    } else if (slot === 0 && hit.cover < 1 && K !== this.figKit) {
      // (phase 4b) wild detail far off, held bigger than it is: faded by
      // its true share (resolve blends it with what is behind)
      const o = ci * HIT_STRIDE + 2 * REC;
      m.hits[o] = MAT_FAINT; m.hits[o + 1] = (hit.cover * 255 + 0.5) | 0;
    }
  },
};
