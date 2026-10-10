// The look panel (L): the look candidates of LOOK.choices, each with its
// options and the key that cycles it. Shown on the live site too, so a look
// can be chosen by eye.
import { LOOK } from '../look.js';

const CH = LOOK.choices;

// The defaults, overridden by any valid values in `from` (URL options or lab.setLook).
export function lookFrom(from = {}, base = null) {
  const out = {};
  for (const [name, c] of Object.entries(CH)) {
    const opts = Object.keys(c.options);
    let v = from[name] !== undefined && from[name] !== null ? String(from[name]) : null;
    if (v === null || !opts.includes(v)) v = base ? String(base[name]) : String(c.default);
    out[name] = typeof c.default === 'number' ? Number(v) : v;
  }
  return out;
}

export function nextOption(look, name) {
  const opts = Object.keys(CH[name].options);
  const i = opts.indexOf(String(look[name]));
  return lookFrom({ ...look, [name]: opts[(i + 1) % opts.length] });
}

export class LookPanel {
  constructor(el) {
    this.el = el;
    this.on = false;
  }

  toggle() { this.on = !this.on; this.el.style.display = this.on ? '' : 'none'; }

  update(look) {
    if (!this.on) return;
    const rows = Object.entries(CH).map(([name, c]) => {
      const opts = Object.entries(c.options).map(([k, label]) => {
        const t = label.startsWith(k) ? label : `${k} ${label}`;
        return String(look[name]) === k ? `[${t}]` : ` ${t} `;
      });
      return `${c.key}  ${c.label.padEnd(9)} ${opts.join('  ')}`;
    });
    const text = `look  (L closes)\n${rows.join('\n')}`;
    if (text !== this.text) { this.text = text; this.el.textContent = text; }
  }
}
