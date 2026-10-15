// Cell density presets. Each preset is a cell size chosen so the window
// holds about the target number of cells; cells are whole device pixels,
// twice as tall as wide, so the atlas is never resampled. A window larger
// than 1440 x 900 gets larger cells, so a 4K screen costs what a 1440 x 900
// window does (the menu promises "about 40,000 cells", and the cost goes
// with the cell count); a smaller one keeps the 1440 x 900 cell size (fewer
// cells, faster).
export const TARGETS = [15000, 25000, 40000, 60000];
const REF_W = 1440, REF_H = 900;

// `area`: the window's size in CSS pixels squared
export function cellWidth(preset, dpr, area = REF_W * REF_H) {
  const css = Math.sqrt(Math.max(REF_W * REF_H, area) / (2 * TARGETS[preset]));
  return Math.max(3, Math.round(css * dpr));
}

// The grid for a picture area of cssW x cssH CSS pixels in a window of
// `area` CSS pixels squared.
export function layout(preset, cssW, cssH, dpr, area = cssW * cssH) {
  const cw = cellWidth(preset, dpr, area), ch = cw * 2;
  let cols = Math.max(8, Math.floor(Math.floor(cssW * dpr) / cw));
  let rows = Math.max(4, Math.floor(Math.floor(cssH * dpr) / ch));
  // the canvas must also be a whole number of CSS pixels, or some engines
  // (WebKit) composite it through a slow scaling path
  const whole = (n) => Math.abs(n / dpr - Math.round(n / dpr)) < 1e-6;
  for (let k = 0; k < 8 && cols > 8 && !whole(cols * cw); k++) cols--;
  for (let k = 0; k < 8 && rows > 4 && !whole(rows * ch); k++) rows--;
  return { preset, cw, ch, cols, rows, cells: cols * rows };
}
