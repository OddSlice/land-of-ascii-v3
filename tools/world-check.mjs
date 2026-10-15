// Checks generated worlds, in Node (no browser): for each seed,
//  1. the same seed gives byte-identical world arrays (built twice);
//  2. every recorded site can be reached on foot from the spawn under the
//     walking rules (up nothing steeper than 45 degrees, down anything, since
//     falling does no harm; through water no deeper than the chest);
//  3. no road is steeper than its limit (measured along it, over 4 m), nor
//     runs through water deeper than a ford;
//  4. every river runs downhill (its water never rises) to a lake or the sea;
//  5. no tree stands in water or on a road;
//  6. the sky test: the camera at eye level at 300 random walkable lowland
//     points and 50 points along the roads, looking level in four
//     directions; the share of each frame that is sky (or cloud, sun, moon,
//     stars) must have a median of at least 35% with fewer than one view in
//     ten under 15%. Frames are 360 x 112 cells (the default density at
//     1440 x 900), the vertical field of view 60 degrees, at 14:00 with every
//     clock frozen, the settled look, rendered by the real CPU backend.
//  7. far readability (phase 2a): from the spawn and from each of the four
//     viewpoints, looking their way at 14:00, the main lake, a river, a
//     forest (conifers over 150 m away) and a road that are in view must each
//     differ from the cells round them by a visible step in the resolved
//     colours (a mean background more than 6 levels apart in some channel,
//     the flicker tool's visible step), and from the spawn the range's lit
//     and shaded faces must differ by one too: within one material (rock,
//     snow or meadow over 800 m away), the quarter of its cells the most
//     light reaches against the quarter the least does.
//
//  8. (phase 3a) the fort: it is placed and its road enters its gate (the
//     road's end lies in the yard, a road point lies in the gate's passage,
//     and the ground along the road from 30 m out to the yard rises or falls
//     no more than the roads' limit between points a metre apart: no step);
//     a walker under the walking rules and the building kit's exact
//     collision (the game's own Player) can go from the gate's mouth
//     through the passage, across the yard, up each stone stair, along the
//     whole wall walk (points every 4 m on every run of wall), into each
//     tower and up to its top, into the keep's hall, and from each of those
//     back out of the gate; a thousand random walking attempts from places
//     in and round the fort (3 s each, turning now and then) never pass
//     through a wall, never get stuck and never leave the walker inside
//     solid stone; no tree stands in the fort or the margin round it.
//  9. (phase 3a) far readability also counts the fort: from the spawn,
//     turned toward it, it must differ from the cells round it by a visible step.
// 10. (phase 3b) the villages: all three placed, each a different pattern,
//     with 8 to 20 houses, a chapel, a well, one or two barns, a signpost and
//     at least two lanterns; every road walked end to end (across every
//     bridge) and every footpath; no building, fence or field over a road,
//     water, the fort or another; no door onto a drop, into water or into a
//     neighbour; a walker reaches every house one can enter, every barn, the
//     jetty's end and every door from the well and gets back out; a thousand
//     random walks in each village never pass through a wall, get stuck or
//     end inside anything; and from its viewpoint each village differs from
//     its surroundings by a visible step by day and shows at least two lit
//     cells at night.
//
// 12. (phase 4b) the animals: every village has its flocks, a fold for each,
//     a shepherd, hens and a dog, and every world deer, hares, ducks, gulls,
//     crows, small birds and large birds; every animal sampled every ten
//     minutes for three days is never inside a wall, fence, building,
//     boulder or another animal, never in water (but ducks), never outside
//     its pasture or habitat; every flock is in its fold at night; a walker
//     coming up to each deer group, hare and crow always sees it lift its
//     head before it moves, then flee, and finds it back when gone; the same
//     day and hour give the same states from a fresh start.
// 13. (phase 4b) the wild ground detail: no boulder, outcrop, log, stump or
//     reed bed on a road or a footpath, nor near a door, the fort's gate, a
//     bridge's or a jetty's end (and the people's routes are walked again in 11).
// 14. (phase 5a) wayfaring: every favour's giver, the one it is for and the
//     lost thing exist and can be reached on foot from the giver (the
//     people's routes, under the player's rules); everyone a favour is for
//     (and every giver one comes back to) can be met for at least two hours
//     of each of 28 days; no lost thing lies inside a shape, in water or on
//     a road or path; every place the journal lists can be found by walking
//     to it (a node reached from the spawn within its distance, with sight
//     of it); the first favour's giver reaches the spawn's road within two
//     game minutes of the start, by a way that can be walked, and stands at
//     its edge clear of the spawn; and a scripted player who knows only the
//     words (tools/lib/reader.mjs) does one favour of each kind, in four to
//     twelve minutes' walking each.
//
//   node tools/world-check.mjs [--seeds 1,2,3,4,5] [--points 300] [--road 50] [--out file.json]
//   node tools/world-check.mjs --way-only [--seeds ...] [--sweep 60]   (phase 5a) wayfaring's checks alone
//   node tools/world-check.mjs --fort-only --sweep 60 [--from 1000]   (phase 3a) the fort's
//         checks (8) alone on sixty random seeds
import fs from 'node:fs';
import path from 'node:path';
import { args, ROOT } from './lib/serve.mjs';
import { DEFAULT_SEED } from '../src/world/gen/world.js';
import { packWorld, unpackWorld, worldHash } from '../src/world/pack.js';
import { SCALE } from '../src/world/scale.js';
import { build, reach, roads, rivers, trees, sky, STEP, farRead, villageRead } from './lib/check-land.mjs';
import { fortChecks, villageChecks } from './lib/check-places.mjs';
import { peopleChecks, animalChecks, wildChecks } from './lib/check-life.mjs';
import { wayChecks } from './lib/check-way.mjs';

const a = args();
// (the default seed and four others: 3, 1, 2, 4, 5)
const seeds = String(a.seeds || [DEFAULT_SEED, ...[1, 2, 3, 4, 5].filter((s) => s !== DEFAULT_SEED)].slice(0, 5).join(',')).split(',').map(Number);
const nPts = Number(a.points || 300), nRoad = Number(a.road || 50);

function printWay(seed, wy) {
  console.log(`  wayfaring: ${wy.ok ? 'pass' : 'FAIL'} in ${wy.ms} ms; ${wy.favours} favours (carry ${wy.kinds.carry}, find ${wy.kinds.find}, tell ${wy.kinds.tell}; ${wy.chains} follow another), ${wy.places} places, ${wy.found.filter((x) => x[1]).length} findable`);
  if (wy.meet) console.log(`    first meeting: ${wy.meet.person} (${wy.meet.role}) on the road ${wy.meet.minutes} min after the start, ${wy.meet.walk} m out, waits ${wy.meet.waits} min, ${wy.meet.fromRoad} m off the road's middle, ${wy.meet.fromSpawn} m from the spawn`);
  console.log(`    met for two hours a day: ${wy.meetable.people} people over ${wy.meetable.days} days, the least ${wy.meetable.least} h`);
  for (const pl of wy.play) console.log(`    scripted player, ${pl.kind} ${pl.id}: ${pl.ok ? `${pl.minutes} min walking (${pl.metres} m)` : `FAILED: ${pl.why}`}`);
  if (wy.every) console.log(`    every favour from its words alone: ${wy.every.done} of ${wy.every.of}, ${Math.min(...wy.every.minutes).toFixed(1)} to ${Math.max(...wy.every.minutes).toFixed(1)} min`);
  for (const f of wy.fails.slice(0, 12)) console.log(`    ! ${f}`);
}

function printAnimals(seed, ac, wc) {
  const s2 = ac.samples;
  console.log(`  animals: ${ac.ok ? 'ok' : 'FAIL'}, ${Object.entries(ac.counts).map(([k, v]) => `${v} ${k}`).join(', ')} in ${ac.groups} groups${ac.missing.length ? `; MISSING: ${ac.missing.join('; ')}` : '; every village with its flocks, folds, shepherd, hens and dog'}`);
  console.log(`  animals sampled every ten minutes for three days (${s2.samples} positions): inside a shape ${s2.inside}, too close to another ${s2.overlap}, in water ${s2.water}, out of their place ${s2.outside}, flocks out of the fold at night ${s2.unfolded} (of ${s2.nightChecks}); the same from a fresh start ${ac.same ? 'yes' : 'NO'}${s2.examples.length ? `; e.g. ${s2.examples.slice(0, 5).join('; ')}` : ''} (${ac.ms} ms)`);
  console.log(`  walker up to deer, hares and crows: ${ac.walker.ok} of ${ac.walker.groups} alert, then flee, then back${ac.walker.first ? ` (${Object.entries(ac.walker.first).map(([k, v]) => `${k}: alert ${v.alertAt} m, moves ${v.fleeAt} m, ${v.moved} m`).join('; ')})` : ''}${ac.walker.fails.length ? `; FAILED: ${ac.walker.fails.slice(0, 5).join('; ')}` : ''}`);
  console.log(`  wild ground detail: ${wc.ok ? 'ok' : 'FAIL'}, ${Object.entries(wc.counts).map(([k, v]) => `${v} ${k}`).join(', ')}${wc.fails.length ? `; FAILED: ${wc.fails.slice(0, 6).join('; ')}` : '; none on a road or path, nor by a door, gate, bridge or jetty'}`);
}


function printPeople(seed, pc) {
  const rs = Object.entries(pc.roles).map(([k, v]) => `${v} ${k}${v > 1 ? 's' : ''}`).join(', ');
  console.log(`  people: ${pc.ok ? 'ok' : 'FAIL'}, ${pc.persons} (${rs}); homes ${pc.homes.fails.length ? `FAILED: ${pc.homes.fails.slice(0, 4).join('; ')}` : 'all with a door one can reach'}; plans ${pc.plans.days} days, ${pc.plans.segments} segments, ${pc.plans.routes} routes walked${pc.plans.fails.length ? `; FAILED: ${pc.plans.fails.slice(0, 4).join('; ')}` : ', all passable'}${pc.bad ? `; ${pc.bad} unwalkable` : ''}`);
  const s2 = pc.samples;
  console.log(`  people sampled every ten minutes for three days (${s2.samples} positions): inside a shape ${s2.inside}, in deep water ${s2.water}, off a deck ${s2.deck}, on one spot ${s2.same}; hours without a guard at the gate ${s2.guardGate}, on the wall ${s2.guardWall}; windows not matching who is awake ${s2.lit}; the same from a fresh start ${pc.same ? 'yes' : 'NO'}${s2.examples.length ? `; e.g. ${s2.examples.slice(0, 4).join('; ')}` : ''} (${pc.ms} ms)`);
}

function printVillages(seed, vc) {
  console.log(`  villages: ${vc.ok ? 'ok' : 'FAIL'}, patterns ${vc.patterns.join(', ')}${vc.distinct ? '' : ' (NOT ALL DIFFERENT)'}; ${vc.counts.map((c, i) => c ? `village ${i + 1}: ${c.houses} houses (${c.enter} to enter), ${c.barns} barns, chapel ${c.chapel ? 'yes' : 'NO'}, well ${c.well ? 'yes' : 'NO'}, signpost ${c.signpost ? 'yes' : 'NO'}, ${c.lanterns} lanterns, ${c.fields} fields, ${c.paths} paths${c.jetty ? ', a jetty' : ''}${c.shelter ? ', a market shelter' : ''}` : 'NONE').join('; ')}`);
  console.log(`  by road: ${vc.roadsWalked.roads} roads walked, ${vc.roadsWalked.bridges} bridges${vc.roadsWalked.failed.length ? `; FAILED at ${vc.roadsWalked.failed.join('; ')}` : ', all passable'}; footpaths ${vc.pathsWalked.paths}${vc.pathsWalked.failed.length ? `; FAILED: ${vc.pathsWalked.failed.join('; ')}` : ', all passable'}`);
  console.log(`  overlaps ${vc.overlaps.length ? vc.overlaps.slice(0, 6).join('; ') : 'none'}; doors ${vc.doors.length ? vc.doors.slice(0, 6).join('; ') : 'all onto firm ground'}`);
  vc.walkers.forEach((wk, i) => console.log(`  village ${i + 1} walker: ${wk.reached} of ${wk.targets} places reached, ${wk.out} with a way back out (${wk.states} states)${wk.failed.length ? `; FAILED: ${wk.failed.slice(0, 6).join('; ')}` : ''}; random walks through a wall ${wk.walks ? wk.walks.through : '-'}, stuck ${wk.walks ? wk.walks.stuck : '-'}, inside ${wk.walks ? wk.walks.inside : '-'}${wk.walks && wk.walks.examples.length ? ` e.g. ${JSON.stringify(wk.walks.examples)}` : ''}`));
}

function printFort(seed, ft) {
  console.log(`  fort: ${ft.ok ? 'ok' : 'FAIL'}, ${ft.towers} towers, ${ft.stairs} stairs; road in the gate's passage ${ft.road.inPassage}, ending in the yard ${ft.road.endInYard}, steepest near the gate ${(100 * ft.road.worstStep).toFixed(1)}% over 4 m, biggest rise in a metre ${ft.road.worstRise.toFixed(2)} m; trees in the fort or its margin ${ft.treesIn}`);
  console.log(`  walker: ${ft.walker.reached} of ${ft.walker.targets} places reached, ${ft.walker.out} of them with a way back out (${ft.walker.states} states)${ft.walker.failed.length ? `; FAILED: ${ft.walker.failed.join('; ')}` : ''}`);
  console.log(`  random walks: ${ft.walks.attempts}, through a wall ${ft.walks.through}, stuck ${ft.walks.stuck}, inside stone ${ft.walks.inside}${ft.walks.examples.length ? ` e.g. ${JSON.stringify(ft.walks.examples)}` : ''}`);
}

if (a['way-only']) {
  // (phase 5a) wayfaring's checks alone, on the given seeds or a sweep
  const list = a.sweep ? Array.from({ length: Number(a.sweep) }, (_, i) => Number(a.from || 1000) + i * 7919 % 100000) : seeds;
  const rows = [];
  for (const seed of list) {
    let wy = null, err = null;
    try { wy = wayChecks(unpackWorld(packWorld(build(seed)))); } catch (e) { err = String(e.stack || e); }
    rows.push({ seed, wy, err });
    if (err) { console.log(`seed ${seed}: FAIL ${err}`); continue; }
    console.log(`seed ${seed}: ${wy.ok ? 'PASS' : 'FAIL'}`);
    if (!wy.ok || a.detail || !a.sweep) printWay(seed, wy);
  }
  const Q = rows.filter((r) => r.wy), sum = (f) => Q.reduce((s2, r) => s2 + f(r), 0);
  const plays = Q.flatMap((r) => r.wy.play);
  console.log(`\n${Q.filter((r) => r.wy.ok).length} of ${rows.length} seeds pass wayfaring's checks; ${sum((r) => r.wy.favours)} favours (carry ${sum((r) => r.wy.kinds.carry)}, find ${sum((r) => r.wy.kinds.find)}, tell ${sum((r) => r.wy.kinds.tell)}); places ${sum((r) => r.wy.places)}, findable ${sum((r) => r.wy.found.filter((x) => x[1]).length)}; first meeting at most ${Math.max(...Q.map((r) => (r.wy.meet ? r.wy.meet.minutes : 99)))} min after the start; the least time to meet someone in a day ${Math.min(...Q.map((r) => r.wy.meetable.least))} h; scripted player ${plays.filter((x) => x.ok).length} of ${plays.length} done, ${Math.min(...plays.filter((x) => x.ok).map((x) => x.minutes)).toFixed(1)} to ${Math.max(...plays.filter((x) => x.ok).map((x) => x.minutes)).toFixed(1)} min; every favour from its words ${sum((r) => r.wy.every.done)} of ${sum((r) => r.wy.every.of)}, ${Math.min(...Q.flatMap((r) => r.wy.every.minutes)).toFixed(1)} to ${Math.max(...Q.flatMap((r) => r.wy.every.minutes)).toFixed(1)} min`);
  fs.mkdirSync(path.join(ROOT, 'shots', 'world-check'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'shots', 'world-check', `way-${a.sweep ? `sweep-${list.length}` : list.join('-')}.json`), JSON.stringify(rows, null, 1));
  process.exit(rows.every((r) => r.wy && r.wy.ok) ? 0 : 1);
}
if (a['animals-only']) {
  // (phase 4b) the animals' and the wild ground detail's checks alone
  let all = true;
  for (const seed of seeds) {
    const w = unpackWorld(packWorld(build(seed)));
    const ac = animalChecks(w), wc = wildChecks(w);
    console.log(`seed ${seed}: ${ac.ok && wc.ok ? 'PASS' : 'FAIL'}`);
    printAnimals(seed, ac, wc);
    all = all && ac.ok && wc.ok;
  }
  process.exit(all ? 0 : 1);
}
if (a['fort-only']) {
  const n = Number(a.sweep || 60), from = Number(a.from || 1000);
  const list = a.seeds ? seeds : Array.from({ length: n }, (_, i) => from + i * 7919 % 100000);
  const rows = [];
  for (const seed of list) {
    let ft, vc, err = null;
    let pc = null, ac = null, wc = null, wy = null;
    try { const w = unpackWorld(packWorld(build(seed))); ft = fortChecks(w); vc = villageChecks(w); pc = peopleChecks(w); ac = animalChecks(w); wc = wildChecks(w); wy = wayChecks(w); } catch (e) { err = String(e.stack || e); }
    rows.push({ seed, ft, vc, pc, ac, wc, wy, err, approach: null });
    if (err) console.log(`seed ${seed}: FAIL ${err}`); else {
      console.log(`seed ${seed}: ${ft.ok && vc.ok && pc.ok && ac.ok && wc.ok && wy.ok ? 'PASS' : 'FAIL'}${ft.ok ? '' : ' (the fort)'}${vc.ok ? '' : ' (the villages)'}${pc.ok ? '' : ' (the people)'}${ac.ok ? '' : ' (the animals)'}${wc.ok ? '' : ' (the wild ground detail)'}${wy.ok ? '' : ' (wayfaring)'}`);
      if (!wy.ok || a.detail) printWay(seed, wy);
      if (!ft.ok || a.detail) printFort(seed, ft);
      if (!vc.ok || a.detail) printVillages(seed, vc);
      if (!pc.ok || a.detail) printPeople(seed, pc);
      if (!ac.ok || !wc.ok || a.detail) printAnimals(seed, ac, wc);
    }
  }
  const okN = rows.filter((r) => r.ft && r.ft.ok && r.vc && r.vc.ok && r.pc && r.pc.ok && r.ac && r.ac.ok && r.wc && r.wc.ok && r.wy && r.wy.ok).length;
  console.log(`\n${okN} of ${rows.length} seeds pass the fort's, the villages', the people's, the animals', the wild ground detail's and wayfaring's checks`);
  {
    const Q = rows.filter((r) => r.wy), sum = (f) => Q.reduce((s2, r) => s2 + f(r), 0), plays = Q.flatMap((r) => r.wy.play);
    console.log(`wayfaring: ${sum((r) => r.wy.favours)} favours on ${Q.length} seeds; fails ${sum((r) => r.wy.fails.length)}; places findable ${sum((r) => r.wy.found.filter((x) => x[1]).length)} of ${sum((r) => r.wy.places)}; scripted player ${plays.filter((x) => x.ok).length} of ${plays.length}; every favour from its words ${sum((r) => r.wy.every.done)} of ${sum((r) => r.wy.every.of)}`);
  }
  {
    const Q = rows.filter((r) => r.ac), sum = (f) => Q.reduce((s2, r) => s2 + f(r), 0);
    console.log(`animals: ${sum((r) => Object.values(r.ac.counts).reduce((x, y) => x + y, 0))} on ${Q.length} seeds; missing kinds or village animals on ${Q.filter((r) => r.ac.missing.length).length}; ${sum((r) => r.ac.samples.samples)} positions sampled: inside a shape ${sum((r) => r.ac.samples.inside)}, too close ${sum((r) => r.ac.samples.overlap)}, in water ${sum((r) => r.ac.samples.water)}, out of place ${sum((r) => r.ac.samples.outside)}, out of the fold at night ${sum((r) => r.ac.samples.unfolded)}; walker ${sum((r) => r.ac.walker.ok)} of ${sum((r) => r.ac.walker.groups)}; same from a fresh start on ${Q.filter((r) => r.ac.same).length} of ${Q.length}; wild detail fails ${rows.filter((r) => r.wc).reduce((s2, r) => s2 + r.wc.fails.length, 0)}`);
  }
  {
    const Q = rows.filter((r) => r.pc), sum = (f) => Q.reduce((s2, r) => s2 + f(r), 0);
    console.log(`people: ${sum((r) => r.pc.persons)} on ${Q.length} seeds; ${sum((r) => r.pc.plans.routes)} routes walked (${sum((r) => r.pc.plans.fails.length)} failed); ${sum((r) => r.pc.samples.samples)} positions sampled: inside a shape ${sum((r) => r.pc.samples.inside)}, in deep water ${sum((r) => r.pc.samples.water)}, off a deck ${sum((r) => r.pc.samples.deck)}, on one spot ${sum((r) => r.pc.samples.same)}; guardless hours at the gate ${sum((r) => r.pc.samples.guardGate)}, on the wall ${sum((r) => r.pc.samples.guardWall)}; windows wrong ${sum((r) => r.pc.samples.lit)}; same from a fresh start on ${Q.filter((r) => r.pc.same).length} of ${Q.length}`);
  }
  const V = rows.filter((r) => r.vc);
  const sum = (f) => V.reduce((s2, r) => s2 + f(r), 0);
  console.log(`villages: all three placed, each a different pattern, on ${V.filter((r) => r.vc.placed && r.vc.distinct).length} of ${V.length}; houses ${Math.min(...V.flatMap((r) => r.vc.counts.map((c) => c.houses)))} to ${Math.max(...V.flatMap((r) => r.vc.counts.map((c) => c.houses)))}; roads walked ${sum((r) => r.vc.roadsWalked.roads)} (${sum((r) => r.vc.roadsWalked.failed.length)} blocked), bridges ${sum((r) => r.vc.roadsWalked.bridges)}, footpaths ${sum((r) => r.vc.pathsWalked.paths)} (${sum((r) => r.vc.pathsWalked.failed.length)} blocked); overlaps ${sum((r) => r.vc.overlaps.length)}, bad doors ${sum((r) => r.vc.doors.length)}`);
  console.log(`village walkers: places reached and back out ${sum((r) => r.vc.walkers.reduce((s2, x) => s2 + x.out, 0))} of ${sum((r) => r.vc.walkers.reduce((s2, x) => s2 + x.targets, 0))}; random walks through a wall ${sum((r) => r.vc.walkers.reduce((s2, x) => s2 + (x.walks ? x.walks.through : 0), 0))}, stuck ${sum((r) => r.vc.walkers.reduce((s2, x) => s2 + (x.walks ? x.walks.stuck : 0), 0))}, inside ${sum((r) => r.vc.walkers.reduce((s2, x) => s2 + (x.walks ? x.walks.inside : 0), 0))} (of ${V.length * 3000})`);
  console.log(`walker places reached and back out: ${rows.filter((r) => r.ft).reduce((s, r) => s + r.ft.walker.out, 0)} of ${rows.filter((r) => r.ft).reduce((s, r) => s + r.ft.walker.targets, 0)}; random walks through a wall ${rows.filter((r) => r.ft).reduce((s, r) => s + r.ft.walks.through, 0)}, stuck ${rows.filter((r) => r.ft).reduce((s, r) => s + r.ft.walks.stuck, 0)}, inside stone ${rows.filter((r) => r.ft).reduce((s, r) => s + r.ft.walks.inside, 0)} (of ${rows.filter((r) => r.ft).length * 1000})`);
  fs.mkdirSync(path.join(ROOT, 'shots', 'world-check'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'shots', 'world-check', `fort-sweep-${list.length}.json`), JSON.stringify(rows, null, 1));
  process.exit(okN === rows.length ? 0 : 1);
}

const results = [];
for (const seed of seeds) {
  const t0 = performance.now();
  const w1 = build(seed);
  const buildMs = performance.now() - t0;
  const h1 = worldHash(packWorld(w1)), h2 = worldHash(packWorld(build(seed)));
  const w = unpackWorld(packWorld(w1));
  const r = {
    seed, buildMs: Math.round(buildMs), hash: h1, same: h1 === h2,
    reach: reach(w), roads: roads(w), rivers: rivers(w), trees: trees(w),
    lakes: w.lakes.length, mainLake: w.sites.lake.area, villages: w.sites.villages.length, viewpoints: w.sites.viewpoints.length,
  };
  r.sky = sky(w, seed, nPts, nRoad);
  r.far = farRead(w, w1);
  r.vread = villageRead(w);
  // (phase 3a) the fort's checks (8); (phase 3b) the villages' (9)
  r.fort = fortChecks(w);
  r.vil = villageChecks(w);
  // (phase 4a) the people's (11)
  r.ppl = peopleChecks(w);
  // (phase 4b) the animals' (12) and the wild ground detail's (13)
  r.ani = animalChecks(w);
  r.wild = wildChecks(w);
  // (phase 5a) wayfaring's (14)
  r.way = wayChecks(w);
  r.ok = r.way.ok && r.ani.ok && r.wild.ok && r.same && r.reach.sites.every((s) => s.ok) && r.roads.ok && r.rivers.every((v) => v.ok) && r.trees.ok && r.sky.ok && r.far.ok && r.villages === 3 && r.viewpoints === 4 && r.fort.ok && r.vil.ok && r.vread.ok && r.ppl.ok;
  results.push(r);
  const pc = (x) => `${(100 * x).toFixed(1)}%`;
  console.log(`seed ${seed}: ${r.ok ? 'PASS' : 'FAIL'}  build ${r.buildMs} ms, hash ${h1} ${r.same ? '(same twice)' : `!= ${h2}`}`);
  console.log(`  reach: ${r.reach.sites.map((s) => `${s.name} ${s.ok ? 'ok' : 'NOT REACHED'}`).join(', ')}`);
  console.log(`  roads: steepest ${pc(r.roads.steep)} (limit ${pc(SCALE.road.maxSlope)}) at ${r.roads.where}, deepest water ${r.roads.deep.toFixed(2)} m (ford ${SCALE.river.ford} m)`);
  console.log(`  rivers: ${r.rivers.map((v) => `${v.n} m to the ${v.end}${v.rises ? `, rises ${v.rises}x` : ''}`).join('; ')}`);
  console.log(`  trees: ${r.trees.count}, in water ${r.trees.wet}, on a road ${r.trees.road}; lakes ${r.lakes} (main ${r.mainLake} m2), villages ${r.villages}, viewpoints ${r.viewpoints}`);
  console.log(`  sky: median ${pc(r.sky.median)}, under 15% ${pc(r.sky.low)}, 10th percentile ${pc(r.sky.p10)}, road views median ${pc(r.sky.roadMedian)} (${r.sky.views} views)`);
  for (const s of r.far.spots) {
    const fs2 = Object.entries(s.features).map(([k, v]) => `${k} ${v ? `${v.step}${v.ok ? '' : ' TOO FAINT'}` : 'not in view'}`).join(', ');
    console.log(`  far, from the ${s.name}: ${fs2}${s.range ? `; range lit/shaded ${s.range.step !== undefined ? `${s.range.step} (${s.range.material})` : s.range.note}${s.range.ok ? '' : ' TOO FAINT'}` : ''}`);
  }
  printFort(seed, r.fort);
  printVillages(seed, r.vil);
  printPeople(seed, r.ppl);
  printAnimals(seed, r.ani, r.wild);
  printWay(seed, r.way);
  console.log(`  villages from the viewpoints: ${r.vread.villages.map((x) => x.viewpoint ? `village ${x.village} (${x.pattern}) from viewpoint ${x.viewpoint}, ${x.dist} m: step ${x.step}${x.step > STEP ? '' : ' TOO FAINT'}, ${x.lights} light cells at night${x.lights >= 2 ? '' : ' (TOO FEW)'}` : `village ${x.village}: ${x.note}`).join('; ')}`);
}
const out = a.out || path.join(ROOT, 'shots', 'world-check', `world-check-${seeds.join('-')}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 1));
const pc = (x) => `${(100 * x).toFixed(1)}%`;
console.log('\n| seed | same twice | sites reached | steepest road | rivers downhill to lake/sea | trees in water / on roads | sky median | views under 15% | far readability: weakest step | the fort | the villages | villages from a viewpoint (step, lights) | result |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of results) {
  const steps = r.far.spots.flatMap((s) => [...Object.values(s.features).filter(Boolean).map((v) => v.step), ...(s.range && s.range.step !== undefined ? [s.range.step] : [])]);
  console.log(`| ${r.seed} | ${r.same ? 'yes' : 'NO'} | ${r.reach.sites.filter((s) => s.ok).length} of ${r.reach.sites.length} | ${pc(r.roads.steep)} | ${r.rivers.filter((v) => v.ok).length} of ${r.rivers.length} | ${r.trees.wet} / ${r.trees.road} | ${pc(r.sky.median)} | ${pc(r.sky.low)} | ${r.far.ok ? 'pass' : 'FAIL'}, ${Math.min(...steps)} | ${r.fort.ok ? 'pass' : 'FAIL'}: ${r.fort.walker.out} of ${r.fort.walker.targets} places, walks ${r.fort.walks.through + r.fort.walks.stuck + r.fort.walks.inside} bad | ${r.vil.ok ? 'pass' : 'FAIL'}: ${r.vil.walkers.reduce((s2, x) => s2 + x.out, 0)} of ${r.vil.walkers.reduce((s2, x) => s2 + x.targets, 0)} places, walks ${r.vil.walkers.reduce((s2, x) => s2 + (x.walks ? x.walks.through + x.walks.stuck + x.walks.inside : 0), 0)} bad | ${r.vread.villages.map((x) => (x.viewpoint ? `${x.step}, ${x.lights}` : 'none')).join('; ')} | ${r.ok ? 'pass' : 'FAIL'} |`);
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
