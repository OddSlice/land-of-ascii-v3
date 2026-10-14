// A sketch as an image to share (phase 6): the sketch as the game draws it,
// in a thin frame, with the game's name and the seed small in the corner,
// in the game's own monospace. The one place the game's words appear on an
// image, so kept small and plain.
import { drawSketch } from './journal.js';
import { FONT_STACK } from '../present/font.js';

export function sketchCard(cells, cols, rows, seed) {
  const cw = Math.max(3, Math.min(8, Math.floor(1100 / cols)));
  const art = document.createElement('canvas');
  drawSketch(art, cells, cols, rows, cw);
  const pad = 18, foot = 26;
  const c = document.createElement('canvas');
  c.width = art.width + 2 * pad; c.height = art.height + pad + foot;
  const g = c.getContext('2d');
  g.fillStyle = '#0d0e12'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(art, pad, pad);
  // the thin frame
  g.strokeStyle = 'rgba(240, 230, 204, 0.45)'; g.lineWidth = 1;
  g.strokeRect(pad - 6.5, pad - 6.5, art.width + 13, art.height + 13);
  // the name and the seed, in the corner
  g.font = `12px ${FONT_STACK}`; g.textBaseline = 'middle'; g.textAlign = 'right';
  g.fillStyle = 'rgba(240, 230, 204, 0.78)';
  g.fillText(`Land of Ascii · seed ${seed}`, c.width - pad + 6, c.height - foot / 2 - 2);
  return c;
}

export const toBlob = (canvas) => new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));

// Save the image, or copy it (where the browser can put an image on the
// clipboard). True if done.
export async function saveImage(canvas, name) {
  const blob = await toBlob(canvas);
  if (!blob) return false;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}
export const canCopyImage = () => typeof ClipboardItem !== 'undefined' && !!(navigator.clipboard && navigator.clipboard.write);
export async function copyImage(canvas) {
  if (!canCopyImage()) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob(canvas) })]);
    return true;
  } catch { return false; }
}
