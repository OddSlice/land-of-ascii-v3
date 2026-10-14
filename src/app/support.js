// What the game needs from the browser (phase 6), checked before anything
// is built, so a browser that cannot run it is told so plainly, naming
// what is missing, instead of stopping with an error.
export function missingFeatures() {
  const miss = [];
  let gl = null;
  try { gl = document.createElement('canvas').getContext('webgl2'); } catch { gl = null; }
  if (!gl) miss.push('WebGL 2 (it draws the picture)');
  if (typeof Worker === 'undefined') miss.push('web workers (they work out the picture)');
  else {
    try {
      const url = URL.createObjectURL(new Blob([''], { type: 'text/javascript' }));
      const w = new Worker(url, { type: 'module' });
      w.terminate(); URL.revokeObjectURL(url);
    } catch { miss.push('module workers (they work out the picture)'); }
  }
  if (typeof TextDecoder === 'undefined' || typeof Uint8Array === 'undefined') miss.push('typed arrays');
  return miss;
}

// The message, in the page's error box.
export function showUnsupported(el, miss) {
  el.classList.add('unsupported');
  el.style.display = 'block';
  el.replaceChildren();
  const p = (t, c) => { const e = document.createElement('p'); e.textContent = t; if (c) e.className = c; el.append(e); return e; };
  const h = document.createElement('h1'); h.textContent = 'Land of Ascii cannot run in this browser'; el.append(h);
  p('It needs:');
  const ul = document.createElement('ul');
  for (const m of miss) { const li = document.createElement('li'); li.textContent = m; ul.append(li); }
  el.append(ul);
  p('A recent Chrome, Edge, Firefox or Safari has all of these. If this is one, check that hardware acceleration is on in its settings.');
}
