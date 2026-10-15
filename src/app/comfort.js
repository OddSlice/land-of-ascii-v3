// Comfort (phase 6): the pause while the window is elsewhere (a click or
// Enter goes on), full screen on F11 or the Display section's button, and
// the link that shares this world. It reads and sets the page's state
// through `app` (src/main.js).
import { showNote } from './notes.js';

// the page's state (src/main.js), read live
let app = null;
export function initComfort(a) {
  app = a;
  addEventListener('blur', goAway);
  document.addEventListener('visibilitychange', () => { if (document.hidden) goAway(); });
  app.$('away').addEventListener('click', () => comeBack(true));
  addEventListener('keydown', (e) => { if (app.away && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); comeBack(true); } });
  addEventListener('keydown', (e) => { if (e.code === 'F11' && !e.repeat && !app.QUIET) { e.preventDefault(); toggleFullscreen(); } }, true);
}

export function goAway() {
  if (!app.started || app.QUIET || app.state.failed || app.away || app.card.up || app.menu.open || app.journal.open || app.talk.open) return;
  app.away = true;
  app.input.clear();
  app.$('away').classList.add('on');
}
export function comeBack(capture) {
  if (!app.away) return;
  app.away = false;
  app.$('away').classList.remove('on');
  app.input.clear();
  if (capture) app.input.capture();
}

// (phase 6) Full screen: F11 or the Display section's button. Leaving it
// (Escape) frees the mouse too, as leaving the mouse does.
export function toggleFullscreen() {
  const playing = () => !app.menu.open && !app.card.up && !app.journal.open && !app.talk.open && !app.away;
  if (document.fullscreenElement) {
    // (leaving it with F11 or the button is not leaving the game: the mouse
    // it frees does not open the menu, and is taken again)
    if (document.pointerLockElement) app.releasing = true;
    document.exitFullscreen().then(() => { if (playing()) app.input.capture(); }).catch(() => {});
    return;
  }
  const el = document.documentElement;
  if (!el.requestFullscreen) { showNote('This browser can\'t go full screen here.'); return; }
  el.requestFullscreen({ navigationUI: 'hide' }).then(() => { if (playing()) app.input.capture(); }).catch(() => showNote('The browser wouldn\'t go full screen here.'));
}

// (phase 6) the link that shares this world: its seed, and if asked where
// you stand and the hour
export function shareLink(withPlace) {
  const q = new URLSearchParams({ seed: String(app.SEED) });
  if (withPlace) {
    const yaw = Math.round((((app.player.yaw / app.DEG) % 360) + 360) % 360);
    q.set('at', `${app.player.x.toFixed(1)},${app.player.z.toFixed(1)},${yaw}`);
    q.set('hour', app.state.hour.toFixed(2));
  }
  return `${location.origin}${location.pathname}?${q}`;
}
