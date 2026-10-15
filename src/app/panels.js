// The menu and the journal opening and closing over the world (src/main.js
// makes them), and Escape: it answers an exchange, shuts a sketch, closes
// the journal or the menu, or opens the menu; the browser freeing the mouse
// on that same Escape opens it too, so one press always works.
import { hideHint } from './notes.js';
import { F as FAVOUR } from '../game/progress.js';

// the page's state (src/main.js), read live
let app = null;
export function initPanels(a) { app = a; }

let menuOpenedAt = 0;

export function toggleJournal() { if (app.journal.open) closeJournal(); else openJournal(); }
let journalOpenedYet = false;
export function openJournal(tab) {
  if (!app.way || !app.way.on || app.QUIET || app.state.failed || app.card.up || app.menu.open || app.journal.open) return false;
  // (phase 6) the first time, on the favour you are doing, if there is one
  if (!tab && !journalOpenedYet && Object.values(app.way.progress.favours).some((f) => f.s === FAVOUR.TAKEN || f.s === FAVOUR.GOT)) tab = 'favours';
  journalOpenedYet = true;
  app.input.clear();
  app.talk.close();
  app.journal.show(tab);
  journalOpenedAt = performance.now();
  if (document.pointerLockElement) { app.releasing = true; document.exitPointerLock(); }
  return true;
}
export function closeJournal(recapture = false) {
  if (!app.journal.open) return;
  app.journal.hide();
  app.input.clear();
  if (recapture) app.input.capture();
}
let journalOpenedAt = 0;

export function openMenu() {
  if (app.QUIET || app.state.failed || app.menu.open) return false;
  app.input.clear();
  app.menu.show();
  menuOpenedAt = performance.now();
  hideHint();
  // (the menu gives the mouse back; that is not a reason to open it again)
  if (document.pointerLockElement) { app.releasing = true; document.exitPointerLock(); }
  return true;
}
// Resume takes the mouse again; Escape, a click beside the menu or anything
// else that closes it does not.
export function closeMenu(recapture = false) {
  if (!app.menu.open) return;
  // (a benchmark under way stops, and puts everything back)
  app.game.bench.cancel();
  app.menu.hide();
  app.input.clear();
  // (phase 6) back to the title screen, if it is up
  if (app.card.up) { app.title.forward(); app.title.playBtn.focus({ preventScroll: true }); return; }
  if (recapture) app.input.capture();
}
export function onEscape() {
  // (phase 6) the title screen: Escape closes its menu, else nothing
  if (app.card.up && !app.menu.open) return;
  if (app.away) { app.comeBack(false); return; }
  // (phase 5a) an exchange: another time; the journal: its sketch, then itself
  if (app.talk.open) { app.talk.later(); return; }
  if (app.journal.open) {
    if (performance.now() - journalOpenedAt < 350) return;
    if (!app.journal.shutViewer()) closeJournal(false);
    return;
  }
  if (app.menu.open) {
    // (the browser may deliver the Escape that freed the mouse after the
    // menu has already opened for it)
    if (performance.now() - menuOpenedAt < 350) return;
    closeMenu(false);
  } else openMenu();
}
// The browser frees a captured mouse on the first Escape (or when the tab is
// left): open the menu then too, so one press always works.
export function onUnlocked() {
  if (app.releasing) { app.releasing = false; return; }
  if (app.card.up || app.away) return;
  // (the Escape that freed the mouse during an exchange answers it)
  if (app.talk.open) { app.talk.later(); return; }
  if (app.journal.open) return;
  openMenu();
}
