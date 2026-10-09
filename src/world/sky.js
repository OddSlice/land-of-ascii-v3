// The sky's world data: where the sun and moon are at a given hour, and the
// cumulus clouds (clusters of flattened puffs) drifting on the wind.
import { hash2 } from './noise.js';
import { SEED } from './layout.js';

const LAT = 35 * Math.PI / 180;

// Unit vector toward the sun. 6:00 rises in the east (+x), noon is high in
// the south (-z), 18:00 sets in the west.
export function sunDir(hour) {
  const th = (hour - 12) / 24 * Math.PI * 2;
  return [-Math.sin(th), Math.cos(th) * Math.cos(LAT), -Math.cos(th) * Math.sin(LAT)];
}

// The moon runs thirteen hours behind the sun, a little higher in the sky:
// below the horizon at dusk, high in the south-east late at night.
export function moonDir(hour) {
  const th = (hour - 12 - 13) / 24 * Math.PI * 2;
  const lat = LAT - 0.18;
  return [-Math.sin(th), Math.cos(th) * Math.cos(lat), -Math.cos(th) * Math.sin(lat)];
}

export const WIND = [2.4, 0];          // metres a second, due east
export const CLOUD_SPAN = 7600;        // clouds wrap east-west over this width
export const CLOUD_CX = 256;           // centred on the valley

// Hand-placed cluster centres (x, z at t = 0) and their base heights. The
// first group sits south of the valley so that around midday their shadows
// fall on the meadow; the rest are seen in the sky to the north.
const CLUSTERS = [
  // shadow casters (the noon sun throws them ~600 m north)
  [180, -380, 880, 1.0], [470, -240, 920, 0.85], [-90, -150, 900, 0.8], [300, -760, 860, 0.9],
  // the northern sky
  [60, 2500, 950, 1.15], [600, 1850, 900, 1.0], [-520, 3300, 980, 1.2], [340, 3900, 1000, 1.25],
  [1100, 2900, 940, 1.1], [-1300, 1700, 900, 0.95],
  // east and west, and behind
  [1500, 500, 920, 1.0], [-1100, 400, 900, 0.9], [900, -1500, 930, 1.05], [-700, -1400, 960, 1.0],
  // low in the east, seen across the wall at dusk
  [2700, 1500, 900, 2.0], [3100, 300, 880, 1.9], [2300, 2600, 940, 1.9], [3300, -900, 920, 1.8],
  [-2600, 900, 950, 1.6], [-2400, 2400, 980, 1.6]
];

export function buildClouds() {
  const clusters = CLUSTERS.map(([x, z, base, scale], c) => {
    const r = (n) => hash2(c, n, SEED + 61);
    const main = (210 + 70 * r(1)) * scale;
    // flat-bottomed domes: puff centres sit a little above the base, so the
    // cut underneath is wide
    const puffs = [[0, 0, main * 0.3, main]];
    const n = 4 + Math.floor(3 * r(2));
    for (let p = 0; p < n; p++) {
      const a = r(10 + p) * Math.PI * 2;
      const d = main * (0.55 + 0.5 * r(20 + p));
      const pr = main * (0.5 + 0.3 * r(30 + p));
      puffs.push([Math.cos(a) * d * 1.7, Math.sin(a) * d * 0.6, pr * 0.2, pr]);
    }
    let reach = 0;
    for (const [dx, dz, , pr] of puffs) reach = Math.max(reach, Math.hypot(dx, dz) + pr);
    return { x, z, base, puffs, reach, seed: c };
  });
  return { clusters };
}

// Cluster position at time t: drifted by the wind, wrapped east-west, and a
// size factor that shrinks it to nothing near the wrap so nothing pops.
export function clusterAt(cl, t) {
  const half = CLOUD_SPAN / 2;
  let x = cl.x + WIND[0] * t - (CLOUD_CX - half);
  x = ((x % CLOUD_SPAN) + CLOUD_SPAN) % CLOUD_SPAN + (CLOUD_CX - half);
  const z = cl.z + WIND[1] * t;
  const edge = half - Math.abs(x - CLOUD_CX);
  const fade = Math.min(1, Math.max(0, edge / 500));
  return [x, z, fade * fade * (3 - 2 * fade)];
}
