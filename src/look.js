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
// Colours are sRGB hex. Five keyframes (day, dawn, dusk, and night under a
// bright and a dark moon) are blended by the height of the sun and the moon's
// light, so time can run between them.

import { KEYS, moonKeysOf } from './look/keys.js';

export const LOOK = {
  // Camera: vertical field of view in degrees. The eye is 1.7 m up (world/layout.js).
  fovY: 60,

  // Hours the 1, 2, 3, 4 keys jump to (dawn: the sun as low as at dusk).
  hours: { day: 14.0, dusk: 17.85, night: 23.0, dawn: 6.15, noon: 12.2 },

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

  // Haze (phase 1): the plain haze by distance, where aerial perspective
  // (below) does not apply, as on the overhead map: the share of the horizon
  // colour mixed in at distance d is 1 - exp(-d / dist), times `max`.
  // Glyph contrast fades with the same haze, times `glyphFade`.
  haze: { glyphFade: 0.9 },

  // Aerial perspective (phase 2a). Air is thickest low down and
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

  // Far land (phase 2a). Past `fade[0]` metres the large forms
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
    // (phase 3b) the villages: thatch beside shingle; plaster and timber in
    // two more muted tints each, so neighbouring houses differ; the fields'
    // crop, stubble and fallow (ground, with furrows that fade as rows do)
    thatch:   { glyphs: ':;=%#',     ink: { lit: -0.26, dark: 0.46 }, tone: 0.18 },
    plaster2: { glyphs: '.,:;=',     ink: { lit: -0.16, dark: 0.36 }, tone: 0.08 },
    plaster3: { glyphs: '.,:;=',     ink: { lit: -0.16, dark: 0.36 }, tone: 0.08 },
    timber2:  { glyphs: '.-=#H',     ink: { lit: -0.26, dark: 0.46 }, tone: 0.16 },
    timber3:  { glyphs: '.-=#H',     ink: { lit: -0.26, dark: 0.46 }, tone: 0.16 },
    crop:     { glyphs: ',:;"+*',    ink: { lit: -0.28, dark: 0.48 }, tone: 0.18 },
    stubble:  { glyphs: '.,:;=+',    ink: { lit: -0.24, dark: 0.46 }, tone: 0.14 },
    fallow:   { glyphs: '.:-=+#',    ink: { lit: -0.26, dark: 0.48 }, tone: 0.16 },
    // (phase 4a) people: skin in two tones, hair, and cloth in a few muted
    // dyes (undyed linen, russet, ochre, moss, slate, umber, charcoal),
    // leather and iron; each a shift of a colour already in the palette
    skin:     { glyphs: '.:-=',      ink: { lit: -0.18, dark: 0.36 }, tone: 0.06 },
    skin2:    { glyphs: '.:-=',      ink: { lit: -0.18, dark: 0.36 }, tone: 0.06 },
    hair:     { glyphs: ',;%#',      ink: { lit: -0.26, dark: 0.46 }, tone: 0.12 },
    linen:    { glyphs: '.,:;=+',    ink: { lit: -0.18, dark: 0.38 }, tone: 0.08 },
    russet:   { glyphs: '.,:;=+',    ink: { lit: -0.22, dark: 0.42 }, tone: 0.08 },
    ochre:    { glyphs: '.,:;=+',    ink: { lit: -0.22, dark: 0.42 }, tone: 0.08 },
    moss:     { glyphs: '.,:;=+',    ink: { lit: -0.22, dark: 0.42 }, tone: 0.08 },
    slate:    { glyphs: '.,:;=+',    ink: { lit: -0.22, dark: 0.42 }, tone: 0.08 },
    umber:    { glyphs: '.,:;=+',    ink: { lit: -0.24, dark: 0.44 }, tone: 0.08 },
    charcoal: { glyphs: '.,:;=+',    ink: { lit: -0.24, dark: 0.44 }, tone: 0.08 },
    leather:  { glyphs: '.-=#',      ink: { lit: -0.26, dark: 0.46 }, tone: 0.10 },
    iron:     { glyphs: ':=#%',      ink: { lit: -0.28, dark: 0.46 }, tone: 0.14 },
    // the dark down a well's shaft: nearly black at every hour
    shaft:   { glyphs: ' .:',        ink: { lit: 0.10, dark: 0.10 } },
    // (phase 4b) the wild ground detail: pasture (grazed grass, its own
    // muted tone), the meadow's flower drifts in three tones (yellow, lilac,
    // pale), reeds and bark; then the animals' coats
    pasture:  { glyphs: ',:;"+*',    ink: { lit: -0.28, dark: 0.48 }, tone: 0.16 },
    flowera:  { glyphs: ',:;"+*',    ink: { lit: -0.28, dark: 0.48 }, tone: 0.22 },
    flowerb:  { glyphs: ',:;"+*',    ink: { lit: -0.28, dark: 0.48 }, tone: 0.22 },
    flowerc:  { glyphs: ',:;"+*',    ink: { lit: -0.28, dark: 0.48 }, tone: 0.22 },
    // (phase 5b: strokes on every rung, darker on lit stems, so a bed reads
    // as stems; it read as a mound of dots in the light)
    reed:     { glyphs: "'|!I",      ink: { lit: -0.42, dark: 0.50 }, tone: 0.20, toneRung: 0.2 },
    bark:     { glyphs: ':|!I#',     ink: { lit: -0.28, dark: 0.46 }, tone: 0.20 },
    wool:     { glyphs: '.,:;o%',    ink: { lit: -0.18, dark: 0.38 }, tone: 0.08 },
    hide:     { glyphs: '.,:;=+',    ink: { lit: -0.22, dark: 0.42 }, tone: 0.08 },
    fawn:     { glyphs: '.,:;=+',    ink: { lit: -0.22, dark: 0.42 }, tone: 0.08 },
    gull:     { glyphs: '.,:;=+',    ink: { lit: -0.16, dark: 0.36 }, tone: 0.06 },
    crow:     { glyphs: '.,:;=+',    ink: { lit: -0.24, dark: 0.44 }, tone: 0.08 },
    duck:     { glyphs: '.,:;=+',    ink: { lit: -0.22, dark: 0.42 }, tone: 0.08 },
    duckhead: { glyphs: '.,:;=+',    ink: { lit: -0.24, dark: 0.44 }, tone: 0.08 },
    hare:     { glyphs: '.,:;=+',    ink: { lit: -0.22, dark: 0.42 }, tone: 0.08 },
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
  // (phase 4b) The wild ground detail's drawing rules (sizes and placing are
  // in SCALE.wild):
  // - `fadeMin`: under this share of the two cells and two rows it is held
  //   at, a far boulder, log, stump or reed bed is not drawn
  // - `boulder`: how much a stone's own shade varies (`own`); its lichen
  //   patches [metres across, strength], drawn while a patch is a few cells
  // - `outcrop.band`: the bedding planes of an outcrop's stones (metres)
  // - `bark.groove`: bark's grooves (metres apart); `rings`: a cut end's
  // - `reed`: `stem` (metres apart), `jag` (how much the stems' heights
  //   differ), `tip` (paler toward their tips), `part`: a walker parts them
  //   [from, to] metres from the eye, down to [2] of their height;
  //   (phase 5b) each sector of `wave` a tuft: level across its middle and
  //   eased to the next over `ease` of it (a ragged top of tufts rather
  //   than a wave), its own tone `tuft`, taller tufts paler, so a bed reads
  //   as stems from 10 m rather than a mound; only at the middle distance,
  //   while a tuft is under `mid` columns across (nearer, the stems show)
  // (phase 5b) The fort's masonry: its blocks' head joints `head` metres
  // wide, crisp near, and from a cell's footprint of `from` metres held at `held` cells across when narrower than that and darkened
  // by their true share, drawn while a cell's footprint is under `fade`
  // metres (fully to about 24 m, gone by about 35 m), on a wall seen within
  // `square` of square on (the cosine; along a wall they sweep too fast)
  masonry: { head: 0.05, held: 3.5, dark: 0.6, from: [0.045, 0.07], fade: [0.11, 0.16], square: [0.7, 0.88] },

  wild: {
    fadeMin: 0.06,
    boulder: { own: 0.5, lichen: [0.6, 0.35] },
    outcrop: { band: 0.32 },
    bark: { groove: 0.07 },
    rings: 0.035,
    reed: { stem: 0.24, wave: 0.6, jag: 0.3, jagMid: 0.1, ease: 0.35, tip: 0.4, part: [0.45, 1.5, 0.3], tuft: 0.6, mid: [16, 28] },
  },

  water: {
    ior: 1.33,                       // bends the ray toward the bed
    fresnel: { r0: 0.1, power: 4, max: 0.9 },    // Schlick, with a stylised floor and cap
    warm: 0.2,                       // how far the bed is tinted toward the shallow colour
    torchSurface: 0.5,               // torchlight on the surface itself
    blueDepth: 0.5,                  // metres of water over which the bed still shows
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

  // Clouds: banks and broken bands of stretched puffs with streaky,
  // dissolving edges, flatter and longer at dusk (each keyframe's
  // `cloudFlat` and `cloudStretch`).
  // `body`: the light's turn from the grey underside to the lit top (in the
  // up component of the surface); `under`: how much darker the flat
  // underside is at its rim and at its middle; `edge`: how many cells wide the
  // dissolving edge is; `streak`: how much the edge breaks into streaks.
  clouds: {
    body: [0.05, 0.75], under: [0.1, 0.24], edge: 10, streak: 0.45,
    // (phase 2b) a dissolving edge is at least this many rows deep, even on a
    // flat or far puff; a puff too small for one fades as a whole instead of
    // scattering into single cells
    edgeMin: 2.5,
  },

  // Meadow mottling: soft patches several metres across (`patch`: how far
  // they move the grass's tone; `hue`: how far tone moves its colour between
  // each keyframe's `grassDry` and `grassLush`), and sparse dark tufts near
  // the eye (`tufts`: the share of 1.2 m squares that hold one). Both fade
  // out as a cell's footprint grows past them.
  meadow: { patch: 0.85, hue: 0.8, tufts: 0.34 },
  // (phase 4b) a flower drift's heads up close: one in `share` of the
  // squares of a `lattice`-metre grid, `head` metres across, `bright` in
  // tone; drawn only while a head is several cells across
  flowers: { lattice: 0.5, share: 0.45, head: 0.12, bright: 0.9,
    // the heads' colours by day (yellow, lilac, pale), and how far a head
    // goes toward them; the drifts themselves are their materials' colours
    bloom: ['#c9bb5c', '#a28fae', '#d4d4c0'], hue: 0.8 },

  // (phase 4b) The animals.
  // - `shadow`: an animal's shadow on the ground, `dark` at its middle (of a
  //   full cast shadow), soft from `soft` of the way out, faded out between
  //   two thirds of `far` metres and `far`;
  // - `marks`: a bird in the air past the shapes' distance is one mark, its
  //   wings up, level or down (`glyphs`), in its shaded colour lifted by
  //   `lift` of the way to its lit one, faded out toward `far` metres; a far
  //   flock shows `keep` marks at `near` metres and fewer beyond (by count,
  //   the last one fading), never fewer than `least`.
  //   (phase 5b) `lift` below 0 makes the mark darker than the bird's shaded
  //   colour, and `weight` darkens the cell under it a little too, so a far
  //   bird reads as a dark tick against the sky; `grow`: a crow or a small
  //   bird drawn up to this much bigger toward the middle distance (from 0.7
  //   of the near distance to the middle one), where its true size is a cell
  //   or two and it went unnoticed
  animals: {
    // (a far silhouette held at two cells is drawn while it is at least this
    // share of them, and faded by that share)
    fadeMin: 0.05,
    shadow: { dark: 0.62, soft: 0.45, far: 90 },
    marks: { glyphs: 'v-^', lift: -0.35, weight: 0.22, far: 700, near: 160, least: 3 },
    grow: 0.8,
  },

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
    // (phase 5a) land not yet seen: a plain dark a step above the frame,
    // with a faint dot every few cells so it reads as paper not yet drawn on
    unknown: '#17181d', unknownInk: '#24252c', unknownGlyph: '.', unknownEvery: 4,
  },

  // Keyframes (src/look/keys.js): day and dusk here, and dawn and the
  // two nights, under a bright and a dark moon, in moonKeys.
  keys: KEYS,
  moonKeys: null,
};

LOOK.moonKeys = moonKeysOf(LOOK.keys);
