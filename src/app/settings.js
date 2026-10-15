// The Display choices the menu remembers between visits (phase 2b), in
// localStorage. Never the seed, the time or the weather: a plain visit always
// opens the default world. Storage can be missing or throw (a private window,
// blocked site data), so every read and write is guarded and the game runs the
// same without it.
const KEY = 'land-of-ascii-v3.display';

// (the statistics are on by default since after phase 2b: the frame rate, the
// frame time, the cells, the time and the weather on one line; choices kept
// before then, version 1, had them off by default, so their `hud` is dropped)
// (phase 6) text: the size of the menu's, the journal's and the prompts'
// words (1, 1.15 or 1.3); motion: 'system' (follow the device's reduced
// motion setting), 'reduced' or 'full'; cap: the frame rate held at 30 or
// 60, or 0 for none; auto: the detail level was chosen by measuring this
// machine (the first visit), so it is not measured again.
export const DISPLAY_DEFAULTS = { density: 2, glyphs: true, hud: 'minimal', sensitivity: 1, invert: false, text: 1, motion: 'system', cap: 0, auto: false };
export const TEXT_SIZES = [1, 1.15, 1.3];
export const MOTIONS = ['system', 'reduced', 'full'];
export const CAPS = [0, 60, 30];
const VERSION = 2;
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
    if (HUDS.includes(s.hud) && s.v === VERSION) d.hud = s.hud;
    if (typeof s.sensitivity === 'number' && s.sensitivity >= 0.25 && s.sensitivity <= 3) d.sensitivity = s.sensitivity;
    if (typeof s.invert === 'boolean') d.invert = s.invert;
    if (TEXT_SIZES.includes(s.text)) d.text = s.text;
    if (MOTIONS.includes(s.motion)) d.motion = s.motion;
    if (CAPS.includes(s.cap)) d.cap = s.cap;
    if (s.auto === true) d.auto = true;
  }
  return d;
}

// (phase 6) Whether any Display choices were kept here before (a player
// who has chosen keeps their choice: the detail level is measured only on
// a first visit).
export function hasDisplay() { return read(KEY) !== null; }

export function saveDisplay(d) {
  write(KEY, JSON.stringify({ v: VERSION, density: d.density, glyphs: d.glyphs, hud: d.hud, sensitivity: d.sensitivity, invert: d.invert, text: d.text, motion: d.motion, cap: d.cap, auto: d.auto }));
}

// (phase 6) How many times the title screen has opened in this browser (its
// welcome line changes each visit).
const VISITS = 'land-of-ascii-v3.visits';
export function nextVisit() { const n = (parseInt(read(VISITS), 10) || 0) + 1; write(VISITS, String(n)); return n; }

// Is reduced motion wanted, by the choice or (on 'system') by the device?
export function reducedMotion(d) {
  if (d.motion === 'reduced') return true;
  if (d.motion === 'full') return false;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
