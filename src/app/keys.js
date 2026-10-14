// The keys a player can change (phase 6): Controls in the menu lists each
// with its key, and a button that takes the next key pressed. The game and
// the tools still speak the default keys' names (KeyW, KeyE, ...): Input
// turns a pressed key into the default key of the action it is bound to,
// and a default key whose action has moved elsewhere into nothing. Kept in
// the browser, as the Display choices are.
//
// A key already bound to another action, or one the game keeps for itself
// (Escape, Tab, the arrow keys, the time and camera keys), is refused.
const KEY = 'land-of-ascii-v3.keys';

// [action, words, default key, a short name for Controls]
export const ACTIONS = [
  ['forward', 'walk forward', 'KeyW', 'walk forward'],
  ['left', 'walk left', 'KeyA', 'walk left'],
  ['back', 'walk back', 'KeyS', 'walk back'],
  ['right', 'walk right', 'KeyD', 'walk right'],
  ['run', 'run, while held', 'ShiftLeft', 'run'],
  ['jump', 'jump; rise, while flying', 'Space', 'jump'],
  ['greet', 'greet someone; say yes to a favour', 'KeyE', 'greet'],
  ['fly', 'fly on or off', 'KeyF', 'fly'],
  ['journal', 'your journal', 'KeyJ', 'journal'],
  ['sketch', 'sketch the view', 'KeyK', 'sketch'],
  ['lantern', 'your lantern, once you have one', 'KeyL', 'lantern'],
  ['map', 'the map', 'KeyM', 'map'],
  ['mute', 'sound on or off', 'KeyN', 'sound'],
];
const DEFAULT = Object.fromEntries(ACTIONS.map(([a, , k]) => [a, k]));
// keys the game keeps: never bound to an action
const KEPT = new Set(['Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Digit1', 'Digit2', 'Digit3', 'Digit4',
  'KeyT', 'KeyC', 'KeyG', 'KeyH', 'KeyR', 'KeyX', 'Minus', 'Equal', 'NumpadSubtract', 'NumpadAdd', 'F11', 'MetaLeft', 'MetaRight', 'ContextMenu']);

export function loadKeys() {
  const b = { ...DEFAULT };
  let s = null;
  try { s = JSON.parse(window.localStorage.getItem(KEY) || 'null'); } catch { s = null; }
  if (s && typeof s === 'object') {
    const used = new Set();
    for (const [a] of ACTIONS) {
      const k = s[a];
      if (typeof k === 'string' && /^[A-Za-z0-9]+$/.test(k) && !KEPT.has(k) && !used.has(k)) b[a] = k;
      used.add(b[a]);
    }
    // (two actions on one key after all: back to the defaults)
    if (new Set(Object.values(b)).size !== ACTIONS.length) return { ...DEFAULT };
  }
  return b;
}
export function saveKeys(b) {
  try { window.localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* not kept */ }
}
export const defaultKeys = () => ({ ...DEFAULT });
export const isDefault = (b) => ACTIONS.every(([a]) => b[a] === DEFAULT[a]);

// Can `action` take `code`? null if so, else why not, in a few words.
export function refuse(b, action, code) {
  if (KEPT.has(code)) return `${keyLabel(code)} is kept by the game`;
  const other = ACTIONS.find(([a]) => a !== action && b[a] === code);
  if (other) return `${keyLabel(code)} is already ${other[1].split(';')[0]}`;
  return null;
}

// The map from a pressed key to the default key the game listens for:
// { code: defaultCode }, or { code: '' } for a default key whose action has
// moved. Keys bound to nothing pass as they are.
export function remapOf(b) {
  const m = {};
  for (const [a] of ACTIONS) if (b[a] !== DEFAULT[a]) { if (!(DEFAULT[a] in m)) m[DEFAULT[a]] = ''; }
  for (const [a] of ACTIONS) m[b[a]] = DEFAULT[a];
  // (Shift is one key to a player: either side runs while run is on Shift)
  if (b.run === 'ShiftLeft') m.ShiftRight = 'ShiftLeft'; else if (!('ShiftRight' in m)) m.ShiftRight = '';
  return m;
}

// A key's name as a keycap shows it.
export function keyLabel(code) {
  if (!code) return '';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `num ${code.slice(6)}`;
  const named = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'right Shift', ControlLeft: 'Ctrl', ControlRight: 'right Ctrl', AltLeft: 'Alt', AltRight: 'right Alt',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    Enter: 'Enter', Backspace: 'Backspace', CapsLock: 'Caps Lock' };
  return named[code] || code;
}
