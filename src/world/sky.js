// The sky's world data: where the sun and moon are at a given hour, and the
// clouds (clusters of puffs) drifting on the wind.
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

// The moon's phase (phase 2a, night rule 'moon'): 0 new, 0.5 full, from the
// day count and the hour, so it moves on smoothly as time runs. Day 0 at
// 23:00 is the moon above (13 hours behind the sun, nearly full).
const MONTH = 29.53, PHASE0 = 13 / 24 - (23 / 24) / MONTH;
export function moonPhase(hour, day = 0) {
  const p = (day + hour / 24) / MONTH + PHASE0;
  return p - Math.floor(p);
}

// The share of the moon's face that is lit (0 new, 1 full).
export function moonLit(hour, day = 0) { return (1 - Math.cos(2 * Math.PI * moonPhase(hour, day))) / 2; }

// Where the moon is: it runs behind the sun by its phase (new: with the sun,
// so a dark night; full: opposite it, up all night), a little higher in the sky.
export function moonDirOn(hour, day = 0) {
  const th = (hour - 12 - 24 * moonPhase(hour, day)) / 24 * Math.PI * 2;
  const lat = LAT - 0.18;
  return [-Math.sin(th), Math.cos(th) * Math.cos(lat), -Math.cos(th) * Math.sin(lat)];
}

// The moon for a frame, by its night rule (phase 1's, or the phases').
export function moonFor(hour, day, night) { return night === 'p1' ? moonDir(hour) : moonDirOn(hour, day); }

export const WIND = [2.4, 0];          // metres a second, due east
export const CLOUD_SPAN = 7600;        // clouds wrap east-west over this width

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

// The generated world's clouds: spread over its whole sky from the seed (a
// jittered grid about a kilometre apart, some cells left clear), so there is
// weather in every direction, not only where the lab's valley looked.
// Each carries its rank (0..1): the clouds of fair weather are those ranked
// up to CLOUD_CUT; more cloud (phase 2b's weather) brings in the rest, which
// are listed after them so the first ones keep their places and shapes.
export const CLOUD_CUT = 0.62;
export function worldCloudList(seed, N) {
  const out = [], more = [], G = 950, x0 = N / 2 - CLOUD_SPAN / 2, z0 = N / 2 - 3600;
  for (let gz = 0; gz < 8; gz++) {
    for (let gx = 0; gx < 8; gx++) {
      const r = (n) => hash2(gx * 13 + gz, n, (seed | 0) + 641);
      (r(1) > CLOUD_CUT ? more : out).push([x0 + (gx + 0.15 + 0.7 * r(2)) * G, z0 + (gz + 0.15 + 0.7 * r(3)) * G, 860 + 140 * r(4), 0.8 + 0.6 * r(5), r(1)]);
    }
  }
  return out.concat(more);
}

// How much of a cloud of rank `rank` is up under a cloud amount `m` (1:
// fair's clouds whole and no others; 0: none; 2: all), growing and shrinking
// smoothly as the amount changes. The lab's hand-placed clouds rank 0.
const CLOUD_BAND = 0.08;
export function cloudAmount(rank = 0, m = 1) {
  const v = rank <= CLOUD_CUT ? (Math.min(m, 1) * (CLOUD_CUT + CLOUD_BAND) - rank) / CLOUD_BAND
    : (CLOUD_CUT + Math.max(0, m - 1) * (1 - CLOUD_CUT + CLOUD_BAND) - rank) / CLOUD_BAND;
  return v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v);
}

// Each cloud carries both treatments' puffs, as ellipsoids
// [dx, dz, dy, along, up, across, angle]: A, rounded cumulus (spheres of
// varied sizes); B, a bank (a long, broken band of stretched puffs turned to
// the band's angle). `shift` moves every cluster, for maps centred elsewhere
// than the lab's valley; `list` replaces the lab's hand-placed clusters.
export function buildClouds(shift = 0, list = CLUSTERS) {
  const clusters = list.map(([x0, z0, base, scale, rank = 0], c) => {
    const x = x0 + shift, z = z0 + shift;
    const r = (n) => hash2(c, n, SEED + 61);
    const main = (150 + 170 * r(1)) * scale;
    // A: flat-bottomed domes; puff centres sit a little above the base, so
    // the cut underneath is wide
    const puffs = [[0, 0, main * 0.3, main, main, main, 0]];
    const n = 4 + Math.floor(3 * r(2));
    for (let p = 0; p < n; p++) {
      const a = r(10 + p) * Math.PI * 2;
      const d = main * (0.55 + 0.5 * r(20 + p));
      const pr = main * (0.5 + 0.3 * r(30 + p));
      puffs.push([Math.cos(a) * d * 1.7, Math.sin(a) * d * 0.6, pr * 0.2, pr, pr, pr, 0]);
    }
    // B: a bank, with the odd break
    const ang = (r(3) - 0.5) * 0.9, ca = Math.cos(ang), sa = Math.sin(ang);
    const len = main * (1.6 + 1.0 * r(4));
    const nb = 7 + Math.floor(7 * r(5));
    const puffsB = [];
    for (let q = 0; q < nb; q++) {
      if (q > 0 && r(45 + q) < 0.18) continue;
      const u = (q / (nb - 1) - 0.5) * len + main * 0.3 * (r(40 + q) - 0.5);
      const v = main * 0.9 * (r(50 + q) - 0.5);
      const pr = main * (0.35 + 0.35 * r(55 + q));
      const up = pr * (0.5 + 0.3 * r(65 + q));
      puffsB.push([ca * u - sa * v, sa * u + ca * v, up * 0.3, pr * (1.5 + 0.9 * r(60 + q)), up, pr * (0.8 + 0.5 * r(70 + q)), ang]);
    }
    // how far a puff can reach (B's are stretched up to 1.4 times at dusk)
    const reachOf = (list, k) => list.reduce((m, [dx, dz, , a, , cc]) => Math.max(m, Math.hypot(dx, dz) + Math.max(a * k, cc)), 0);
    return { x, z, base, puffs, puffsB, reach: reachOf(puffs, 1), reachB: reachOf(puffsB, 1.4), seed: c, rank };
  });
  return { clusters };
}

// Cluster position at time t: drifted by the wind, wrapped east-west, and a
// size factor that shrinks it to nothing near the wrap so nothing pops.
// `drift`: metres further east on the weather's wind (src/weather.js).
export function clusterAt(cl, t, CLOUD_CX = 256, drift = 0) {
  const half = CLOUD_SPAN / 2;
  let x = cl.x + WIND[0] * t + drift - (CLOUD_CX - half);
  x = ((x % CLOUD_SPAN) + CLOUD_SPAN) % CLOUD_SPAN + (CLOUD_CX - half);
  const z = cl.z + WIND[1] * t;
  const edge = half - Math.abs(x - CLOUD_CX);
  const fade = Math.min(1, Math.max(0, edge / 500));
  return [x, z, fade * fade * (3 - 2 * fade)];
}
