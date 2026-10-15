// Words on the screen (src/main.js decides when): the prompt naming who E
// would greet, what a signpost says while you stand by it (0.5.5), what
// someone says when greeted, a quiet note (a place found, a key for a new
// thing), and the hint of the keys that matter.
import { keyLabel } from './keys.js';
import { compass as compassWord } from '../game/places.js';
import { armYaw } from '../game/signs.js';

// the page's state (src/main.js), read live
let app = null;
export function initNotes(a) { app = a; }

let sayTimer = 0;

// (0.5.5) Who you could greet (E), and the signpost you stand by: shown
// low on the screen while they are near. The posts are read one at a
// time when the page has a moment, or at once when you come up to one.
let promptFor = -2, signFor = null, signFrames = 0;
export function nearbyUI() {
  const blocked = app.menu.open || app.journal.open || app.talk.open || app.card.up || (app.map && app.map.on);
  // the prompt
  const i = !blocked && app.people && app.people.on ? app.people.greetable({ x: app.player.x, z: app.player.z, feet: app.player.feet, yaw: app.player.yaw }) : -1;
  const pr = app.$('prompt'), hintOn = app.$('hint').classList.contains('on');
  if (i !== promptFor) {
    promptFor = i;
    const who = i >= 0 ? app.people.nameOf(i) : null;
    const w = pr.querySelector('.what');
    w.textContent = '';
    if (who) { w.append('talk to '); const b = document.createElement('b'); b.textContent = who.name; w.append(b); }
  }
  // (phase 6: someone to greet matters more than the hint, which gives way)
  if (i >= 0 && hintOn) hideHint();
  pr.classList.toggle('on', i >= 0);
  // the signpost
  if (!app.signs) return;
  if (++signFrames % 20 === 0) app.signs.step();
  const post = blocked || app.$('say').classList.contains('on') ? null : app.signs.near(app.player.x, app.player.z, app.player.feet);
  const el = app.$('sign');
  if (post !== signFor) {
    signFor = post;
    const ul = el.querySelector('ul');
    ul.innerHTML = '';
    if (post) {
      el.querySelector('.head').textContent = 'The signpost reads';
      for (const arm of post.arms) {
        const to = arm.to.filter((t) => t.dist > 60);
        if (!to.length) continue;
        const li = document.createElement('li'); li.dataset.yaw = String(armYaw(arm.a));
        li.innerHTML = '<span class="dir"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 13h-4.5v8h-5v-8H5z"/></svg></span><span class="to"></span><span class="far"></span>';
        const t = li.querySelector('.to'), f = li.querySelector('.far');
        to.forEach((d, k) => { if (k) t.append(', '); const b = document.createElement('b'); b.textContent = d.name; t.append(b); });
        const dir = document.createElement('i');
        dir.textContent = ` · ${compassWord(post.x, post.z, post.x + Math.cos(arm.a), post.z + Math.sin(arm.a))}`;
        t.append(dir);
        f.textContent = to.map((d) => (d.dist < 950 ? `${Math.round(d.dist / 10) * 10} m` : `${(d.dist / 1000).toFixed(1)} km`)).join(', ');
        ul.append(li);
      }
      if (!ul.children.length) { const li = document.createElement('li'); li.textContent = 'Its arms are weathered blank.'; ul.append(li); }
    }
  }
  el.classList.toggle('on', !!post);
  // each arm's arrow, turned as you turn: up is the way you face
  if (post) for (const li of el.querySelectorAll('li[data-yaw]')) {
    const rel = (Number(li.dataset.yaw) - app.player.yaw) * 180 / Math.PI;
    li.querySelector('svg').style.transform = `rotate(${rel.toFixed(1)}deg)`;
  }
}
export function showSay(name, role, text) {
  const el = app.$('say');
  el.querySelector('.who').innerHTML = '';
  if (name) { const b = document.createElement('b'); b.textContent = name; el.querySelector('.who').append(b, document.createTextNode(` · ${role}`)); }
  el.querySelector('.line').textContent = text;
  el.classList.add('on');
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => el.classList.remove('on'), 5200);
}
export function hideSay() { clearTimeout(sayTimer); app.$('say').classList.remove('on'); }
// A quiet note low on the screen (a place found, a key for a new thing).
let noteTimer = 0;
export function showNote(text, key = null, ms = 4200) {
  if (app.QUIET) return;
  hideHint();
  const el = app.$('note');
  el.replaceChildren();
  if (key) { const k = document.createElement('kbd'); k.textContent = key; el.append(k); }
  el.append(document.createTextNode(text));
  el.classList.add('on');
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => el.classList.remove('on'), ms);
}

// The hint that Escape opens the menu, fading after a few seconds.
let hintTimer = 0;
export function showHint(keysToo = false) {
  if (app.QUIET || app.state.failed) return;
  const el = app.$('hint');
  // (phase 6) on a first walk, the keys that matter (as the player has them), for longer
  const cap = (k) => `<kbd>${keyLabel(k).replace(/[<&]/g, '')}</kbd>`;
  el.innerHTML = keysToo
    ? `${cap(app.keys.forward)}${cap(app.keys.left)}${cap(app.keys.back)}${cap(app.keys.right)}walk · click the picture to look round · ${cap(app.keys.greet)}greet · <kbd>Esc</kbd>menu`
    : '<kbd>Esc</kbd>menu and controls';
  el.classList.add('on');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => el.classList.remove('on'), keysToo ? 10000 : 4000);
}
export function hideHint() { clearTimeout(hintTimer); app.$('hint').classList.remove('on'); }
