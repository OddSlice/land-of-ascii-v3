// The promo's card renderer (tools/promo/stills.mjs): a card is a list of
// pieces laid out in pixels, drawn with the game's own stone frame and
// lettering (the title screen's code) and its font, at the card's exact
// size. Pictures are the game's own frames, placed at their natural size
// (never scaled). After drawing, every piece of text is measured with the
// real font, and anything that spills past its box or the card is reported.
import { drawFrame } from '/src/app/title.js';
import { drawLettering, letteringSize } from '/src/app/lettering.js';

const card = document.getElementById('card');
const px = (n) => `${Math.round(n)}px`;

function place(el, o, w, h) {
  let x = o.x, y = o.y;
  if (o.anchor === 'center') x -= w / 2;
  else if (o.anchor === 'right') x -= w;
  if (o.vanchor === 'middle') y -= h / 2;
  else if (o.vanchor === 'bottom') y -= h;
  el.style.left = px(x); el.style.top = px(y);
}

async function piece(o) {
  if (o.type === 'frame') {
    const c = document.createElement('canvas');
    drawFrame(c, Math.round(o.w / o.cw), Math.round(o.h / (2 * o.cw)), o.cw, 1);
    // (the title screen's frame paints its own dark field; a card's field is
    // its picture, so the middle is cleared: the stone and the rails stay)
    if (o.hollow !== false) c.getContext('2d').clearRect(3 * o.cw, 3 * 2 * o.cw, c.width - 6 * o.cw, c.height - 6 * 2 * o.cw);
    c.style.left = px(o.x); c.style.top = px(o.y);
    card.append(c);
  } else if (o.type === 'pic') {
    const box = document.createElement('div');
    box.style.cssText = `position:absolute;overflow:hidden;left:${px(o.clip ? o.clip.x : o.x)};top:${px(o.clip ? o.clip.y : o.y)};width:${o.clip ? px(o.clip.w) : 'auto'};height:${o.clip ? px(o.clip.h) : 'auto'};${o.css || ''}`;
    const img = new Image(); img.src = o.src; await img.decode();
    img.style.cssText = `left:${px(o.clip ? o.x - o.clip.x : 0)};top:${px(o.clip ? o.y - o.clip.y : 0)};width:${img.naturalWidth}px;height:${img.naturalHeight}px;position:${o.clip ? 'absolute' : 'relative'};`;
    if (!o.clip) { box.style.width = px(img.naturalWidth); box.style.height = px(img.naturalHeight); }
    box.append(img);
    card.append(box);
  } else if (o.type === 'shade') {
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;left:${px(o.x)};top:${px(o.y)};width:${px(o.w)};height:${px(o.h)};${o.css}`;
    card.append(d);
  } else if (o.type === 'title') {
    const c = document.createElement('canvas');
    drawLettering(c, o.lines, o.cw, { dpr: 1 });
    const { cols, rows } = letteringSize(o.lines);
    card.append(c);
    place(c, o, cols * o.cw, rows * 2 * o.cw);
  } else if (o.type === 'panel') {
    const d = document.createElement('div'); d.className = 'panel';
    d.style.cssText = `left:${px(o.x)};top:${px(o.y)};width:${px(o.w)};height:${px(o.h)};${o.css || ''}`;
    card.append(d);
  } else {
    // text: 'tag', 'foot', 'badge', 'label', or a list
    const d = document.createElement(o.type === 'list' ? 'ul' : 'div');
    d.className = o.type === 'list' ? 'list' : `text ${o.type}`;
    d.dataset.max = o.maxW || '';
    d.style.fontSize = px(o.size || 24);
    if (o.weight) d.style.fontWeight = o.weight;
    if (o.color) d.style.color = o.color;
    if (o.css) d.style.cssText += o.css;
    if (o.type === 'list') { for (const t of o.items) { const li = document.createElement('li'); li.textContent = t; d.append(li); } d.style.lineHeight = o.lh || '1.55'; }
    else if (o.type === 'foot') { d.append(document.createTextNode(o.text)); const b = document.createElement('b'); b.textContent = o.url; d.append(b); }
    else d.textContent = o.text;
    card.append(d);
    const r = d.getBoundingClientRect();
    place(d, o, r.width, r.height);
  }
}

window.render = async (spec) => {
  await document.fonts.ready;
  await Promise.all(['400', '600', '700'].map((w) => document.fonts.load(`${w} 20px "Cascadia Mono"`)));
  card.replaceChildren();
  card.style.width = px(spec.w); card.style.height = px(spec.h);
  for (const o of spec.pieces) await piece(o);
  // what spills: text past the card, or past its own `maxW`
  const spills = [];
  for (const el of card.querySelectorAll('.text, .list')) {
    const r = el.getBoundingClientRect(), max = Number(el.dataset.max || 0);
    const label = (el.textContent || '').slice(0, 40);
    if (r.left < 0 || r.top < 0 || r.right > spec.w || r.bottom > spec.h) spills.push(`${label}: outside the card`);
    if (max && r.width > max) spills.push(`${label}: ${Math.round(r.width)} px wide, over ${max}`);
  }
  return { spills, font: document.fonts.check('600 20px "Cascadia Mono"') };
};
window.cardReady = true;
