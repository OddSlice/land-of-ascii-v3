// The scale of the generated world: the numbers every later phase builds
// to. docs/scale.md explains each one; change them there and here together.
// Distances are metres, speeds metres a second, slopes rise over run.

export const SCALE = {
  // the map: one cell is one metre, 2048 cells a side, no wrapping
  N: 2048,
  sea: 20,                    // sea level (heights are metres above a datum under the deepest sea)
  viewDist: 1500,             // how far the march goes

  // the body
  eye: 1.7,                   // eye above the feet
  chest: 1.3,                 // water deeper than this and you swim
  swimEye: 0.15,              // swimming, the eye sits this far above the surface
  walk: 4.5,                  // along the ground, whatever the slope
  run: 8,
  wade: 0.45,                 // walking speed is scaled down to this share at chest depth
  swim: 1.2,
  fly: 50,                    // F: free flight, for looking around
  climb: 1.0,                 // steepest ground you can walk up (tan 45 degrees)
  slide: 1.19,                // ground steeper than this (tan 50 degrees) slides you down
  slideSpeed: 6,

  // the land
  // mountains close the north and east: peaks rise between `climb` metres
  // past the front to `top` plus `rise`, as the share of that climb to the
  // power `steep` (phase 2a: from 70 to 400 m, 1.45, 45 m, so they stand
  // higher at the back and no steeper at the front; phase 1: 50 to 380 m,
  // 1.25, 20 m); toward the edges they even out into a shoulder `shoulder`
  // metres under `top`; snow lies from `snow` metres up, judged also by how
  // far a point stands above the ground round it (phase 2b, `snowRelief`:
  // [over how many metres, metres lower for each metre it stands above]), so
  // a crest just over the line stays bare instead of wearing a thin white line
  range: { top: 300, rise: 50, steep: 1.45, climb: [70, 390], shoulder: 95, snow: 235, snowRelief: [160, 1.2], front: 430 },
  coast: 240,                 // the sea closes the south and west: the shore lies about this far in
  beach: 16,                  // beaches run about this far up from the sea (phase 2a; 34 before)
  lowlandSlope: 0.08,         // the lowland's usual steepest, in the long rises

  // water
  river: { minWidth: 3, maxWidth: 14, ford: 0.6 },   // fords: water no deeper than this
  // things on the land
  trees: { target: 12000, height: [11, 24], spacing: 5 },
  // copses (phase 2a): about `count` small clumps of `trees` conifers in the
  // open lowland, at least `apart` metres apart, trees `spacing` apart
  copses: { count: 32, trees: [5, 30], apart: 140, spacing: 4.5 },
  road: { width: 4, maxSlope: 0.12 },
  // (phase 3b) the villages (docs/scale.md): lanes and footpaths `lane` and
  // `path` wide; a green `green` in radius; the shore lane `shoreBack` from
  // the water; houses set back `setback` from their way, at least `gap`
  // apart, turned up to `turn` radians off square, their door no more than
  // `doorDrop` above the ground in front; a share `lit` of the houses with
  // lit windows; a jetty `jetty` long; `fields` blocks of fields round each
  // village, `fieldL` by `fieldW` (half), no steeper than `fieldSlope`,
  // cut into strips `strip` wide
  village: { lane: 3, path: 1.4, green: [12, 17], shoreBack: 14, setback: [2.5, 6], gap: 3.2, turn: 0.13, doorDrop: 0.5, lit: 0.8,
    jetty: [8, 16], fields: [3, 5], fieldL: [22, 40], fieldW: [16, 28], fieldSlope: 0.1, strip: [6, 11] },
  // (phase 4b) the wild ground detail (docs/scale.md): metres, placing in
  // jittered grids of `grid` metres with a chance each, by habitat
  wild: {
    clear: 1.2, roadClear: 3,            // kept off paths, fields, villages; and the roads
    boulder: { grid: 6, steep: 0.6, cluster: 38, fieldAt: 0.56, lone: 0.004, belowRock: 0.3, river: 0.18, gap: 0.9,
      small: [0.25, 0.45], smallH: [0.2, 0.4], medium: [0.55, 0.95], mediumH: [0.45, 0.85], large: [1.05, 1.6], largeH: [0.95, 1.5] },
    outcrop: { grid: 22, slope: [0.42, 0.62], chance: 0.3, r: [1.0, 1.8], h: [0.5, 1.1] },
    log: { grid: 7, edge: -0.03, chance: 0.022, len: [2.5, 6], r: [0.15, 0.36], level: 0.3 },
    stump: { chance: 0.026, r: [0.2, 0.42], h: [0.25, 0.6] },
    reeds: { grid: 5, depth: [0.03, 0.55], edge: 3, slow: 0.25, cluster: 45, at: 0.5, chance: 0.55, r: [1.1, 2.6], h: [1.25, 1.8] },
    flowers: { drift: 46, at: 0.52, soft: 0.12, wet: 30, hollow: 0.6, aspect: [0.35, -0.94], sunny: 0.04 },
  },
  // (phase 4b) the animals (docs/scale.md)
  animals: {
    // a sheepfold: half sizes, the ground's most fall across it, its gate's width
    fold: { hw: 4.5, hd: 3.5, fall: 1.0, gate: 2.6 },
  },
  wall: { length: 120, thick: 3, height: 6, gate: 4 },

  // the building kit (phase 3a; docs/scale.md): metres, heights above the
  // ground a piece stands on
  kit: {
    // a curtain wall: the walk on top at `height`, `thick` through, its
    // foundation `foot` below the ground; on the outer side a parapet
    // `parapet` thick, its breastwork `breast` high above the walk and its
    // merlons `merlon` higher again, `merlonW` long with gaps `crenelW` wide
    wall: { height: 6.5, thick: 3.2, foot: 2, parapet: 0.6, breast: 1.0, merlon: 1.0, merlonW: 1.4, crenelW: 0.9 },
    // the gate: a block across the wall, `length` along it and `depth`
    // through it (the passage's depth); the passage `width` wide, its arch
    // springing at `spring` (so its crown is at spring + width / 2)
    gate: { width: 3.6, spring: 3.2, depth: 7.4, length: 10 },
    // towers stand `above` higher than the walk; walls `wallT` thick; square
    // towers `square` across (half: room beside a wall for the ground door),
    // round ones of radius `round`
    tower: { square: [4.4, 4.9], round: [3.7, 4.3], above: 3.0, wallT: 1.15 },
    // the keep: `w` by `d` (half), `above` higher than the walk, its hall `hall` high
    keep: { w: [6, 7.5], d: [5, 6], above: 6, wallT: 1.5, hall: 5 },
    // doorways (an arch: half `width` round at the top), wide and high
    // enough to walk through in comfort at an eye of 1.7 m
    door: { width: 1.5, height: 2.7 },
    walkDoor: { width: 1.5, height: 2.5 },
    keepDoor: { width: 2.0, height: 3.3 },
    // stone stairs up to the walk: `width` wide, steps `rise` high and `run` deep
    stair: { width: 1.7, rise: 0.2, run: 0.28 },
    // a tower's own stairs, steeper
    towerStair: { width: 1.0, rise: 0.22, run: 0.25 },
    // floors are `slab` thick; a room is at least `room` high
    slab: 0.3, room: 2.6,
    // a timber house: `w` by `d` (half), its eaves at `eave`, the roof
    // rising `pitch` metres for each metre in, reaching `overhang` past the walls
    house: { w: [3.3, 4.2], d: [2.4, 2.9], eave: 3.0, pitch: 0.95, overhang: 0.45, wallT: 0.3 },
    // (`shaft`: how far above the ground the dark of the shaft is drawn,
    // over the ground inside the ring: just under the rim, so it reads as a hole)
    well: { r: 1.0, height: 0.85, wallT: 0.3, shaft: 0.65 },
    window: { width: 0.7, height: 1.1, depth: 0.35 },
    // (phase 3b) the villages' pieces; `w` and `d` are half sizes, heights
    // above the floor (a house's floor stands on its footing)
    cottage: { w: [2.6, 3.4], d: [2.1, 2.6], eave: 2.6, pitch: 1.0, overhang: 0.4, wallT: 0.3 },
    // a larger house: an upper storey under the eaves, its floor at `upper`
    hall: { w: [3.6, 4.5], d: [2.6, 3.1], eave: 4.5, upper: 2.6, pitch: 1.05, overhang: 0.45, wallT: 0.32 },
    barn: { w: [4.8, 6.2], d: [3.3, 4.0], eave: 3.6, pitch: 0.9, overhang: 0.4, wallT: 0.25, door: [3.0, 3.3] },
    // a chapel: its nave; a bellcote on its front gable or a short tower
    // `tower` (half) across and `towerH` high in front of it
    chapel: { w: [4.4, 5.2], d: [2.6, 3.0], eave: 4.2, pitch: 1.3, overhang: 0.35, wallT: 0.6, tower: 1.7, towerH: 9 },
    shelter: { w: [2.6, 3.4], d: [1.9, 2.3], eave: 2.5, pitch: 0.7, post: 0.12 },
    // a jetty: planks `width` (half) wide, `above` over the water, on posts every `span`
    jetty: { width: 0.85, above: 0.55, plank: 0.15, span: 2.4, post: 0.12 },
    chimney: { half: 0.32, above: 0.7 },
    // a fence: posts `post` (half) square every `span`, two rails `rail` (half) thick and
    // `railH` tall, their middles at `rails` above the ground; `height` its posts
    // (rails and arms at least 9 cm thick: the body is tested at points 7.8 cm
    // apart round its edge, and a thinner part could slip between them)
    fence: { height: 1.2, post: 0.07, span: 2.4, rail: 0.045, railH: 0.11, rails: [0.5, 1.0], gate: 3 },
    // a low dry-stone wall, its pieces at most `piece` long
    drystone: { half: 0.32, height: 0.95, piece: 4 },
    haystack: { w: 1.7, d: 1.2, h: 1.7, roof: 0.9 },
    signpost: { height: 2.4, post: 0.075, arm: 0.36, armH: 0.13, armT: 0.05 },
    bench: { half: 0.8, depth: 0.22, seat: 0.46 },
    // inside the houses one can enter
    hearth: { w: 0.7, d: 0.4, h: 0.55 },
    table: { w: 0.6, d: 0.42, h: 0.76 },
    bed: { w: 0.98, d: 0.5, h: 0.48 },
    shelf: { w: 0.6, d: 0.16, h: 1.7 },
    // bridges: a timber deck `deck` thick on posts every `span`, rails `rail`
    // above it; a stone bridge's parapets `parapet` thick and `parapetH` high
    bridge: { half: 2.35, deck: 0.28, span: 3.0, post: 0.13, rail: 1.0, parapet: 0.4, parapetH: 0.8, clear: 1.0 },
    // a village house's footing: the most the ground may fall across it
    // (else the house moves or is dropped), and its floor's least height
    footing: { rise: 1.2, above: 0.15 },
  },

  // the backdrop (phase 2a): the range going on past the north and east
  // edges as receding ridgelines, never walkable. Each runs `dist` metres
  // outside the edges (rounding the corner on an arc), its heights above the
  // sea between `low` and `high` with peaks `wave` metres apart; snow from
  // `snow`, trees below `tree` (heights above the sea). They stand to their full
  // height where the map's own edge beside them (smoothed over `reach`
  // metres along it) is `mount[1]` metres above the sea, and fall away to
  // nothing where it is `mount[0]` (coast, and out past the map's corners).
  // Profiles are kept every `step` metres, from `west` to `south`.
  backdrop: {
    step: 8, west: -2600, south: -2600, reach: 900, mount: [110, 210],
    // the faces' lean along the line, smoothed over these windows (metres)
    // from the crest down (each window three times the last)
    windows: [24, 72, 216, 648],
    // the faces lean back from the map at this slope (rise over run), and
    // turn along the line by `lean` times the line's own slope near a crest,
    // so a peak has a lit flank and a shaded one
    face: 0.8, lean: 2.2,
    // snow caps a peak above its line by this share of its height over it
    cap: 0.55,
    layers: [
      { dist: 450, low: 200, high: 580, wave: 1100, snow: 480, tree: 210 },
      { dist: 1400, low: 320, high: 840, wave: 1700, snow: 620, tree: 220 },
      { dist: 3200, low: 440, high: 980, wave: 2600, snow: 700, tree: 230 },
    ],
  },
};
