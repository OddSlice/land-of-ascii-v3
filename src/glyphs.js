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

// FAMILY[mat] = Uint8Array of glyph indices, light to heavy.
export const FAMILY = MAT_NAMES.map((name) => {
  const m = LOOK.materials[name];
  if (!m) throw new Error(`look.js has no material "${name}"`);
  return Uint8Array.from([...m.glyphs], add);
});

if (GLYPHS.length > 256) throw new Error('more than 256 glyphs');

// Glyphs the atlas draws by hand when the font renders them badly.
export const SHADES = { '░': 0.25, '▒': 0.5, '▓': 0.75, '█': 1 };
