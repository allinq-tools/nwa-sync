// Eigen, eenvoudige lijn-iconen (24×24, stroke = currentColor).
const ICONS = {
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 20h8"/>',
  tools: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  logout: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chevronLeft: '<path d="M14.5 6l-6 6 6 6"/>',
  chevronRight: '<path d="M9.5 6l6 6-6 6"/>',
  chevronDown: '<path d="M6 9.5l6 6 6-6"/>',
  arrowRight: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M20 12H5M11 6l-6 6 6 6"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  restart: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  flame: '<path d="M12 21c-4 0-7-2.8-7-6.6 0-3.6 2.6-5.6 4-8.4.6 1.7 1.6 2.8 2.8 3.4C12 6.6 13.3 4.4 15 3c.4 3 4 5.6 4 10.6C19 18 16 21 12 21z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
  // Onderwerp-iconen
  network: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12.5l9 5 9-5M3 17l9 5 9-5"/>',
  switch: '<rect x="2.5" y="8" width="19" height="8" rx="2"/><path d="M6 12h1M9 12h1M12 12h1M15 12h1M18 12h.5"/><path d="M7 8V5M12 8V5M17 8V5"/>',
  router: '<rect x="3" y="12" width="18" height="7" rx="2"/><path d="M7 15.5h.01M11 15.5h.01"/><path d="M15 9a4 4 0 0 1 4 0M13.5 6.5a7 7 0 0 1 7 0"/><path d="M17 12V9.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
  route: '<circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="5.5" r="2.5"/><path d="M8 18.5h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16"/>',
  antenna: '<path d="M12 10l-5 11M12 10l5 11M8.6 17.5h6.8"/><circle cx="12" cy="8.5" r="1.5"/><path d="M8 5a5.5 5.5 0 0 0 0 7M16 5a5.5 5.5 0 0 1 0 7M5.2 2.5a9.5 9.5 0 0 0 0 12M18.8 2.5a9.5 9.5 0 0 1 0 12"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="M6.5 11.5l2.5-3 3 4 2-2.5 3.5 3"/>',
  fiber: '<path d="M3 17c4 0 4-10 9-10s5 10 9 10"/><path d="M3 12c4 0 5 5 9 5s5-5 9-5"/><circle cx="3" cy="17" r="1"/><circle cx="21" cy="17" r="1"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  server: '<rect x="4" y="3.5" width="16" height="7" rx="1.5"/><rect x="4" y="13.5" width="16" height="7" rx="1.5"/><path d="M8 7h.01M8 17h.01M12 7h5M12 17h5"/>',
  // Beloningen
  rocket: '<path d="M14 4c3-1 5-1 6-1 0 1 0 3-1 6l-6 6-4-4z"/><path d="M9 11l-4 1-2 3 4 1M13 15l-1 4-3 2-1-4"/><circle cx="15.5" cy="8.5" r="1.3"/>',
  cable: '<path d="M7 3v5M11 3v5"/><rect x="5" y="8" width="8" height="5" rx="1"/><path d="M9 13v3a4 4 0 0 0 4 4h3a3 3 0 0 0 3-3V7"/><path d="M17 7h4"/>',
  tower: '<path d="M12 7l-5 14M12 7l5 14M9 15h6M7.8 18.5h8.4"/><circle cx="12" cy="5" r="1.5"/><path d="M8 3.5a5 5 0 0 0 0 4M16 3.5a5 5 0 0 1 0 4"/>',
  badge: '<circle cx="12" cy="9" r="6"/><path d="M8.5 13.5L7 21l5-2.5 5 2.5-1.5-7.5"/><path d="M12 6l1 2 2 .3-1.5 1.4.4 2-1.9-1-1.9 1 .4-2L9 8.3l2-.3z"/>',
};

function icon(name, size = 20, extra = '') {
  const p = ICONS[name] || ICONS.network;
  return `<svg class="ic ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

// Decoratieve illustratie voor challenge-kaarten: onderwerp-icoon met signaalgolven.
function illustration(name, done = false) {
  const p = ICONS[name] || ICONS.network;
  return `<svg class="illu" viewBox="0 0 220 220" aria-hidden="true">
    <circle cx="110" cy="110" r="100" class="illu-ring r1"/>
    <circle cx="110" cy="110" r="74" class="illu-ring r2"/>
    <circle cx="110" cy="110" r="48" class="illu-core"/>
    <g transform="translate(80 80) scale(2.5)" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${p}</g>
    <circle cx="28" cy="70" r="4" class="illu-dot"/><circle cx="192" cy="58" r="3" class="illu-dot"/><circle cx="186" cy="168" r="5" class="illu-dot"/><circle cx="40" cy="170" r="3" class="illu-dot"/>
    ${done ? '<g class="illu-done"><circle cx="168" cy="168" r="26"/><path d="M155 168l9 9 17-18" fill="none" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>' : ''}
  </svg>`;
}
