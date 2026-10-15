// (phase 6.1) The numbers for docs/facts.md, each counted here from the
// game's own code, never typed in by hand:
//  --world   what a world holds (trees, bushes, copses, wild ground detail,
//            people by role, animals by kind, buildings, villages, bridges,
//            roads, viewpoints, places and favours), built in Node exactly
//            as the game builds it: the default seed, and the mean, least
//            and most over the 60 seeds the world check sweeps; and how
//            long each stage of the build takes on this machine
//  --code    the source: lines and files by area, the tools, the glyphs,
//            the palette, the sounds, the music, the spoken lines
//  --size    the built single file, and what share of it each area is
//            (esbuild's own account of the bytes each source adds)
//  --git     commits, and days since the first commit
//  --screen  the cells on screen at each detail level, for a few windows
//  --rays    the rays a frame casts, from the renderer itself, on the
//            heaviest camera and the spawn's (Node, 360 x 112)
// With none, all six. To shots/facts/facts.json and printed as tables.
//
//   node tools/facts.mjs [--world] [--code] [--size] [--git] [--sweep 60]
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { args, ROOT } from './lib/serve.mjs';

const a = args();
const all = !a.world && !a.code && !a.size && !a.git && !a.screen && !a.rays;
const out = {};
const outFile = path.join(ROOT, 'shots', 'facts', 'facts.json');
const kept = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
const say = (s) => console.log(s);

// ---- a world ----------------------------------------------------------------------------
async function worldFacts() {
  const { generateWorld, DEFAULT_SEED } = await import('../src/world/gen/world.js');
  const { packWorld, unpackWorld } = await import('../src/world/pack.js');
  const { buildPeople } = await import('../src/world/people/people.js');
  const { buildAnimals } = await import('../src/world/animals/build.js');
  const { KIND_NAMES } = await import('../src/world/animals/kinds.js');
  const { placesOf } = await import('../src/game/places.js');
  const { buildFavours } = await import('../src/game/favours.js');
  const polyLen = (xs, zs) => { let L = 0; for (let i = 1; i < xs.length; i++) L += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]); return L; };
  const count = (seed, stages) => {
    const g = generateWorld(seed);
    let r, last = performance.now(), stage = null;
    const t0 = last;
    while (!(r = g.next()).done) {
      const now = performance.now();
      if (r.value.stage !== stage) { if (stage && stages) stages[stage] = (stages[stage] || 0) + now - last; last = now; stage = r.value.stage; }
    }
    if (stages) { stages[stage] = (stages[stage] || 0) + performance.now() - last; stages.total = (stages.total || 0) + performance.now() - t0; }
    const w = unpackWorld(packWorld(r.value));
    const P = buildPeople(w), A = buildAnimals(w, P), places = placesOf(w), fav = buildFavours(w, P, places);
    const roles = {};
    for (const p of P.persons) roles[p.role] = (roles[p.role] || 0) + 1;
    const animals = {};
    for (let k = 0; k < KIND_NAMES.length; k++) animals[KIND_NAMES[k]] = A.count[k] || 0;
    const V = w.sites.villages.map((v) => v.plan);
    const fort = w.fortDesc.pieces;
    const kinds = {};
    for (const p of fort) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
    const houses = V.reduce((s, p) => s + p.houses.length, 0), barns = V.reduce((s, p) => s + (p.barns || []).length, 0);
    const chapels = V.filter((p) => p.chapel).length, shelters = V.filter((p) => p.shelter).length;
    const fortBuildings = (kinds.keep || 0) + (kinds.tower || 0) + (kinds.house || 0);
    const wild = (w.times && w.times.wildCounts) || {};
    const torches = w.objects.torches.length;
    return {
      seed,
      trees: w.objects.trees.length, bushes: w.objects.bushes.length, copses: w.sites.copses.length,
      boulders: wild.boulder || 0, outcrops: wild.outcrop || 0, logs: wild.log || 0, stumps: wild.stump || 0, reedBeds: wild.reeds || 0,
      people: P.persons.length, roles, animals, animalsTotal: Object.values(animals).reduce((s, x) => s + x, 0),
      villages: V.length, villageHouses: houses, barns, chapels, marketShelters: shelters, jetties: V.filter((p) => p.jetty).length,
      fortTowers: kinds.tower || 0, fortKeep: kinds.keep || 0, fortHouses: kinds.house || 0,
      buildings: houses + barns + chapels + fortBuildings,
      bridges: w.sites.bridges.length, roadsKm: w.roads.reduce((s, rd) => s + polyLen(rd.x, rd.z), 0) / 1000,
      viewpoints: w.sites.viewpoints.length, lakes: w.lakes.length, rivers: w.rivers.length,
      places: places.list.length, favours: fav.list.length, torches,
    };
  };
  const stages = {};
  const d = count(DEFAULT_SEED, stages);
  out.world = { seed3: d, stages3: Object.fromEntries(Object.entries(stages).map(([k, v]) => [k, Math.round(v)])) };
  say(`seed ${DEFAULT_SEED}: ${JSON.stringify(d)}`);
  say(`build stages (ms, this machine): ${JSON.stringify(out.world.stages3)}`);
  const n = Number(a.sweep || 60);
  if (n) {
    const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919 % 100000);
    const rows = [];
    const st = {};
    for (const s of seeds) { rows.push(count(s, st)); process.stdout.write('.'); }
    say('');
    const flat = (r) => ({ ...r, ...Object.fromEntries(Object.entries(r.roles).map(([k, v]) => [`role ${k}`, v])), ...Object.fromEntries(Object.entries(r.animals).map(([k, v]) => [`animal ${k}`, v])) });
    const F = rows.map(flat);
    const keys = Object.keys(F[0]).filter((k) => typeof F[0][k] === 'number' && k !== 'seed');
    const stats = {};
    for (const k of keys) {
      const xs = F.map((r) => r[k] || 0);
      stats[k] = { mean: xs.reduce((s, x) => s + x, 0) / xs.length, min: Math.min(...xs), max: Math.max(...xs) };
    }
    out.world.sweep = { seeds: seeds.length, stats, buildMeanMs: Math.round(st.total / seeds.length) };
    say(`\n| over ${n} seeds | mean | least | most | seed 3 |\n|---|---|---|---|---|`);
    const d3 = flat(d);
    for (const k of keys) say(`| ${k} | ${stats[k].mean.toFixed(stats[k].max < 20 ? 2 : 1)} | ${stats[k].min.toFixed(k === 'roadsKm' ? 2 : 0)} | ${stats[k].max.toFixed(k === 'roadsKm' ? 2 : 0)} | ${typeof d3[k] === 'number' ? +d3[k].toFixed(2) : '-'} |`);
  }
}

// ---- the code -------------------------------------------------------------------------------
async function codeFacts() {
  const walk = (d, f = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, f); else f.push(p); } return f; };
  const lines = (p) => fs.readFileSync(p, 'utf8').split('\n').length - (fs.readFileSync(p, 'utf8').endsWith('\n') ? 1 : 0);
  const src = walk(path.join(ROOT, 'src')).filter((p) => /\.(js|html)$/.test(p));
  const areaOf = (p) => {
    const r = path.relative(path.join(ROOT, 'src'), p);
    if (r.startsWith('scene/') || ['resolve.js', 'render-stripe.js', 'contract.js', 'glyphs.js', 'worker.js'].includes(r) || r.startsWith('present/')) return 'renderer';
    if (r === 'look.js' || r.startsWith('look/')) return 'look data';
    if (r.startsWith('world/gen/')) return 'world generator';
    if (r.startsWith('world/people/')) return 'people';
    if (r.startsWith('world/animals/')) return 'animals';
    if (r.startsWith('world/')) return 'world, kit and scenes';
    if (r.startsWith('game/')) return 'wayfaring';
    if (r.startsWith('sound/')) return 'sound and music';
    if (r.startsWith('front/')) return 'front page';
    return 'page, menus and input';
  };
  const byArea = {};
  let total = 0;
  for (const p of src) { const n = lines(p), k = areaOf(p); byArea[k] = byArea[k] || { files: 0, lines: 0 }; byArea[k].files++; byArea[k].lines += n; total += n; }
  const tools = fs.readdirSync(path.join(ROOT, 'tools')).filter((p) => p.endsWith('.mjs')).map((p) => path.join(ROOT, 'tools', p));
  const toolLib = walk(path.join(ROOT, 'tools', 'lib')).filter((p) => p.endsWith('.mjs'));
  const toolLines = [...tools, ...toolLib].reduce((s, p) => s + lines(p), 0);
  const { GLYPHS } = await import('../src/glyphs.js');
  const { LOOK } = await import('../src/look.js');
  const { MAT_NAMES } = await import('../src/contract.js');
  // the palette: the distinct colours the look data names (every hex colour in look.js and its parts)
  const lookSrc = [path.join(ROOT, 'src/look.js'), ...(fs.existsSync(path.join(ROOT, 'src/look')) ? walk(path.join(ROOT, 'src/look')) : [])].map((p) => fs.readFileSync(p, 'utf8')).join('\n');
  const hexes = new Set((lookSrc.match(/#[0-9a-fA-F]{6}\b/g) || []).map((h) => h.toLowerCase()));
  const { SOUND } = await import('../src/sound/palette.js');
  const { LINES } = await import('../src/world/people/lines.js');
  const W = await import('../src/game/words.js');
  // the kinds of sound: each bed and each event the palette makes (the
  // footsteps once for each ground they sound on)
  const S = SOUND;
  const kinds = ['wind', 'rain', ...Object.keys(S.water), ...['song', 'chorus', 'gull', 'crow', 'finch'].filter((k) => S.birds[k]),
    ...Object.keys(S.animals), ...['meadow', 'road', 'sand', 'stone', 'timber', 'water', 'snow', 'splash', 'creak', 'land', 'echo'].filter((k) => S.steps[k]).map((k) => `step ${k}`),
    ...['torch', 'hearth'].filter((k) => S.fire[k]), 'well', 'bell', 'latch'];
  // spoken lines: what someone can say, the greetings and every line of the
  // favours' exchanges (their asks, thanks and answers, the hails, the
  // first meeting's and the lantern's), counted as sentences in the words
  const said = (v, key) => (typeof v === 'string' ? (['id', 'thing', 'short', 'shape', 'lost', 'kind', 'name'].includes(key) ? 0 : 1)
    : Array.isArray(v) ? v.reduce((s2, x) => s2 + said(x, key), 0) : v && typeof v === 'object' ? Object.entries(v).reduce((s2, [k, x]) => s2 + said(x, k), 0) : 0);
  const favourLines = ['CARRY', 'FIND', 'TELL', 'WAITING', 'BACK', 'AND_ME', 'LATER', 'YES', 'FIRST', 'LANTERN_GIFT', 'HAILS'].reduce((s2, k) => s2 + said(W[k], k), 0);
  out.code = {
    sourceFiles: src.length, sourceLines: total, byArea,
    tools: tools.length, toolLibs: toolLib.length, toolLines,
    glyphs: GLYPHS.length, materials: MAT_NAMES.length, paletteHexColours: hexes.size,
    soundKinds: kinds.length, soundKindNames: kinds,
    musicTracks: SOUND.music.tracks.length, greetingLines: Object.values(LINES).reduce((s2, x) => s2 + (Array.isArray(x) ? x.length : 0), 0), favourLines,
  };
  say(JSON.stringify(out.code, null, 1));
}

// ---- the size ----------------------------------------------------------------------------------
async function sizeFacts() {
  const esbuild = await import('esbuild');
  const meta = async (entry) => (await esbuild.build({ entryPoints: [path.join(ROOT, entry)], bundle: true, format: 'esm', minify: true, write: false, metafile: true, define: { __WORKER_SOURCE__: '""' } })).metafile;
  const page = await meta('src/main.js'), worker = await meta('src/worker.js');
  const group = (m) => {
    const o = Object.values(m.outputs)[0], g = {};
    for (const [f, v] of Object.entries(o.inputs)) {
      const r = f.replace(/^src\//, '');
      const k = r.startsWith('scene/') || r.startsWith('present/') || /^(resolve|render-stripe|contract|glyphs|worker)\.js$/.test(r) ? 'renderer'
        : r === 'look.js' || r.startsWith('look/') ? 'look data' : r.startsWith('world/gen/') ? 'world generator' : r.startsWith('world/people/') ? 'people'
          : r.startsWith('world/animals/') ? 'animals' : r.startsWith('world/') ? 'world, kit and scenes' : r.startsWith('game/') ? 'wayfaring' : r.startsWith('sound/') ? 'sound and music' : 'page, menus and input';
      g[k] = (g[k] || 0) + v.bytesInOutput;
    }
    return { total: o.bytes, g };
  };
  const built = fs.statSync(path.join(ROOT, 'play.html')).size, html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8').length;
  out.size = { playHtmlBytes: built, page: group(page), worker: group(worker), htmlAndCss: html, front: fs.statSync(path.join(ROOT, 'index.html')).size };
  say(JSON.stringify(out.size, null, 1));
}

// ---- git -------------------------------------------------------------------------------------
function gitFacts() {
  const commits = Number(execSync('git rev-list --count HEAD', { cwd: ROOT }).toString().trim());
  const first = execSync('git log --reverse --format=%aI', { cwd: ROOT }).toString().split('\n')[0];
  const lastC = execSync('git log -1 --format=%aI', { cwd: ROOT }).toString().trim();
  out.git = { commits, first, last: lastC, days: Math.round((new Date(lastC) - new Date(first)) / 864e5 * 10) / 10 };
  say(JSON.stringify(out.git));
}

// ---- the screen ----------------------------------------------------------------------------
async function screenFacts() {
  const { layout, TARGETS } = await import('../src/app/grid.js');
  const names = ['coarse', 'medium', 'fine', 'finest'];
  out.screen = [];
  for (const [w, h, dpr] of [[1440, 900, 1], [1440, 900, 2], [1280, 720, 1], [1920, 1080, 1], [2560, 1440, 2], [3840, 2160, 1.5]]) {
    for (let p = 0; p < TARGETS.length; p++) { const g = layout(p, w, h, dpr); out.screen.push({ window: `${w} x ${h} at ${dpr}`, level: names[p], target: TARGETS[p], cols: g.cols, rows: g.rows, cells: g.cells }); }
  }
  for (const r of out.screen) say(`${r.window}: ${r.level} ${r.cols} x ${r.rows} = ${r.cells} cells (aims at ${r.target})`);
}

// ---- the rays ---------------------------------------------------------------------------------
async function rayFacts() {
  const { generateWorld, DEFAULT_SEED } = await import('../src/world/gen/world.js');
  const { packWorld, unpackWorld } = await import('../src/world/pack.js');
  const { createCpuBackend } = await import('../src/scene/cpu/backend.js');
  const { HIT_STRIDE, REC, MAT_NONE } = await import('../src/contract.js');
  const { LOOK } = await import('../src/look.js');
  const { groundAt } = await import('../src/world/objects.js');
  const g = generateWorld(DEFAULT_SEED); let r; while (!(r = g.next()).done);
  const w = unpackWorld(packWorld(r.value)), be = createCpuBackend(w);
  const cols = 360, rows = 112, n = cols * rows, hits = new Uint8Array(n * HIT_STRIDE), DEG = Math.PI / 180;
  out.rays = [];
  for (const name of ['main lake shore', 'spawn view', 'inside a forest stand']) {
    const c = w.cameras.find((q) => q.name === name);
    const feet = c.y !== undefined ? c.y - 1.7 : Math.max(groundAt(w.terrain, c.x, c.z), groundAt({ ground: w.terrain.levels[0].H, N: w.terrain.N, NN: w.terrain.NN }, c.x, c.z));
    const f = { seq: 1, cam: { x: c.x, y: feet + 1.7, z: c.z, yaw: c.yaw * DEG, pitch: c.pitch * DEG }, cols, rows, fovY: LOOK.fovY * DEG, aspect: cols / (2 * rows), hour: LOOK.hours.day, t: 0, day: 0 };
    for (let k = 0; k < 400; k++) { be.render(f, 0, cols, hits); if (be.settled) break; }
    let mirrored = 0, under = 0;
    for (let i = 0; i < n; i++) { if (hits[i * HIT_STRIDE + REC] !== MAT_NONE) mirrored++; if (hits[i * HIT_STRIDE + 2 * REC] !== MAT_NONE) under++; }
    out.rays.push({ camera: name, cells: n, direct: n, mirrored, intoWater: under, total: n + mirrored + under });
    say(`${name}: ${n} direct rays, ${mirrored} mirrored in water, ${under} through water to the bed: ${n + mirrored + under} in all (360 x 112)`);
  }
}

if (all || a.git) gitFacts();
if (all || a.screen) await screenFacts();
if (all || a.rays) await rayFacts();
if (all || a.code) await codeFacts();
if (all || a.size) await sizeFacts();
if (all || a.world) await worldFacts();
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ ...kept, ...out, when: new Date().toISOString() }, null, 1));
say(`\n${path.relative(ROOT, outFile)}`);
