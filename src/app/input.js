import { LOOK } from '../look.js';

// Keyboard and mouse. Mouse look uses pointer lock after a click; where the
// lock is refused (the Claude app's browser pane, some embeds) dragging with
// the mouse looks around instead, and the arrow keys always do. Escape goes to
// `actions.escape` (the menu, phase 2b); while `blocked()` (the menu or the
// start card is up) the game takes no other key and no mouse look, so typing
// in the menu never moves anything. `sensitivity` and `invert` are the
// menu's mouse choices.
//
// (after phase 3a) Chromium is asked for the mouse's raw movement while it
// holds the mouse (pointer lock with `unadjustedMovement`): with the
// system's pointer acceleration in the way, Chromium on Windows now and
// then reports one movement of hundreds of pixels while the mouse is
// moved fast, and the view skipped. Where raw movement is refused the
// plain lock is taken, and either way a lone jump far bigger than the
// movements just before it is dropped (MoveFilter).
export class Input {
  constructor(target, actions) {
    this.keys = {};
    this.look = { dx: 0, dy: 0 };
    this.locked = false;
    this.dragging = false;
    this.actions = actions;
    this.target = target;
    this.blocked = () => false;
    this.sensitivity = 1;
    this.invert = false;
    this.filter = new MoveFilter();
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.key === 'Escape') { if (!e.repeat && actions.escape) actions.escape(e); return; }
      if (this.blocked()) { if (actions.blockedKey) actions.blockedKey(e); return; }
      if (e.repeat && !e.code.startsWith('Arrow') && !e.code.startsWith('Key')) return;
      this.keys[e.code] = true;
      if (!e.repeat) this.press(e);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
    target.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || this.blocked()) return;
      this.dragging = true;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.capture();
    });
    addEventListener('mouseup', () => { this.dragging = false; });
    addEventListener('mousemove', (e) => {
      if (this.blocked()) return;
      if (this.locked) {
        if (this.filter.take(e.movementX, e.movementY, e.timeStamp)) { this.look.dx += e.movementX; this.look.dy += e.movementY; }
        return;
      }
      // dragging: from the cursor's own positions (some engines report no movementX)
      if (this.dragging) {
        this.look.dx += e.clientX - this.lastX; this.look.dy += e.clientY - this.lastY;
        this.lastX = e.clientX; this.lastY = e.clientY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === target;
      this.filter.reset();
      if (was && !this.locked && actions.unlocked) actions.unlocked();
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; });
  }

  press(e) {
    const a = this.actions;
    switch (e.code) {
      case 'Digit1': a.time('day'); break;
      case 'Digit2': a.time('dusk'); break;
      case 'Digit3': a.time('night'); break;
      case 'Digit4': a.time('dawn'); break;
      case 'KeyT': a.toggleClock(); break;
      case 'KeyC': a.nextCamera(); break;
      case 'KeyG': a.toggleGlyphs(); break;
      case 'KeyR': a.toggleRef(); break;
      case 'KeyH': a.toggleHud(); break;
      case 'KeyX': a.toggleScene(); break;
      // (phase 5a) L: the lantern in the world (Shift L, or L elsewhere: the look panel)
      case 'KeyL': if (e.shiftKey || !a.lantern || !a.lantern()) a.toggleLook(); break;
      case 'KeyJ': if (a.journal) a.journal(); break;
      case 'KeyK': if (a.sketch) a.sketch(); break;
      case 'KeyF': if (a.toggleFly) a.toggleFly(); break;
      case 'KeyM': if (a.toggleMap) a.toggleMap(); break;
      case 'KeyE': if (a.greet) a.greet(); break;
      case 'Space': if (a.jump) a.jump(); break;
      default: {
        // the look panel's keys (LOOK.choices)
        for (const [name, c] of Object.entries(LOOK.choices)) if (e.code === `Digit${c.key}`) a.cycleLook(name);
        break;
      }
      case 'Minus': case 'NumpadSubtract': a.density(-1); break;
      case 'Equal': case 'NumpadAdd': a.density(1); break;
    }
  }

  // Take the mouse for looking (needs a click or key press to have just
  // happened): its raw movement where the browser gives it, else the plain
  // lock; refused, dragging still looks.
  capture() {
    const t = this.target;
    if (this.locked || !t.requestPointerLock) return;
    const plain = () => { try { const p = t.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* refused */ } };
    try {
      const p = t.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch((err) => { if (err && err.name === 'NotSupportedError') plain(); });
    } catch { plain(); }
  }

  // Forget held keys and mouse movement (the menu has opened).
  clear() { this.keys = {}; this.look.dx = 0; this.look.dy = 0; this.dragging = false; }

  // Look change since last frame, in radians.
  takeLook(dt) {
    const k = 0.0022 * this.sensitivity;
    let yaw = this.look.dx * k, pitch = (this.invert ? 1 : -1) * this.look.dy * k;
    this.look.dx = 0; this.look.dy = 0;
    if (this.keys.ArrowLeft) yaw -= 1.7 * dt;
    if (this.keys.ArrowRight) yaw += 1.7 * dt;
    if (this.keys.ArrowUp) pitch += 1.1 * dt;
    if (this.keys.ArrowDown) pitch -= 1.1 * dt;
    return { yaw, pitch };
  }
}

// Drops a lone mouse movement far bigger than those just before it (the
// largest in the last `WINDOW` ms): more than `JUMP` pixels and `RATIO`
// times that. A real fast flick builds up over several movements, so it
// passes; and a dropped one is remembered, so a second big one right after
// it passes too.
const WINDOW = 80, JUMP = 150, RATIO = 6;
export class MoveFilter {
  constructor() { this.reset(); }
  reset() { this.t = new Float64Array(8); this.m = new Float64Array(8); this.k = 0; }
  // true: use this movement
  take(dx, dy, now) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    let recent = 0;
    for (let i = 0; i < 8; i++) if (now - this.t[i] <= WINDOW && this.m[i] > recent) recent = this.m[i];
    this.t[this.k] = now; this.m[this.k] = m; this.k = (this.k + 1) & 7;
    return !(m > JUMP && m > RATIO * Math.max(recent, 4));
  }
}
