// The glyph table shared by resolve (which picks indices) and the atlas
// (which draws them). Built from the families in src/look.js, in a fixed
// order, so every thread derives the same indices.
import { LOOK } from './look.js';
import { MAT_NAMES } from './contract.js';

export const GLYPHS = [];          // index -> character
const index = new Map();           // character -> index

function add(ch) {
  if (!index.has(ch)) { index.set(ch, GLYPHS.length); GLYPHS.push(ch); }
  return index.get(ch);
}
add(' ');

// FAMILY[mat] = Uint8Array of glyph indices, light to heavy. (The building
// kit's materials, phase 3a, are added after everything else below, so no
// earlier glyph's index changes.)
const KIT_FIRST = 20;
const familyOf = (name) => {
  const m = LOOK.materials[name];
  if (!m) throw new Error(`look.js has no material "${name}"`);
  return Uint8Array.from([...m.glyphs], add);
};
export const FAMILY = MAT_NAMES.slice(0, KIT_FIRST).map(familyOf);


// The shade blocks, light to heavy: resolve uses them where one thing
// dissolves into another (a cloud's edge into the sky).
export const SHADE_STEPS = Uint8Array.from(['░', '▒', '▓'], add);

// The overhead map's marks (LOOK.map), added after everything else so no
// earlier glyph's index changes.
const MG = LOOK.map.glyphs;
export const MAP_GLYPH = {
  fort: add(MG.fort), village: add(MG.village), viewpoint: add(MG.viewpoint), spawn: add(MG.spawn), you: add(MG.you),
  heading: Uint8Array.from(MG.heading, add),
};

// Rain streaks (phase 2b, LOOK.weather.rain.glyphs): falling straight,
// leaning right, leaning left on screen. Added last, so no earlier index
// changes (they are glyphs the families and the map already have).
export const RAIN_GLYPHS = Uint8Array.from(LOOK.weather.rain.glyphs, add);

// The building kit's families (phase 3a).
for (const name of MAT_NAMES.slice(KIT_FIRST)) FAMILY.push(familyOf(name));

// (phase 4b) A bird in the air seen far off: one mark, its wings up, level
// or down (LOOK.animals.marks.glyphs). Added last, so no earlier index changes.
export const BIRD_GLYPHS = Uint8Array.from(LOOK.animals.marks.glyphs, add);

// Glyphs the atlas draws by hand when the font renders them badly.
export const SHADES = { '░': 0.25, '▒': 0.5, '▓': 0.75, '█': 1 };

if (GLYPHS.length > 256) throw new Error('more than 256 glyphs');
