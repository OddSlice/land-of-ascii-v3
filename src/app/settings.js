// The Display choices the menu remembers between visits (phase 2b), in
// localStorage. Never the seed, the time or the weather: a plain visit always
// opens the default world. Storage can be missing or throw (a private window,
// blocked site data), so every read and write is guarded and the game runs the
// same without it.
const KEY = 'land-of-ascii-v3.display';
const SEEN = 'land-of-ascii-v3.seen';

export const DISPLAY_DEFAULTS = { density: 2, glyphs: true, hud: 'none', sensitivity: 1, invert: false };
const HUDS = ['none', 'minimal', 'full'];

function read(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* not kept: fine */ }
}

// The remembered Display choices, each checked, else its default.
export function loadDisplay() {
  const d = { ...DISPLAY_DEFAULTS };
  let s = null;
  try { s = JSON.parse(read(KEY) || 'null'); } catch { s = null; }
  if (s && typeof s === 'object') {
    if (Number.isInteger(s.density) && s.density >= 0 && s.density <= 3) d.density = s.density;
    if (typeof s.glyphs === 'boolean') d.glyphs = s.glyphs;
    if (HUDS.includes(s.hud)) d.hud = s.hud;
    if (typeof s.sensitivity === 'number' && s.sensitivity >= 0.25 && s.sensitivity <= 3) d.sensitivity = s.sensitivity;
    if (typeof s.invert === 'boolean') d.invert = s.invert;
  }
  return d;
}

export function saveDisplay(d) {
  write(KEY, JSON.stringify({ density: d.density, glyphs: d.glyphs, hud: d.hud, sensitivity: d.sensitivity, invert: d.invert }));
}

// Whether the start card has been seen (it shows on the first visit only).
export function seenCard() { return read(SEEN) === '1'; }
export function markCardSeen() { write(SEEN, '1'); }
