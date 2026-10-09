// Builds the whole Look Lab scene from the constant seed. Every thread calls
// this and gets the same world, so nothing large is sent between threads.
import { buildTerrain } from './terrain.js';
import { buildSpans } from './spans.js';
import { buildObjects } from './objects.js';
import { buildClouds } from './sky.js';

export function buildWorld() {
  const t0 = performance.now();
  const terrain = buildTerrain();
  const spans = buildSpans();
  const objects = buildObjects(terrain);
  const clouds = buildClouds();
  return { terrain, spans, objects, clouds, buildMs: performance.now() - t0 };
}
