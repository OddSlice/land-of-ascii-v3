// The game's own font, Cascadia Mono (the first in its stack: what Windows
// players see; a Mac without it falls back to Menlo), loaded from
// tools/promo/fonts/ so every render uses it, with or without a network.
//  fontScript(): an init script that adds the faces to the page from the
//    files' bytes before the game draws its first glyph;
//  FONT_CSS: the stylesheet's URL path, for the promo's own pages.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts');
export const FONT_CSS = '/tools/promo/fonts/fonts.css';

const SUBSETS = {
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  symbols2: 'U+2000-2001,U+2004-2008,U+200A,U+23B8-23BD,U+2500-259F',
};

export function fontScript() {
  const faces = [];
  for (const [sub, range] of Object.entries(SUBSETS)) {
    for (const weight of [400, 600, 700]) {
      const b64 = fs.readFileSync(path.join(FONT_DIR, `cascadia-mono-${sub}-${weight}-normal.woff2`)).toString('base64');
      faces.push({ weight: String(weight), range, b64 });
    }
  }
  return `(() => {
    const faces = ${JSON.stringify(faces)};
    const bytes = (b) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
    window.__fontsReady = Promise.all(faces.map((f) => { const ff = new FontFace('Cascadia Mono', bytes(f.b64), { weight: f.weight, unicodeRange: f.range }); document.fonts.add(ff); return ff.load(); }));
  })();`;
}
