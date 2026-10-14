// An exchange with someone (phase 5a): what they say when they have a
// favour to ask, or when you bring what they asked for, a page of two or
// three lines at a time, low on the screen in the greetings' quiet style.
// The last page of an ask has a choice: to do it, or another time. E (or
// the button) goes on and says yes; Escape (or the other button) is another
// time. (phase 5b) While it is open the clock stands still and the world
// dims under it, the mouse is free to click the buttons, and every page
// waits for an answer; E or a button on the last takes the mouse back.
import { icon } from './icons.js';

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
};

export class Talk {
  // `answer(favourId, yes)`: returns the line said back; `gift(kind)`: a
  // page that gives something has been shown.
  // `done(recapture)`: the exchange has closed (recapture: by E or a
  // button, so the mouse is taken back for looking).
  constructor(el, { answer, gift, words, done }) {
    this.el = el;
    this.done = done || (() => {});
    this.answer = answer;
    this.gift = gift;
    this.words = words;            // { yes, no, on, bye }
    this.open = false;
    this.timer = 0;
    this.who = h('div', { class: 'who' });
    this.lines = h('div', { class: 'lines' });
    this.choice = h('div', { class: 'choice' });
    el.append(this.who, this.lines, this.choice);
  }

  // Show an exchange: { who: { name, role }, pages: [{ lines, choice?,
  // favour?, gift? }] }; `person`: whom it is with (walking away ends it).
  show(ex, person) {
    clearTimeout(this.timer);
    this.ex = ex; this.k = 0; this.person = person;
    this.open = true;
    this.who.replaceChildren(h('b', {}, ex.who.name), ` · ${ex.who.role}`);
    this.el.hidden = false;
    this.el.classList.add('on');
    this.render();
  }

  render() {
    const pg = this.ex.pages[this.k];
    this.lines.replaceChildren(...pg.lines.map((l) => h('p', {}, l)));
    if (pg.gift) this.gift(pg.gift);
    const last = this.k === this.ex.pages.length - 1;
    if (pg.choice) {
      this.choice.replaceChildren(
        h('button', { type: 'button', class: 'yes', onclick: () => this.choose(true) }, h('kbd', {}, 'E'), h('span', {}, this.words.yes)),
        h('button', { type: 'button', onclick: () => this.choose(false) }, h('kbd', {}, 'Esc'), h('span', {}, this.words.no)));
    } else {
      this.choice.replaceChildren(h('button', { type: 'button', class: 'yes', onclick: () => this.go() }, h('kbd', {}, 'E'), h('span', {}, last ? this.words.bye : this.words.on)));
    }
  }

  // E: on to the next page, or yes.
  go() {
    if (!this.open) return;
    const pg = this.ex.pages[this.k];
    if (pg.choice) { this.choose(true); return; }
    if (this.k < this.ex.pages.length - 1) { this.k++; this.render(); } else this.close(true);
  }

  choose(yes) {
    if (!this.open) return;
    const pg = this.ex.pages[this.k];
    if (!pg.choice) { if (yes) this.go(); else this.close(); return; }
    const said = this.answer(pg.favour, yes);
    this.ex.pages = [...this.ex.pages.slice(0, this.k + 1), { lines: [said] }];
    this.ex.pages[this.k] = { ...pg, choice: false };
    this.k++;
    this.render();
  }

  // Escape: another time (a choice left open stays asked).
  later() {
    if (!this.open) return;
    const pg = this.ex.pages[this.k];
    if (pg.choice) this.choose(false); else this.close();
  }

  close(recapture = false) {
    clearTimeout(this.timer);
    if (!this.open) return;
    this.open = false;
    this.done(recapture);
    this.el.classList.remove('on');
    if (this.el.contains(document.activeElement)) document.activeElement.blur();
    setTimeout(() => { if (!this.open) this.el.hidden = true; }, 280);
  }

  // For the tools: what is shown.
  read() { return this.open ? { who: this.ex.who, page: this.k, pages: this.ex.pages.length, lines: this.ex.pages[this.k].lines.slice(), choice: !!this.ex.pages[this.k].choice } : null; }
}

export { icon };
