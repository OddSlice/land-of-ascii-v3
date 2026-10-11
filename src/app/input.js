import { LOOK } from '../look.js';

// Keyboard and mouse. Mouse look uses pointer lock after a click; where the
// lock is refused (the Claude app's browser pane, some embeds) dragging with
// the mouse looks around instead, and the arrow keys always do.
export class Input {
  constructor(target, actions) {
    this.keys = {};
    this.look = { dx: 0, dy: 0 };
    this.locked = false;
    this.dragging = false;
    this.actions = actions;
    addEventListener('keydown', (e) => {
      if (e.repeat && !e.code.startsWith('Arrow') && !e.code.startsWith('Key')) return;
      this.keys[e.code] = true;
      if (!e.repeat) this.press(e);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
    target.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.lastX = e.clientX; this.lastY = e.clientY;
      if (!this.locked && target.requestPointerLock) {
        try {
          const p = target.requestPointerLock();
          if (p && p.catch) p.catch(() => {});
        } catch { /* refused: dragging still looks */ }
      }
    });
    addEventListener('mouseup', () => { this.dragging = false; });
    addEventListener('mousemove', (e) => {
      if (this.locked) { this.look.dx += e.movementX; this.look.dy += e.movementY; return; }
      // dragging: from the cursor's own positions (some engines report no movementX)
      if (this.dragging) {
        this.look.dx += e.clientX - this.lastX; this.look.dy += e.clientY - this.lastY;
        this.lastX = e.clientX; this.lastY = e.clientY;
      }
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === target; });
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
      case 'KeyL': a.toggleLook(); break;
      case 'KeyF': if (a.toggleFly) a.toggleFly(); break;
      case 'KeyM': if (a.toggleMap) a.toggleMap(); break;
      default: {
        // the look panel's keys (LOOK.choices)
        for (const [name, c] of Object.entries(LOOK.choices)) if (e.code === `Digit${c.key}`) a.cycleLook(name);
        break;
      }
      case 'Minus': case 'NumpadSubtract': a.density(-1); break;
      case 'Equal': case 'NumpadAdd': a.density(1); break;
    }
  }

  // Look change since last frame, in radians.
  takeLook(dt) {
    const k = 0.0022;
    let yaw = this.look.dx * k, pitch = -this.look.dy * k;
    this.look.dx = 0; this.look.dy = 0;
    if (this.keys.ArrowLeft) yaw -= 1.7 * dt;
    if (this.keys.ArrowRight) yaw += 1.7 * dt;
    if (this.keys.ArrowUp) pitch += 1.1 * dt;
    if (this.keys.ArrowDown) pitch -= 1.1 * dt;
    return { yaw, pitch };
  }
}
