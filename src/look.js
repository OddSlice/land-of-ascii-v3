// The look of Land of Ascii v3, in one data file.
//
// Everything a person tunes by eye lives here: colours per time of day,
// each material's glyph family and ladder, how glyphs are inked, haze, light
// levels. Renderer code reads this file and never hard-codes a colour.
//
// Rules this file must keep (from the brief and reference/RESEARCH.md):
// - the cell's background carries the lit colour of the surface; the glyph is a
//   slightly lighter or darker tint of the same hue;
// - each family is a ladder from light marks to heavy marks; light picks the
//   rung (brighter surface, lighter mark), so at night the heavy rungs carry
//   what light there is;
// - muted: nothing fully saturated, nothing pure black, every channel clamped;
// - lit and shadowed grass differ mainly in brightness.
//
// Colours are sRGB hex. Three keyframes (day, dusk, night) are blended by the
// height of the sun, so time can run between them.

// A look rule in use: the frame's choice, else its default (LOOK.choices).
export function ruleOf(look, name) { return look && look[name] !== undefined ? look[name] : LOOK.choices[name].default; }

export const LOOK = {
  // Camera: vertical field of view in degrees. The eye is 1.7 m up (world/layout.js).
  fovY: 60,

  // The look candidates (phase 0c), chosen live in the look panel (L), by URL
  // (?cloud=A&meadow=0&shallows=warm) or with lab.setLook(). Each has
  // its options with a short name for the panel, the default, and the key
  // that cycles it. Every candidate varies only with world position or an
  // object's own identity, never with the screen or the clock.
  // Locked in phase 1: the defaults are the settled look (clouds B, meadow
  // 2, blue shallows); the other options stay for comparison. (The conifers
  // had a choice too, until after phase 3a: only the tidy tiers are kept.)
  choices: {
    cloud:    { label: 'clouds',   key: '8', default: 'B', options: { A: 'cumulus', B: 'banks' } },
    meadow:   { label: 'meadow',   key: '9', default: 2,   options: { 0: 'none', 1: 'soft patches', 2: 'strong patches' } },
    shallows: { label: 'shallows', key: '0', default: 'blue', options: { warm: 'warm bed', blue: 'even blue' } },
    // Phase 2a's rules, each with phase 1's beside it for comparison:
    // `air`, aerial perspective and the far-land rules (air, below; `far`;
    // the backdrop beyond the north and east edges); `night`, the moon's
    // phases, moonlight and starlight, and dawn (`moonKeys`).
    air:      { label: 'distance', key: '5', default: 'aerial', options: { p1: 'phase 1 haze', aerial: 'aerial perspective, far land' } },
    night:    { label: 'night',    key: '6', default: 'moon', options: { p1: 'phase 1 night', moon: 'moon phases, dawn' } },
  },

  // Hours the 1, 2, 3, 4 keys jump to (dawn: the sun as low as at dusk).
  hours: { day: 14.0, dusk: 17.85, night: 23.0, dawn: 6.15 },

  // The day the page opens on (?day= for another): the moon's phase follows
  // the day count, a month of 29.53 days. Day 0 has a bright moon, high in
  // the south-east late at night, as in phases 0a to 1; about day 15 a dark one.
  moon: { startDay: 0, month: 29.53,
    // the moon disc is drawn only above this share lit, at least `disc` bright
    showAt: 0.03, disc: 0.3 },

  // Clamps applied to every colour after lighting, haze and ink.
  clamp: {
    min: 10,        // no channel below this: nothing pure black
    max: 236,       // no channel above this
    maxSat: 0.62,   // (max - min) / max of a colour is pulled down to this
  },

  // Ordered dither between rungs of a ladder, in rungs (0 = hard steps).
  dither: 0.7,

  // Light to colour: a surface's colour sits between its shade and lit
  // colours at light^curve, so shadows deepen faster than highlights.
  curve: 1.45,

  // How much a material's detail (its tone) moves the rung up or down the
  // ladder, so neighbouring cells do not all wear the same glyph. The detail
  // is fixed to the land, so this does not crawl as you walk.
  toneRung: 0.45,

  // Haze (phase 1, air 'p1'): the share of the horizon colour mixed in at
  // distance d is 1 - exp(-d / dist), times `max`.
  // Glyph contrast fades with the same haze, times `glyphFade`.
  haze: { glyphFade: 0.9 },

  // Aerial perspective (phase 2a, air 'aerial'). Air is thickest low down and
  // thins with height: at height y its density is exp(-(y - base) / height)
  // (metres; `base` is the generated world's sea level), plus a thin share
  // (`uniform`) that is the same at every height, so far land still recedes.
  // A ray's haze is the air it passes through, in metres of air as dense as
  // at the base. Each keyframe's `air` turns that into two shares: `chroma`,
  // how far colour shifts toward the horizon tone (over `distC` metres), and
  // `lum`, how far light and dark close up (over `dist`), which stays well
  // short of 1, so lit and shaded sides, snow, rock, forest and water remain
  // apart out to the view distance while their colours cool.
  air: { base: 20, height: 220, uniform: 0.05 },

  // Far land (phase 2a, air 'aerial'). Past `fade[0]` metres the large forms
  // gain light-and-shade contrast (`form`, at full strength from `fade[1]`),
  // as fine ground detail fades; rock shows strata and gullies as broad
  // bands (`bands`: how far they move its tone); snow and rock end at a clear
  // line, from the coarser levels' weights past `edgeFrom` metres; a skyline's
  // top cell fades into the sky by how much of it the land covers.
  // `gully`: how much a gully (where rain gathers on the range) darkens rock
  // and snow; `strata`: the strata bands' spacing in metres of height.
  // (phase 2b) Each keyframe's `light.far` is the share of direct light far
  // land keeps (faded in over `fade`): at dusk the range stands as a dark
  // silhouette against the sky, not a pale lit face. `warm`: [how much less,
  // from, to]: lit ground high up keeps more of its own colour against the
  // air's (the share by its light, over that many metres above the sea), so
  // far lit rock stays warm tan instead of turning cool grey.
  far: { fade: [300, 900], form: 0.55, bands: 0.5, gully: 0.55, strata: 38, edgeFrom: 250, warm: [0.75, 60, 260] },

  // Glyph families, light to heavy. Any character works; the atlas draws the
  // shade blocks (░ ▒ ▓ █) itself when the font gets them wrong at small sizes.
  // `ink`: how far the glyph colour sits from the background, as a share of
  // the background: negative is darker, positive lighter. `lit` applies on
  // fully lit surfaces, `dark` in full shadow and at night; in between it is
  // blended by light. `floor` keeps glyphs visible on near-black cells.
  // `emissive`: the ladder runs the other way (a brighter star or flame is a
  // heavier mark), because the mark is the light.
  // `tone`: how strongly the material's detail (patches, joints, strata)
  // changes its colour. `curve`: this material's own light curve (see below).
  // `toneRung`: this material's own share of tone that moves the rung (else
  // the global one): low where tone varies a lot across a small shape, so it
  // shows as colour rather than as glyphs that crawl.
  materials: {
    sky:     { glyphs: ' ',          ink: { lit: 0.00, dark: 0.00 } },
    cloud:   { glyphs: ' .:░▒',      ink: { lit: -0.07, dark: 0.12 } },
    sun:     { glyphs: '@',          ink: { lit: -0.06, dark: -0.06 }, emissive: true },
    moon:    { glyphs: '@',          ink: { lit: -0.10, dark: -0.10 }, emissive: true },
    star:    { glyphs: '.+*',        ink: { lit: 0.9, dark: 0.9 }, emissive: true },
    grass:   { glyphs: ',:;"+*%#',   ink: { lit: -0.30, dark: 0.50 }, tone: 0.20 },
    dirt:    { glyphs: '.:-=+#',     ink: { lit: -0.26, dark: 0.48 }, tone: 0.10 },
    sand:    { glyphs: '.,:;=+',     ink: { lit: -0.24, dark: 0.46 }, tone: 0.08 },
    rock:    { glyphs: ':=%#▒▓',     ink: { lit: -0.26, dark: 0.48 }, tone: 0.14, curve: 2.1 },
    snow:    { glyphs: '.-=+*',      ink: { lit: -0.14, dark: 0.36 }, tone: 0.06 },
    water:   { glyphs: '.:-=',       ink: { lit: 0.12, dark: 0.34 }, tone: 0.0 },
    stone:   { glyphs: ':=#▒▓█',     ink: { lit: -0.24, dark: 0.46 }, tone: 0.18 },
    conifer: { glyphs: ':^*%#&▒',    ink: { lit: -0.28, dark: 0.50 }, tone: 0.14, toneRung: 0.12 },
    trunk:   { glyphs: ':|!I#',      ink: { lit: -0.28, dark: 0.46 }, tone: 0.22 },
    bush:    { glyphs: ':o%&@',      ink: { lit: -0.28, dark: 0.50 }, tone: 0.10 },
    wood:    { glyphs: ':|!I',       ink: { lit: -0.15, dark: 0.30 } },
    flame:   { glyphs: '*^&@',       ink: { lit: 0.25, dark: 0.25 }, emissive: true },
    bed:     { glyphs: '.,:;',       ink: { lit: -0.20, dark: 0.40 }, tone: 0.10 },
    floor:   { glyphs: '.,:;+%',     ink: { lit: -0.26, dark: 0.48 }, tone: 0.16 },
    foam:    { glyphs: '.:;=',       ink: { lit: -0.10, dark: 0.30 }, tone: 0 },
    // phase 3a, the building kit (stone in blocks is `stone`, above)
    timber:  { glyphs: '.-=#H',      ink: { lit: -0.26, dark: 0.46 }, tone: 0.16 },
    plaster: { glyphs: '.,:;=',      ink: { lit: -0.16, dark: 0.36 }, tone: 0.08 },
    roof:    { glyphs: ':^=#%',      ink: { lit: -0.26, dark: 0.48 }, tone: 0.16 },
    yard:    { glyphs: '.,:-=',      ink: { lit: -0.24, dark: 0.46 }, tone: 0.10 },
    window:  { glyphs: ':=#▓',       ink: { lit: 0.22, dark: 0.22 }, emissive: true },
    // (after phase 3a) the fort's dressed stone: paler than the lab's wall
    // and the tan rock, with mortar joints that darken it strongly (tone),
    // so the walls read as built from blocks from further off
    masonry: { glyphs: ':=#▒▓█',     ink: { lit: -0.24, dark: 0.46 }, tone: 0.42 },
    // the dark down a well's shaft: nearly black at every hour
    shaft:   { glyphs: ' .:',        ink: { lit: 0.10, dark: 0.10 } },
  },

  // The coast (phase 2a, the generated world): a darker wet band where sand
  // meets water (`wet.sea`, metres wide; at a lake, phase 2b, the ground up
  // to `wet.lake.rise` metres above the water, so the band is wide on a
  // gentle shore and gone on a steep bank, at most `wet.lake.max` metres),
  // drawn in the bed's colours; a broken foam line in the water that runs up and back
  // (`reach` metres out from the shore at its highest, `swing` more at its
  // lowest, over `period` seconds, `width` metres either side of its line,
  // at `strength`), a pure function of position and time, faded by how much
  // of a cell's footprint it covers; and on the open sea a gentle swell
  // ([length m, direction deg, speed m/s, height m] as the ripples), faded
  // like them as a cell's footprint passes its length.
  coast: {
    wet: { sea: 2.2, lake: { rise: 0.05, max: 0.5 } },
    foam: {
      sea:  { reach: 1.2, swing: 1.8, period: 9, width: 0.55, strength: 0.95 },
      lake: { reach: 0.3, swing: 0.4, period: 6, width: 0.22, strength: 0.3 },
    },
    swell: [[64, 52, 7, 0.28], [118, 38, 10, 0.45]],
    swellFade: [0.25, 0.8],
  },

  // Water. Each water cell mixes what its ray sees reflected off the surface
  // with the bed seen through the water, by the Fresnel share. Ripples tilt
  // both rays; they never draw wave glyphs.
  water: {
    ior: 1.33,                       // bends the ray toward the bed
    fresnel: { r0: 0.1, power: 4, max: 0.9 },    // Schlick, with a stylised floor and cap
    absorb: 1.1,                     // metres of water that take the bed most of the way to deep water
    warm: 0.2,                       // how far the bed is tinted toward the shallow colour
    tint: 0.4,                       // the least share of deep-water colour, even in the shallows
    torchSurface: 0.5,               // torchlight on the surface itself
    blueDepth: 0.5,                  // shallows 'blue': metres of water over which the bed still shows
    // the sun or moon caught by ripples: a broken path, narrow across, long
    // toward the viewer (degrees), sparkling at `rate` changes a second
    glitter: { width: 2.4, length: 20, density: 0.85, rate: 4 },
    reflectCap: 1200,                // metres a reflected ray marches at most
    // in the generated world, trees and bushes are mirrored only in water
    // nearer than objectsCap, and only when they stand nearer than
    // objectsFar (beyond either, a reflection is under a cell, and the swell
    // breaks it up)
    objectsCap: 700,
    objectsFar: 1000,
    ripple: {
      strength: 0.1,                 // scales every wave's slope
      irregular: 2.2,                // how much noise bends the wave fronts
      // a wave fades out as a cell's footprint on the water grows from
      // fade[0] to fade[1] of its length, so distant water lies calm
      fade: [0.15, 0.6],
      // [length m, direction deg, speed m/s, height m]; the long swell
      // outlasts the fade and breaks up distant reflections by a row or so
      waves: [[3.3, 18, 1.2, 0.022], [1.9, 74, 0.9, 0.012], [5.7, -32, 1.7, 0.03], [1.1, 128, 0.7, 0.006], [36, 50, 2.5, 0.3]],
    },
  },

  // Conifers. Each tree's shape comes from its own identity: its height,
  // crown width, how much of it is bare trunk, trunk width and bark tone,
  // lean (metres per metre of height), tier count and foliage tone. The
  // tiers are tidy (after phase 3a the only treatment; the rough, dark one
  // was dropped): a ragged outline (`jag` over `sectors` round the trunk)
  // that melts away as it gets smaller than about two cells, at `darken` of
  // the light.
  trees: {
    height: [11, 24], crown: [1.3, 2.5], bare: [0.18, 0.42], trunk: [0.15, 0.32], lean: 0.035, tiers: [6, 10],
    // a share of trees stand this much taller, so a far stand has a jagged top
    emergent: [0.14, 1.32],
    // a trunk held at its two-cell minimum darkens toward this share of its
    // light as it really gets thinner, so a far stand's trunks do not read as a fence
    trunkFade: 0.25,
    // light across a tier, from its foot to its top (the sawtooth's step)
    tierLight: [0.62, 1],
    jag: 0.36, sectors: 9, darken: 1,
  },

  // Clouds. A: rounded cumulus, sizes varied, undersides soft. B: banks and
  // broken bands of stretched puffs with streaky, dissolving edges, flatter
  // and longer at dusk (each keyframe's `cloudFlat` and `cloudStretch`).
  // `body`: the light's turn from the grey underside to the lit top (in the
  // up component of the surface); `under`: how much darker the flat
  // underside is at its rim and at its middle; `edge`: how many cells wide the
  // dissolving edge is; `streak`: how much the edge breaks into streaks.
  clouds: {
    A: { body: [0.14, 0.66], under: [0.16, 0.16], edge: 9, streak: 0 },
    B: { body: [0.05, 0.75], under: [0.1, 0.24], edge: 10, streak: 0.45 },
    // (phase 2b) a dissolving edge is at least this many rows deep, even on a
    // flat or far puff; a puff too small for one fades as a whole instead of
    // scattering into single cells
    edgeMin: 2.5,
  },

  // Meadow mottling, by strength (0 = none, as in phase 0b): soft patches
  // several metres across (`patch`: how far they move the grass's tone;
  // `hue`: how far tone moves its colour between each keyframe's
  // `grassDry` and `grassLush`), and sparse dark tufts near the eye (`tufts`:
  // the share of 1.2 m squares that hold one). Both fade out as a cell's
  // footprint grows past them.
  meadow: { patch: [0, 0.45, 0.85], hue: [0, 0.45, 0.8], tufts: [0, 0.2, 0.34] },

  // A flame held at its minimum size (two rows) is faded toward what is
  // behind it by how much of it is really flame (its core stays bright, its
  // rim fades), to this power (less keeps a far light brighter), and
  // by each keyframe's `flameStrength`, so by day a torch is a small pale
  // light, not a beacon; at night `flameFloor` keeps a far torch a point of
  // light. Under `flameMark` the cell keeps what is behind's glyph.
  flameFade: 1,
  flameMark: 0.35,

  // Interiors (phase 3a): a surface inside a building (a room, the gate's
  // passage) takes the sky's soft light only by the share its doorways,
  // windows and open tops let in (its shelter, src/world/kit.js), and its
  // colour darkens toward `dark` of itself where none reaches; a torch there
  // lights it at least as strongly as `torch` (the keyframe's own when that is
  // stronger), so by day too an interior reads by its openings and torches.
  interior: { dark: 0.42, torch: 0.32 },

  // Ink floor: on near-black cells the glyph is lightened by at least this
  // colour times the ink amount, so night glyphs still carry light.
  inkFloor: '#2a2c34',

  // Weather (phase 2b). Five kinds, each a set of numbers the renderer's
  // existing systems understand; the frame carries how much of each applies
  // (src/weather.js blends them), and `fair` is exactly the look before
  // weather. A kind's numbers:
  // - `clouds`: how many of the world's clouds are up (1: those of fair;
  //   0 none, 2 every one); `size`: their puffs' size; `flat`, `stretch`:
  //   flattening and stretching of a bank (on top of the time of day's);
  //   `low`: the cloud base's height; `dark`: how far cloud tops darken
  //   toward their undersides;
  // - `sun`: the share of direct sun or moon light that gets through (also
  //   how much of the sun and moon discs and their glitter shows);
  //   `skylight`: how much of the light held back returns as soft light from
  //   the whole sky; `cast`, `cloudShadow`: how strong cast shadows and cloud
  //   shadows stay (1: as fair, 0: gone);
  // - `grey`: how far the sky, the air and the clouds turn to the
  //   keyframe's overcast colour (`weather.cast` in every keyframe); `dim`:
  //   how bright they stay;
  // - `air`: [density, height] of the aerial-perspective air (times
  //   LOOK.air's), so overcast and rain are thicker; `mist`: how much of the
  //   mist layer (below) lies on the land;
  // - `wind`: metres a second toward the east and the north, for the cloud
  //   drift (its eastward part), the rain's slant; `swell`: the sea swell's
  //   height (times LOOK.coast.swell's);
  // - `rain`: how hard it rains (streaks, rings on water, wetting);
  //   `wet`: [how much darker, how much sky it mirrors] ground is when wet;
  //   `night`: the light at night (times the night keyframes' ambient), so
  //   an overcast night is darker than a clear dark-moon night, never black;
  //   `stars`: how much of the starry sky shows.
  weather: {
    kinds: {
      clear:    { clouds: 0.45, size: 0.9, flat: 1, stretch: 1, low: 1, dark: 0, sun: 1, skylight: 0, cast: 1, cloudShadow: 1, grey: 0, dim: 1, air: [0.7, 1], mist: 0, wind: [1.6, 0.5], swell: 0.8, rain: 0, wet: [0.28, 0.4], night: 1, stars: 1 },
      fair:     { clouds: 1, size: 1, flat: 1, stretch: 1, low: 1, dark: 0, sun: 1, skylight: 0, cast: 1, cloudShadow: 1, grey: 0, dim: 1, air: [1, 1], mist: 0, wind: [2.4, 0], swell: 1, rain: 0, wet: [0.28, 0.36], night: 1, stars: 1 },
      overcast: { clouds: 1, size: 1.35, flat: 0.55, stretch: 1.15, low: 0.82, dark: 0.35, sun: 0.12, skylight: 0.45, cast: 0.18, cloudShadow: 0, grey: 0.85, dim: 0.96, air: [1.5, 1.1], mist: 0, wind: [4.2, -1.2], swell: 1, rain: 0, wet: [0.28, 0.28], night: 0.68, stars: 0 },
      rain:     { clouds: 1.7, size: 1.5, flat: 0.45, stretch: 1.2, low: 0.68, dark: 0.5, sun: 0.06, skylight: 0.5, cast: 0.08, cloudShadow: 0, grey: 1, dim: 0.88, air: [2.6, 0.9], mist: 0, wind: [5.5, -2.4], swell: 1.8, rain: 1, wet: [0.3, 0.3], night: 0.92, stars: 0 },
      mist:     { clouds: 1, size: 1, flat: 1, stretch: 1, low: 1, dark: 0, sun: 1, skylight: 0, cast: 1, cloudShadow: 1, grey: 0.15, dim: 1, air: [1.2, 1], mist: 1, wind: [2.4, 0], swell: 1, rain: 0, wet: [0.25, 0.32], night: 1, stars: 0.6 },
    },
    // The forecast: a pure function of the seed, the day and the hour
    // (src/weather.js). Each day is fair or clear (`clear`: the share of
    // clear days); some dawns are misty (`mist`, from `mistFrom` to
    // `mistTo` o'clock); some days have an overcast spell (`overcast`,
    // starting in `overcastFrom` and lasting `overcastFor` hours); about one
    // day in four rains (`rain`) for `rainFor` hours, starting in
    // `rainFrom`, with cloud building up `before` and clearing `after`
    // (hours). One kind turns into the next over `blend` minutes. Day 0
    // opens fair, with mist at dawn, so a plain visit opens on the settled look.
    forecast: {
      clear: 0.35, mist: 0.4, mistFrom: [3.5, 5], mistTo: [7.6, 9.2],
      overcast: 0.22, overcastFrom: [8, 13], overcastFor: [3, 7],
      rain: 0.25, rainFrom: [10, 19.5], rainFor: [1, 2], before: [1, 2.5], after: [0.6, 1.4],
      blend: 20,
    },
    // The mist layer: denser than the air, lying lowest where the ground is
    // low against its surroundings, so it pools in hollows, along rivers and
    // over lakes, and trees and hills rise out of it. Its density (`density`,
    // per metre, as 1 - e^-d of what is behind is veiled) is full up to
    // `depth` metres above the ground smoothed over `floor` metres, then thins
    // with height over `height` metres; it lies thinner on higher ground
    // (`raise`: its floor sinks this many metres for every metre the smoothed
    // ground stands above the sea), and thins away as the sun climbs from `sun[0]` to `sun[1]`
    // degrees. Its colour is each keyframe's `weather.mist`.
    mist: { density: 0.02, depth: 0, height: 5, floor: 160, raise: 0.12, sun: [5, 24] },
    // Rain: thin falling streaks in the near air, fixed to the world round
    // the eye: columns `spacing` metres apart, out to `reach` metres (none
    // nearer than `near`), each with a drop every `period` metres of height
    // falling at `speed` m/s, drawn `length` metres long, slanting with the
    // wind; `strength`: how far a streak's glyph is inked toward the
    // keyframe's `weather.rain` colour, fading with distance. `glyphs`: for a
    // streak falling straight, leaning right and leaning left on screen.
    // Rings: where drops land on water the surface is tilted by many small
    // rings (a ring every `rings.size` metres square, each `rings.period`
    // seconds, spreading at `rings.speed` m/s, `rings.width` metres wide, up
    // to `rings.slope`), faded like ripples by a cell's footprint.
    rain: { spacing: 2.4, reach: 26, near: 2.5, period: 15, speed: 8.5, length: 0.75, strength: 0.6, glyphs: '|/\\',
      // (the mirrored and refracted rays take a ring's tilt only up to
      // `rings.tilt`; the share of mirror takes all of it)
      rings: { size: 0.9, period: 1.3, speed: 0.34, width: 0.1, slope: 0.4, tilt: 0.03 },
      // under rain the long ripple (over `calm[0]` metres) dies down by
      // `calm[1]`, and far reflections dull toward the air's colour by `dull`
      // (over `dullDist` metres), broken past what a cell can show
      calm: [10, 0.8], dull: 0.55, dullDist: [15, 120],
      // and reflections show less, since rain breaks them anyway: the clouds
      // in them are looked for only `mirror.clouds` metres out, the land in
      // them followed only `mirror.terrain` of its usual reach, trees mirrored
      // only in water within `mirror.objects` of the usual distance (all at
      // full rain, easing back as it eases)
      mirror: { clouds: 600, terrain: 0.5, objects: 0.4 } },
    // Wet ground: the ground's wetness follows the rain, reaching full within
    // about a quarter of an hour (`soak`, per hour) and drying over the
    // following hour or so (`dry`, hours); wet, it is darker and mirrors a
    // little of the sky at low angles (the kind's `wet`).
    wet: { soak: 4, dry: 1.5 },
  },

  // The overhead map (M, phase 1). The land is drawn by the same resolve
  // step and day palette as the view, seen from straight above and lit by
  // the day's sun; these are only the marks laid over it. `heading`: the
  // glyphs that point the player's way (up, up-right, right, down-right).
  map: {
    glyphs: { fort: '#', village: 'o', viewpoint: '*', spawn: '+', you: '@', heading: ['|', '/', '-', '\\'] },
    mark: '#f0e6cc',          // the sites
    you: '#ffb060',           // the player and their heading
    markBg: '#1c1d22',        // behind a mark, so it reads on any ground
    frame: '#0d0e12',         // round the map
  },

  // Keyframes. Every material has `lit` (full sun) and `shade` (no direct
  // light) colours; the resolve step blends between them by the light that
  // reaches the surface.
  keys: {
    day: {
      sky:    { high: '#5266a4', horizon: '#6c7e9b', glow: '#9aa7bd', glowSize: 0.12 },
      cloud:  { lit: '#dfe1e8', shade: '#4c5070' },
      cloudFlat: 1, cloudStretch: 1,
      light:  { ambient: 0.28, direct: 0.80, cloudShadow: 0.78, castShadow: 0.92, far: 1 },
      haze:   { colour: '#72839e', dist: 700, max: 0.72 },
      air:    { dist: 1200, distC: 700, lum: 0.4, chroma: 0.62 },
      torch:  { colour: '#ffb060', strength: 0.04 },
      stars:  0,
      sun:    '#f4eedc',
      moon:   '#c8ccd6',
      grass:  { lit: '#6f8a3f', shade: '#2c3827' },
      dirt:   { lit: '#7f705a', shade: '#3d352f' },
      sand:   { lit: '#93805e', shade: '#4a4036' },
      rock:   { lit: '#8a7e6d', shade: '#383842' },
      snow:   { lit: '#d6cfc6', shade: '#737586' },
      water:  { lit: '#36474d', shade: '#2b3a40', sky: '#5f6f86', deep: '#2e3c4a', shallow: '#5f5c49', blue: '#44597a' },
      grassDry: '#859447', grassLush: '#4a6b3c',
      stone:  { lit: '#9a958d', shade: '#4d4b50' },
      masonry:{ lit: '#b8ae9c', shade: '#56524f' },
      shaft:  { lit: '#1b1817', shade: '#141211' },
      conifer:{ lit: '#3b4c3a', shade: '#1e271f' },
      trunk:  { lit: '#4c3e33', shade: '#241e1a' },
      bush:   { lit: '#55703a', shade: '#28331f' },
      wood:   { lit: '#6a5340', shade: '#342a22' },
      flame:  '#f0dfba',
      flameStrength: 0.6, flameFloor: 0,
      bed:    { lit: '#6b6148', shade: '#353026' },
      floor:  { lit: '#4c4a33', shade: '#22231b' },
      foam:   { lit: '#d6dad4', shade: '#7a8290' },
      timber: { lit: '#6e573f', shade: '#30261e' },
      plaster:{ lit: '#b3a994', shade: '#575450' },
      roof:   { lit: '#6d625a', shade: '#2d2a2c' },
      yard:   { lit: '#8a7a64', shade: '#403830' },
      window: { lit: '#e2a65e', shade: '#24201d' }, windowStrength: 0,
      weather: { cast: '#8b9099', mist: '#b4b9bd', rain: '#c3c7cc' },
    },
    dusk: {
      sky:    { high: '#4b3d5d', horizon: '#7a5a64', glow: '#c48a6e', glowSize: 0.30 },
      cloud:  { lit: '#b48c78', shade: '#3a3049' },
      cloudFlat: 0.72, cloudStretch: 1.3,
      light:  { ambient: 0.30, direct: 0.55, cloudShadow: 0.25, castShadow: 0.80, far: 0.08 },
      haze:   { colour: '#4f4352', dist: 420, max: 0.85 },
      air:    { dist: 850, distC: 520, lum: 0.4, chroma: 0.64 },
      torch:  { colour: '#ff9f50', strength: 0.30 },
      stars:  0.15,
      sun:    '#f0b07a',
      moon:   '#b8b6c4',
      grass:  { lit: '#3c4636', shade: '#20272a' },
      dirt:   { lit: '#6a5650', shade: '#2e2829' },
      sand:   { lit: '#6e5c50', shade: '#30292a' },
      rock:   { lit: '#625560', shade: '#2f2a33' },
      snow:   { lit: '#a8949a', shade: '#4f4859' },
      water:  { lit: '#3f3f55', shade: '#2c2c3e', sky: '#6a5568', deep: '#211f2b', shallow: '#655248', blue: '#383852' },
      grassDry: '#4a4f38', grassLush: '#2e3a33',
      stone:  { lit: '#6e6064', shade: '#3a353c' },
      masonry:{ lit: '#857373', shade: '#40393f' },
      shaft:  { lit: '#1a1718', shade: '#131113' },
      conifer:{ lit: '#2c3430', shade: '#1a1f1e' },
      trunk:  { lit: '#352c2a', shade: '#1d1919' },
      bush:   { lit: '#36402e', shade: '#1d221c' },
      wood:   { lit: '#4c3a32', shade: '#261e1b' },
      flame:  '#ffb060',
      flameStrength: 0.85, flameFloor: 0.25,
      bed:    { lit: '#544a42', shade: '#2a2526' },
      floor:  { lit: '#34312d', shade: '#1b1a1b' },
      foam:   { lit: '#b8a8a8', shade: '#5a5262' },
      timber: { lit: '#4f3d31', shade: '#231b18' },
      plaster:{ lit: '#806d69', shade: '#423b3c' },
      roof:   { lit: '#4d424f', shade: '#262022' },
      yard:   { lit: '#735e59', shade: '#302a2a' },
      window: { lit: '#eca45a', shade: '#1e1a1a' }, windowStrength: 0.8,
      weather: { cast: '#5d545c', mist: '#7c6e74', rain: '#93878c' },
    },
    night: {
      sky:    { high: '#161927', horizon: '#252438', glow: '#2c3046', glowSize: 0.10 },
      cloud:  { lit: '#3b3b47', shade: '#1a1b23' },
      cloudFlat: 0.85, cloudStretch: 1.12,
      light:  { ambient: 0.22, direct: 0.42, cloudShadow: 0.15, castShadow: 0.70, far: 1 },
      haze:   { colour: '#1e1f2c', dist: 330, max: 0.80 },
      air:    { dist: 900, distC: 600, lum: 0.4, chroma: 0.62 },
      torch:  { colour: '#ffc46a', strength: 0.55 },
      stars:  1,
      sun:    '#f4eedc',
      moon:   '#c9ccd4',
      grass:  { lit: '#212723', shade: '#131615' },
      dirt:   { lit: '#25242a', shade: '#131317' },
      sand:   { lit: '#27262a', shade: '#141417' },
      rock:   { lit: '#252429', shade: '#131316' },
      snow:   { lit: '#3c3f4c', shade: '#1d1f28' },
      water:  { lit: '#1b2029', shade: '#11141b', sky: '#20263a', deep: '#0d0f14', shallow: '#28261f', blue: '#141924' },
      grassDry: '#262b24', grassLush: '#1a221f',
      stone:  { lit: '#29282e', shade: '#141418' },
      masonry:{ lit: '#302e33', shade: '#16151a' },
      shaft:  { lit: '#100f11', shade: '#0c0b0d' },
      conifer:{ lit: '#17191c', shade: '#0e0f12' },
      trunk:  { lit: '#1c1a1a', shade: '#0f0e0f' },
      bush:   { lit: '#191c1c', shade: '#0f1011' },
      wood:   { lit: '#221d1a', shade: '#110f0e' },
      flame:  '#ffb468',
      flameStrength: 1, flameFloor: 0.5,
      bed:    { lit: '#24231f', shade: '#121210' },
      floor:  { lit: '#1b1a1a', shade: '#0e0e0f' },
      foam:   { lit: '#4a4e5a', shade: '#262830' },
      timber: { lit: '#231e1a', shade: '#100e0c' },
      plaster:{ lit: '#302d30', shade: '#171618' },
      roof:   { lit: '#1d1c22', shade: '#0f0e0f' },
      yard:   { lit: '#28272f', shade: '#141417' },
      window: { lit: '#eeaa5e', shade: '#121112' }, windowStrength: 1,
      weather: { cast: '#1c1d25', mist: '#2a2c35', rain: '#3c404a' },
    },
  },

  // The keyframes of the night rule 'moon' (phase 2a), in place of phase
  // 1's dusk and night: dawn (the sun low in the east, its own colours, cooler
  // above and rosier at the horizon than dusk, with a pale morning mist),
  // dusk (phase 1's, with the low sun raking across the meadow: less ambient
  // light, more direct), and night in two: under a bright moon (`moonlit`,
  // enough to walk by, soft moon shadows) and under a dark one (`starlit`, a
  // faint floor so the land is never a black screen), blended by how much
  // moonlight there is.
  moonKeys: null,
};

{
  const K = LOOK.keys;
  LOOK.moonKeys = {
    dawn: {
      sky:    { high: '#4d5b8e', horizon: '#b6a0a4', glow: '#ecc092', glowSize: 0.28 },
      cloud:  { lit: '#e2c0ae', shade: '#4b4a68' },
      cloudFlat: 0.8, cloudStretch: 1.2,
      light:  { ambient: 0.24, direct: 1.05, cloudShadow: 0.3, castShadow: 0.85, far: 1 },
      haze:   { colour: '#9a93a6', dist: 420, max: 0.85 },
      air:    { dist: 800, distC: 480, lum: 0.48, chroma: 0.72 },
      torch:  { colour: '#ffb060', strength: 0.12 },
      stars:  0.05,
      sun:    '#f6d4a0',
      moon:   '#c8ccd6',
      grass:  { lit: '#7a8a48', shade: '#26302a' },
      dirt:   { lit: '#8f7a62', shade: '#3a3330' },
      sand:   { lit: '#a48c6c', shade: '#463c36' },
      rock:   { lit: '#9a8a7a', shade: '#3a3a48' },
      snow:   { lit: '#f0dcd0', shade: '#6f7088' },
      water:  { lit: '#3e4a58', shade: '#2c3644', sky: '#8e8ca2', deep: '#2a3444', shallow: '#625a4c', blue: '#4c5a7c' },
      grassDry: '#8e9450', grassLush: '#4e6a40',
      stone:  { lit: '#a49a90', shade: '#4a4850' },
      masonry:{ lit: '#bcae9e', shade: '#524e52' },
      shaft:  { lit: '#1c1918', shade: '#141212' },
      conifer:{ lit: '#3c4a38', shade: '#1e2620' },
      trunk:  { lit: '#54443a', shade: '#261f1c' },
      bush:   { lit: '#5a703c', shade: '#283220' },
      wood:   { lit: '#705844', shade: '#342a22' },
      flame:  '#f0dfba',
      flameStrength: 0.65, flameFloor: 0.1,
      bed:    { lit: '#74684e', shade: '#363028' },
      floor:  { lit: '#54503a', shade: '#22231c' },
      foam:   { lit: '#efe2d6', shade: '#86808e' },
      timber: { lit: '#745c43', shade: '#30261e' },
      plaster:{ lit: '#bfaf97', shade: '#545150' },
      roof:   { lit: '#7a6b65', shade: '#2f2c30' },
      yard:   { lit: '#9b856d', shade: '#3d3631' },
      window: { lit: '#e6a862', shade: '#22201f' }, windowStrength: 0.3,
      weather: { cast: '#8c8892', mist: '#c6bac4', rain: '#b2acb6' },
    },
    dusk: { ...K.dusk, light: { ambient: 0.22, direct: 0.95, cloudShadow: 0.25, castShadow: 0.82, far: 0.08 } },
    moonlit: {
      sky:    { high: '#182033', horizon: '#2c3450', glow: '#343c58', glowSize: 0.10 },
      cloud:  { lit: '#4a5064', shade: '#1e2230' },
      cloudFlat: 0.85, cloudStretch: 1.12,
      light:  { ambient: 0.26, direct: 0.62, cloudShadow: 0.15, castShadow: 0.55, far: 1 },
      haze:   { colour: '#283048', dist: 330, max: 0.80 },
      air:    { dist: 900, distC: 600, lum: 0.4, chroma: 0.62 },
      torch:  { colour: '#ffc46a', strength: 0.55 },
      stars:  0.75,
      sun:    '#f4eedc',
      moon:   '#d9dce4',
      grass:  { lit: '#3b4a4a', shade: '#172022' },
      dirt:   { lit: '#3b3d45', shade: '#1a1b20' },
      sand:   { lit: '#43444a', shade: '#1c1d22' },
      rock:   { lit: '#44464f', shade: '#1a1b21' },
      snow:   { lit: '#7d8498', shade: '#2e3240' },
      water:  { lit: '#222a38', shade: '#151a24', sky: '#2c3550', deep: '#10141c', shallow: '#2c2c28', blue: '#18202e' },
      grassDry: '#3f4b44', grassLush: '#2c3a38',
      stone:  { lit: '#45464e', shade: '#1c1c22' },
      masonry:{ lit: '#52535b', shade: '#1f1f25' },
      shaft:  { lit: '#121214', shade: '#0d0d0f' },
      conifer:{ lit: '#222a2c', shade: '#10141a' },
      trunk:  { lit: '#2a2626', shade: '#141212' },
      bush:   { lit: '#2a3434', shade: '#141a1a' },
      wood:   { lit: '#2e2924', shade: '#161311' },
      flame:  '#ffb468',
      flameStrength: 1, flameFloor: 0.5,
      bed:    { lit: '#2e2f2c', shade: '#161614' },
      floor:  { lit: '#26262a', shade: '#121214' },
      foam:   { lit: '#8a90a2', shade: '#383c48' },
      timber: { lit: '#302b23', shade: '#14110f' },
      plaster:{ lit: '#504f52', shade: '#201f22' },
      roof:   { lit: '#363641', shade: '#151416' },
      yard:   { lit: '#40424d', shade: '#1b1d21' },
      window: { lit: '#eeaa5e', shade: '#131315' }, windowStrength: 1,
      weather: { cast: '#262a33', mist: '#3a4051', rain: '#4c5262' },
    },
    starlit: {
      sky:    { high: '#121520', horizon: '#1c1f2e', glow: '#20243a', glowSize: 0.10 },
      cloud:  { lit: '#262832', shade: '#12131a' },
      cloudFlat: 0.85, cloudStretch: 1.12,
      light:  { ambient: 0.42, direct: 0.10, cloudShadow: 0.1, castShadow: 0.4, far: 1 },
      haze:   { colour: '#181a26', dist: 330, max: 0.80 },
      air:    { dist: 700, distC: 500, lum: 0.45, chroma: 0.66 },
      torch:  { colour: '#ffc46a', strength: 0.55 },
      stars:  1.15,
      sun:    '#f4eedc',
      moon:   '#c9ccd4',
      grass:  { lit: '#232c2b', shade: '#171e1f' },
      dirt:   { lit: '#26272e', shade: '#18191e' },
      sand:   { lit: '#292a30', shade: '#191a1f' },
      rock:   { lit: '#24262c', shade: '#15161b' },
      snow:   { lit: '#3e4352', shade: '#22252f' },
      water:  { lit: '#161b25', shade: '#10141b', sky: '#1a1f30', deep: '#0c0f15', shallow: '#1e1e1c', blue: '#121722' },
      grassDry: '#222a26', grassLush: '#19221f',
      stone:  { lit: '#25262c', shade: '#15161a' },
      masonry:{ lit: '#2b2b31', shade: '#16171b' },
      shaft:  { lit: '#0f0f11', shade: '#0b0b0d' },
      conifer:{ lit: '#141a1c', shade: '#0d1013' },
      trunk:  { lit: '#191717', shade: '#100e0f' },
      bush:   { lit: '#182020', shade: '#0f1314' },
      wood:   { lit: '#1d1a18', shade: '#110f0e' },
      flame:  '#ffb468',
      flameStrength: 1, flameFloor: 0.5,
      bed:    { lit: '#1f1f1d', shade: '#121210' },
      floor:  { lit: '#18191b', shade: '#0f0f11' },
      foam:   { lit: '#3a3e4a', shade: '#22242c' },
      timber: { lit: '#1e1b18', shade: '#100e0c' },
      plaster:{ lit: '#2b2b2e', shade: '#18191a' },
      roof:   { lit: '#1c1e24', shade: '#111112' },
      yard:   { lit: '#292a33', shade: '#191a1f' },
      window: { lit: '#eeaa5e', shade: '#111113' }, windowStrength: 1,
      weather: { cast: '#181a21', mist: '#24262f', rain: '#32353e' },
    },
  };
}
