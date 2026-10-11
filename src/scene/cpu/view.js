// Per-frame ray setup for the CPU column march, with true perspective.
//
// Every cell's ray is split into a horizontal direction (its azimuth) and a
// slope (rise over horizontal distance). Rays that share an azimuth lie in
// one vertical plane, and one march along that plane answers all of them.
// Looking level, each screen column is exactly one plane. Looking up or down,
// the cells of one azimuth lie on a slanted line through the vertical
// vanishing point, so the planes are spaced finely enough that every cell
// finds one within half a column of its own azimuth, and each cell is
// marched in its nearest plane. Nothing is sheared.
//
// The planes are numbered over the whole picture, so a stripe of columns
// marches exactly the planes its own cells need, and the answer for a cell
// never depends on which stripe it was in.

export const MAX_PITCH = 55 * Math.PI / 180;

export function makeView(frame) {
  const { cols: W, rows: R, fovY, aspect, cam } = frame;
  const ty = Math.tan(fovY / 2), tx = ty * aspect;
  const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, cam.pitch));
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cyaw = Math.cos(cam.yaw), syaw = Math.sin(cam.yaw);
  const bmax = cp + ty * Math.abs(sp), bmin = cp - ty * Math.abs(sp);
  const amax = tx * (1 - 1 / W);
  const dt = 2 * tx / (W * bmax);
  const t0 = -amax / bmin;
  const J = Math.round(2 * amax / bmin / dt) + 1;
  return {
    W, R, tx, ty, cp, sp, cyaw, syaw, dt, t0, J,
    ex: cam.x, ey: cam.y, ez: cam.z,
    // angular size of a column and a row at the centre of the picture
    colAngle: 2 * tx / W,
    rowAngle: 2 * ty / R,
  };
}

// The horizontal world direction of plane j.
export function planeDir(v, j, out) {
  const t = v.t0 + j * v.dt;
  // lateral t along right = (cos yaw, -sin yaw), 1 along forward = (sin yaw, cos yaw)
  let dx = t * v.cyaw + v.syaw, dz = -t * v.syaw + v.cyaw;
  const n = 1 / Math.sqrt(dx * dx + dz * dz);
  out[0] = dx * n; out[1] = dz * n;
}

// Screen position of a world point: [x, y] in -1..1 (y up) and the depth
// along the view axis; depth <= 0 means behind the eye.
export function project(v, x, y, z, out) {
  const rx = x - v.ex, ry = y - v.ey, rz = z - v.ez;
  const a = rx * v.cyaw - rz * v.syaw;          // lateral
  const b = rx * v.syaw + rz * v.cyaw;          // forward (horizontal)
  const cz = b * v.cp + ry * v.sp;              // along the view axis
  const cy = ry * v.cp - b * v.sp;              // up on the screen
  out[0] = a / cz / v.tx;
  out[1] = cy / cz / v.ty;
  out[2] = cz;
}

// Stripe tables: which plane each of the stripe's cells uses, its slope, and
// for each plane the stripe's cells sorted by slope (lowest first).
export class StripeRays {
  constructor() { this.cap = 0; }

  ensure(cells, planes) {
    if (cells > this.cap) {
      this.cap = cells;
      this.plane = new Int32Array(cells);
      this.sigma = new Float32Array(cells);
      // the slope of the cell one row below in the same column (its centre),
      // and how much of the cell a skyline below it covers (the far rule):
      // both the cell's own, so they never depend on the stripe
      this.sigB = new Float32Array(cells);
      this.fringe = new Float32Array(cells);
      this.depth = new Float32Array(cells);
      // mirrored rays of water cells: slope, distance to the water, the
      // mirrored eye's height, and what they hit (-1: no water in this cell)
      this.rsig = new Float32Array(cells);
      this.rdw = new Float32Array(cells);
      this.rey = new Float32Array(cells);
      this.rdepth = new Float32Array(cells);
      this.order = new Int32Array(cells);      // cell indices grouped by plane
      this.osig = new Float32Array(cells);     // their slopes
    }
    if (!this.pstart || this.pstart.length < planes + 2) {
      this.pstart = new Int32Array(planes + 2);
      this.pdx = new Float32Array(planes + 1);
      this.pdz = new Float32Array(planes + 1);
    }
  }

  build(v, c0, c1) {
    const sw = c1 - c0, R = v.R, cells = sw * R;
    // first pass: plane and slope of every cell, plane range
    let jlo = 1e9, jhi = -1;
    this.ensure(cells, v.J);
    const { plane, sigma } = this;
    const { sigB, fringe } = this;
    for (let cy = 0; cy < R; cy++) {
      const y = 1 - 2 * (cy + 0.5) / R;
      const yb = y * v.ty;
      const b = v.cp - yb * v.sp;
      const up = yb * v.cp + v.sp;
      const yb2 = (1 - 2 * (cy + 1.5) / R) * v.ty, b2 = v.cp - yb2 * v.sp, up2 = yb2 * v.cp + v.sp;
      for (let cx = c0; cx < c1; cx++) {
        const a = (2 * (cx + 0.5) / v.W - 1) * v.tx;
        let j = Math.round((a / b - v.t0) / v.dt);
        if (j < 0) j = 0; else if (j >= v.J) j = v.J - 1;
        const i = cy * sw + (cx - c0);
        plane[i] = j;
        sigma[i] = up / Math.sqrt(a * a + b * b);
        sigB[i] = up2 / Math.sqrt(a * a + b2 * b2);
        fringe[i] = 0;
        if (j < jlo) jlo = j;
        if (j > jhi) jhi = j;
      }
    }
    const np = jhi - jlo + 1;
    this.ensure(cells, np);
    const { pstart, order, osig, pdx, pdz } = this;
    pstart.fill(0, 0, np + 2);
    for (let i = 0; i < cells; i++) pstart[plane[i] - jlo + 1]++;
    for (let p = 1; p <= np; p++) pstart[p] += pstart[p - 1];
    // second pass, bottom row first, so each plane's list comes out rising
    const fill = this.fillTmp && this.fillTmp.length >= np ? this.fillTmp : (this.fillTmp = new Int32Array(np + 1));
    for (let p = 0; p < np; p++) fill[p] = pstart[p];
    for (let cy = R - 1; cy >= 0; cy--) {
      for (let k = 0; k < sw; k++) {
        const i = cy * sw + k;
        const p = plane[i] - jlo;
        const at = fill[p]++;
        order[at] = i;
        osig[at] = sigma[i];
      }
    }
    // a plane can get two cells of one row; keep each list sorted by slope
    for (let p = 0; p < np; p++) {
      for (let a = pstart[p] + 1; a < pstart[p + 1]; a++) {
        const s = osig[a], c = order[a];
        let b = a - 1;
        while (b >= pstart[p] && osig[b] > s) { osig[b + 1] = osig[b]; order[b + 1] = order[b]; b--; }
        osig[b + 1] = s; order[b + 1] = c;
      }
    }
    const dir = [0, 0];
    for (let p = 0; p < np; p++) {
      planeDir(v, jlo + p, dir);
      pdx[p] = dir[0]; pdz[p] = dir[1];
    }
    this.jlo = jlo;
    this.np = np;
    this.c0 = c0; this.c1 = c1;
    this.sw = sw;
    this.cells = cells;
    this.depth.fill(Infinity, 0, cells);
    this.rdepth.fill(-1, 0, cells);
  }
}
