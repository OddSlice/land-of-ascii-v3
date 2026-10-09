// Buildings as vertical spans per grid cell: the wall, its merlons and the
// arched gate. A cell holds at most one span here: [y0, y1] of one material,
// with flags. The gate's span starts at an arch curve, so the gate can be
// walked through and the wall's top walked over.
import { N, WALL, GATE } from './layout.js';
import { MAT } from '../contract.js';

export const SPAN_MERLON = 1;      // y1 is the merlon top (fades to the walkway far off)
export const SPAN_ARCH = 2;        // y0 follows the gate arch across x

export function buildSpans() {
  const idx = new Int16Array(N * N).fill(-1);
  const y0 = [], y1 = [], flags = [], mat = [];
  for (let z = WALL.z0; z < WALL.z1; z++) {
    for (let x = WALL.x0; x < WALL.x1; x++) {
      let f = 0;
      // merlons on both parapets, one metre wide every two metres
      const edgeRow = z === WALL.z0 || z === WALL.z1 - 1;
      if (edgeRow && (x - WALL.x0) % 2 === 0) f |= SPAN_MERLON;
      // the two end blocks stand a little taller all across
      if (x === WALL.x0 || x === WALL.x1 - 1) f |= SPAN_MERLON;
      if (x >= GATE.x0 && x < GATE.x1) f |= SPAN_ARCH;
      idx[z * N + x] = y0.length;
      y0.push(WALL.base);
      y1.push(WALL.top);
      flags.push(f);
      mat.push(MAT.STONE);
    }
  }
  return {
    idx,
    y0: Float32Array.from(y0),
    y1: Float32Array.from(y1),
    flags: Uint8Array.from(flags),
    mat: Uint8Array.from(mat),
    box: { x0: WALL.x0, x1: WALL.x1, z0: WALL.z0, z1: WALL.z1, top: WALL.top + WALL.merlon },
  };
}

// Height of the gate's arch underside at world x (absolute y).
export function archY(x, groundY) {
  const u = x - GATE.cx;
  const a = Math.abs(u) >= GATE.r ? 0 : Math.sqrt(GATE.r * GATE.r - u * u);
  return groundY + GATE.jamb + a;
}
