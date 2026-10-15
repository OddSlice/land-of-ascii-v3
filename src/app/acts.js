// What the player does in the world (src/app/input.js passes the keys on):
// greet whoever is near (E), with their line, or the exchange of a favour
// (src/app/talk.js); sketch the view (K); light the lantern or put it away
// (L), once it is theirs.
import { showNote, showSay } from './notes.js';

// the page's state (src/main.js), read live
let app = null;
export function initActs(a) { app = a; }

// (phase 4a) Greeting whoever is in front of you (E): their line, a few seconds.
// (phase 5a) Or, if they have a favour to ask or you bring them what they
// asked for, an exchange of a few lines with a choice; E again goes on.
let greetCount = 0;
export function greet() {
  if (app.talk.open) { app.talk.go(); return; }
  if (!app.people || !app.people.on || app.QUIET || app.menu.open || app.journal.open) return;
  const i = app.people.greetable({ x: app.player.x, z: app.player.z, feet: app.player.feet, yaw: app.player.yaw });
  if (i < 0) return;
  const ex = app.way && app.way.on ? app.way.greet(i, { day: app.state.day, hour: app.state.hour }) : null;
  if (ex) { app.showTalk(ex, i); app.lab.lastSaid = { name: ex.who.name, role: ex.who.role, text: ex.pages[0].lines.join(' '), exchange: true }; return; }
  const said = app.people.say(i, app.state.day, app.state.hour, app.weatherNow());
  const hail = app.way ? app.way.hail(i, greetCount++) : '';
  if (hail) said.text = `${hail} ${said.text}`;
  showSay(said.name, said.role, said.text);
  app.lab.lastSaid = said;
}
// K: the view in front of you, kept in the journal.
export function sketch() {
  if (!app.way || !app.way.on || app.menu.open || app.journal.open || app.card.up || (app.map && app.map.on) || !app.full) return;
  app.way.sketch(app.full.slice(), app.grid.cols, app.grid.rows, { x: app.player.x, z: app.player.z, feet: app.player.feet, day: app.state.day, hour: app.state.hour, weather: app.weatherName() })
    .then((rec) => { if (rec && rec.full) showNote('The journal has no room for more sketches.'); app.lab.lastSketch = rec; });
}
// L: the lantern, once you have it.
export function lantern() {
  if (!app.way || !app.way.on) return false;
  if (!app.way.progress.lantern) { if (!app.QUIET) showNote('You have no lantern yet.'); return true; }
  app.way.toggleLantern();
  return true;
}
