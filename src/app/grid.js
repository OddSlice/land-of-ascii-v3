// Cell density presets. Each preset is a cell size chosen so a 1440 x 900
// window holds about the target number of cells; cells are whole device
// pixels, twice as tall as wide, so the atlas is never resampled.
export const TARGETS = [15000, 25000, 40000, 60000];
const REF_W = 1440, REF_H = 900;

export function cellWidth(preset, dpr) {
  const css = Math.sqrt(REF_W * REF_H / (2 * TARGETS[preset]));
  return Math.max(3, Math.round(css * dpr));
}

// The grid for a picture area of cssW x cssH CSS pixels.
export function layout(preset, cssW, cssH, dpr) {
  const cw = cellWidth(preset, dpr), ch = cw * 2;
  let cols = Math.max(8, Math.floor(Math.floor(cssW * dpr) / cw));
  let rows = Math.max(4, Math.floor(Math.floor(cssH * dpr) / ch));
  // the canvas must also be a whole number of CSS pixels, or some engines
  // (WebKit) composite it through a slow scaling path
  const whole = (n) => Math.abs(n / dpr - Math.round(n / dpr)) < 1e-6;
  for (let k = 0; k < 8 && cols > 8 && !whole(cols * cw); k++) cols--;
  for (let k = 0; k < 8 && rows > 4 && !whole(rows * ch); k++) rows--;
  return { preset, cw, ch, cols, rows, cells: cols * rows };
}
