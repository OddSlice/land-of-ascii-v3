// The menu's icons: drawn here on a 24-unit grid in one stroke weight (the
// CSS sets 1.75 and round ends), coloured by the text they sit beside. Never
// emoji or Unicode symbols.
const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="1.15" fill="currentColor" stroke="none"/>`;
const CLOUD = 'M7 18.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 12.1 3.25 3.25 0 0 0 7 18.5z';

const PATHS = {
  // the menu's sections
  keyboard: `<rect x="2.5" y="6" width="19" height="12" rx="2"/>${dot(6.5, 10)}${dot(10, 10)}${dot(13.5, 10)}${dot(17, 10)}<path d="M7 14.25h10"/>`,
  monitor: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8.5 20h7M12 16v4"/>',
  landscape: '<path d="M2.5 19.5 8.5 10l4 6 3-4 6 7.5z"/><circle cx="16.5" cy="6.5" r="1.75"/>',
  sliders: '<path d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  // the key groups
  move: '<path d="M12 3v18M3 12h18M9.5 5.5 12 3l2.5 2.5M9.5 18.5 12 21l2.5-2.5M5.5 9.5 3 12l2.5 2.5M18.5 9.5 21 12l-2.5 2.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  map: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20zM9 4v13.5M15 6.5V20"/>',
  camera: '<path d="M3.5 8.5h3l2-3h7l2 3h3v10h-17z"/><circle cx="12" cy="13" r="3.25"/>',
  // the times of day
  dawn: '<path d="M3 19h18M7 19a5 5 0 0 1 10 0M12 10V4.5M9.75 6.75 12 4.5l2.25 2.25M4.9 13.4l1.4 1M19.1 13.4l-1.4 1"/>',
  day: '<circle cx="12" cy="12" r="3.75"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  dusk: '<path d="M3 19h18M7 19a5 5 0 0 1 10 0M12 4.5V10M9.75 7.75 12 10l2.25-2.25M4.9 13.4l1.4 1M19.1 13.4l-1.4 1"/>',
  night: '<path d="M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10z"/>',
  // the weather
  auto: '<path d="M19.5 10.5A8 8 0 0 0 5.6 6.6M4.5 13.5a8 8 0 0 0 13.9 3.9M5 3v4h4M19 21v-4h-4"/>',
  clear: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  fair: '<path d="M9 2.5V4M3 9h1.5M4.75 4.75 5.8 5.8M13.25 4.75 12.2 5.8M6.1 11.6A3 3 0 1 1 11.7 7.7"/><path d="M10 19.5h7.5a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8.6 13.6 3 3 0 0 0 10 19.5z"/>',
  overcast: `<path d="${CLOUD}"/>`,
  rain: '<path d="M7 14.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 8.1 3.25 3.25 0 0 0 7 14.5z"/><path d="m9 17.5-1 3M13 17.5l-1 3M17 17.5l-1 3"/>',
  mist: '<path d="M3.5 7.5h13M7.5 12h13M3.5 16.5h10M17 16.5h3.5"/>',
  // actions
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  dice: `<rect x="4" y="4" width="16" height="16" rx="3"/>${dot(8.5, 8.5)}${dot(15.5, 8.5)}${dot(12, 12)}${dot(8.5, 15.5)}${dot(15.5, 15.5)}`,
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};

export function icon(name, size = 16) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', String(size));
  s.setAttribute('height', String(size));
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  s.setAttribute('class', 'ic');
  s.innerHTML = PATHS[name] || '';
  return s;
}
