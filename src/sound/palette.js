// The sound palette (phase 5b): every level, filter and envelope of the
// world's sound, in one place, as src/look.js is for the picture. Nothing
// here is an audio file: every sound is made at runtime from oscillators,
// filtered noise and short envelopes (src/sound/synth.js), placed in the
// world, panned by its direction and faded by its distance
// (src/sound/engine.js). Levels are linear gains (1 = full scale); they are
// kept low on purpose: the beds (wind, rain, water) sit under everything,
// and every other sound is an occasional event.
//
// The rules (docs/art-bible.md, section 10):
// - quiet, filtered and sparse: nothing bright, nothing loud; the music
//   (0.5.3) is slow, soft and rare, with long quiet between pieces;
// - wind and water are beds; everything else is an event;
// - two loops never beat against each other (every slow wobble has its
//   own rate, none a multiple of another);
// - a sound comes from where its source is drawn, and is faded with
//   distance the way the picture fades things into the air;
// - nothing depends on the frame rate: events are due by the game's clock
//   and played on the audio clock.

export const SOUND = {
  // ---- the whole ----------------------------------------------------------------
  master: 0.9,                  // the default master volume (the menu changes it)
  limit: { threshold: -10, knee: 6, ratio: 12, attack: 0.003, release: 0.25 },   // a soft limiter at the end: nothing clips
  voices: 16,                   // at most this many sounding at once, the loudest at the ear kept
  fade: { hidden: 0.5, menu: 0.35, talk: 0.6, unhide: 0.8 },   // seconds: fading out (tab hidden, menu or journal), the exchange's duck, fading back
  duck: { menu: 0.12, talk: 0.45 },   // the level kept while the menu is open, and under an exchange
  lookahead: 0.25,              // seconds of events scheduled ahead on the audio clock
  // the five groups the menu has a slider for, each a share of the master
  groups: ['air', 'water', 'life', 'player', 'places'],

  // ---- distance ------------------------------------------------------------------
  // A source at `ref` metres plays at its level; further, as ref/d, then
  // faded out from `fade` of its reach to its reach (as the air closes over
  // things in the picture), with a low-pass closing from `bright` Hz near to
  // `dull` Hz at its reach (the far air takes the edge off).
  air: { bright: 9000, dull: 1400 },
  pan: 0.85,                    // how far a source to the side pans (1: fully)

  // ---- air: wind, rain, drips ------------------------------------------------------
  wind: {
    level: 0.036,               // in fair weather, on open ground at the sea's height
    perSpeed: 0.014,            // more for each unit of the weather's wind
    high: 0.9,                  // more on high ground: up to this much more 200 m up
    sheltered: 0.45,            // in a forest or among houses: this share
    indoors: 0.12,              // inside a building
    band: [320, 950],           // its band-pass: calm to gusty
    q: 0.7,
    whistle: { level: 0.012, band: 1900, q: 7, from: 110 },   // a thin whistle over ridges, from this many metres up
    gust: { rates: [0.071, 0.0313, 0.137], depth: 0.55, space: 0.004 },   // the gusts: three slow waves (Hz) and how much they lift it; drift over the land
  },
  rain: {
    level: 0.11,                // at full rain
    band: [900, 6500],          // a high- and low-pass round the hiss
    roof: 0.55, under: 0.7,     // its share indoors and under trees
    drip: { every: 0.55, level: 0.05, near: 9, pitch: [1800, 3400], decay: 0.05 },   // drips off leaves and eaves: one a slot of `every` seconds near a tree or a roof
  },

  // ---- water ---------------------------------------------------------------------
  water: {
    lake: { level: 0.07, ref: 6, reach: 90, low: 520, lap: [0.27, 0.43], depth: 0.6 },   // lapping: brown noise, two slow laps (Hz)
    river: { level: 0.06, ref: 5, reach: 80, band: 1250, q: 0.6, rapids: 2.2, bridge: 1.8 },   // flowing: louder where it falls fast, and under a bridge
    sea: { level: 0.09, ref: 12, reach: 220, low: 360, swell: [0.083, 0.051], depth: 0.75 },   // the sea's swell: slower and deeper
  },

  // ---- life ----------------------------------------------------------------------
  // `every`: seconds per slot; `chance`: of a call in a slot; `reach`: how far
  // off it is heard; `level` at `ref` metres.
  birds: {
    song: { level: 0.035, ref: 8, reach: 75, every: 2.6, chance: [0.06, 0.32], notes: [3, 7], pitch: [2600, 5800], note: [0.045, 0.13] },   // songbirds at forest edges and copses: day, and the dawn and dusk choruses
    chorus: { dawn: [4.6, 7.4], dusk: [18.2, 20.6] },
    edge: 2,                    // a tree is at an edge with fewer than this many neighbours on its open side
    near: 6,                    // at most this many singing trees heard at once (the nearest)
    gull: { level: 0.03, ref: 10, reach: 160, every: 5, chance: 0.18, pitch: [950, 1500] },
    crow: { level: 0.03, ref: 10, reach: 140, every: 6, chance: 0.15, pitch: 620 },
    finch: { level: 0.022, ref: 6, reach: 60, every: 1.4, chance: 0.22, pitch: [3800, 6400] },
  },
  animals: {
    sheep: { level: 0.035, ref: 8, reach: 120, every: 6, chance: 0.09, pitch: 290 },
    cattle: { level: 0.04, ref: 10, reach: 170, every: 9, chance: 0.08, pitch: 105 },
    hens: { level: 0.022, ref: 5, reach: 50, every: 2, chance: 0.12, pitch: 560 },
    duck: { level: 0.028, ref: 6, reach: 80, every: 6, chance: 0.08, pitch: 360 },
    dog: { level: 0.05, ref: 8, reach: 160, pitch: 420, near: 14 },   // barks once as you come within `near` metres (again once you have gone)
    deer: { level: 0.05, ref: 10, reach: 120 },            // breaking cover: a rustle and hooves
  },

  // ---- the player ------------------------------------------------------------------
  // Footsteps at the walk's own stride (src/world/things.js HANDS.stride:
  // two steps a stride), each by the ground under the foot.
  steps: {
    level: 0.05, run: 1.7,      // walking; running is this much louder
    every: 2,                   // one step in this many is heard (every step was too busy)
    stride: 1.3,                // metres a stride (two steps)
    runStride: 1.7,
    // per material: [band-pass Hz, q, decay s, thump Hz (0: none), thump share, grit (crunch grains)]
    meadow: [700, 0.6, 0.075, 0, 0, 0],
    road: [900, 0.9, 0.06, 0, 0, 0.5],
    sand: [2400, 0.5, 0.11, 0, 0, 0.2],
    stone: [1900, 1.1, 0.035, 140, 0.4, 0],
    timber: [420, 1.4, 0.09, 120, 0.8, 0],
    water: [1100, 0.7, 0.24, 0, 0, 0],
    snow: [2900, 0.6, 0.13, 0, 0, 1],
    splash: { level: 0.06, band: 1300, decay: 0.3 },          // wading
    creak: { level: 0.03, pitch: [175, 135], band: 820, q: 6, decay: 0.32, every: 1 },   // timber stairs: a creak every so many heard steps
    land: { level: 0.08, pitch: [95, 48], decay: 0.16 },       // a jump's landing
    echo: { delay: 0.11, feedback: 0.34, low: 1600, wet: 0.55 },   // in the fort's gate passage
  },

  // ---- places ----------------------------------------------------------------------
  fire: {
    torch: { level: 0.022, ref: 2.5, reach: 22, low: 700, pop: { every: 0.3, chance: 0.35, level: 0.035, band: 2600 } },
    hearth: { level: 0.03, ref: 3, reach: 14, low: 520, pop: { every: 0.45, chance: 0.4, level: 0.03, band: 2000 } },
    near: 3,                    // at most this many fires heard at once (the nearest)
  },
  well: { level: 0.04, ref: 5, reach: 45, every: 9, rope: [210, 260], splash: 1500 },   // someone drawing water: the rope's creak, the bucket
  bell: { level: 0.09, ref: 25, reach: 900, pitch: 523, partials: [[1, 1], [2.0, 0.5], [2.39, 0.35], [3.0, 0.25], [4.16, 0.15]], decay: 3.2, apart: 2.4, hours: [6, 21] },   // the chapel's bell, the hour's count, by day
  latch: { level: 0.04, ref: 4, reach: 40 },                   // a door's latch as someone goes in or out

  // ---- music (0.5.3) ------------------------------------------------------------------
  // Slow, soft music made in code (src/sound/music.js): a warm pad, a
  // felt-piano roll under it, now and then a melody on the piano or a soft
  // flute, all in a long room's echo. Three tracks run one into the next
  // and round again (0.5.4). It is not of the world: not placed, not in
  // the voices, and it plays on (softer) under the menu and an exchange;
  // it is darker by night and in rain.
  music: {
    level: 0.16,                // the bus at full, of the master volume
    default: 0.7,               // the menu's music slider to start with
    first: 4,                   // seconds after the sound starts before the first piece
    // three tracks, each running into the next (C major, F Lydian, G
    // Mixolydian: each a step that leads on, the last back to the first),
    // then round again; each track's tune and rolls from its seed
    tracks: [
      { name: 'morning field', seed: 11, mode: 'ionian', root: 48, bpm: 62, lead: 'keys', prog: [0, 5, 3, 4], cycles: 3 },
      { name: 'still water', seed: 23, mode: 'lydian', root: 53, bpm: 57, lead: 'flute', prog: [0, 1, 5, 4], cycles: 3 },
      { name: 'long road', seed: 37, mode: 'mixolydian', root: 55, bpm: 64, lead: 'keys', prog: [0, 6, 3, 0], cycles: 3 },
    ],
    handoff: 0.7,               // the next track begins this far (of a chord) into the last one's home chord
    lookahead: 0.6,             // seconds of notes scheduled ahead
    bpm: { day: [58, 68], night: [48, 56] },
    cycles: { day: 3, night: 2 },   // times round the four chords
    chordBeats: 8,              // beats a chord (two bars)
    duck: { menu: 0.6, talk: 0.8 },   // its level under the menu and an exchange (it plays on)
    tone: { day: 4800, night: 3400, rain: 2600 },   // the bus's low-pass: warm, darker by night and in rain
    room: { seconds: 3.8, decay: 2.4, wet: 0.55, dry: 0.75 },   // the echo: a long soft room
    keys: { level: 0.5, decay: [5, 1.8], body: 0.3 },     // the felt piano: its ring (low to high notes), the early fall
    flute: { level: 0.3, vibrato: [5.1, 0.006], breath: 0.05, low: 2600 },
    pad: { level: 0.065, attack: 2.6, release: 3.4, low: [650, 1050], detune: 7 },
    bass: { level: 0.13, low: 300 },
    bell: { level: 0.24, decay: 1.6 },   // a few high notes on the last chord
  },
};
