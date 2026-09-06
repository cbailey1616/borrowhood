// Borrowhood's own rounded drawings. A 32-unit grid and one stroke weight keep
// the small controls related to the larger, gently colored illustrations.
const p = (d, extra = '') => `<path d="${d}" ${extra}/>`;
const circle = (x, y, r, extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" ${extra}/>`;
const rect = (x, y, w, h, r = 3, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ${extra}/>`;
const panel = (c) => `fill="${c.fill}" fill-opacity="${c.opacity}"`;
const accent = (c) => `fill="${c.accent}" fill-opacity="${c.opacity}"`;
const dot = (x, y, c, r = 1) => circle(x, y, r, `fill="${c.stroke}" stroke="none"`);
const arrow = (direction) => `<g transform="rotate(${direction} 16 16)">${p('M6 16H26M20 10L26 16L20 22')}</g>`;
const chevron = (direction) => `<g transform="rotate(${direction} 16 16)">${p('M12 8L20 16L12 24')}</g>`;
const person = (c) => circle(16, 10, 4.5, panel(c)) + p('M7 27V25C7 19 11 17 16 17S25 19 25 25V27Z', panel(c));
const heart = (c) => p('M16 27C13 25 4 19 4 12C4 6 11 3 16 9C21 3 28 6 28 12C28 19 19 25 16 27Z', panel(c));
const bell = (c) => p('M7 21C9 18 8 15 9 11C10 4 22 4 23 11C24 15 23 18 25 21C26 23 24 24 22 24H10C8 24 6 23 7 21Z', panel(c)) + p('M13 28C14 30 18 30 19 28M16 3V5');
const chat = (c) => p('M7 5H25C28 5 29 7 29 10V19C29 22 27 24 24 24H14L7 28V24C4 24 3 22 3 19V10C3 7 4 5 7 5Z', panel(c)) + dot(10, 14, c) + dot(16, 14, c) + dot(22, 14, c);
const shield = (c) => p('M16 3C20 6 24 7 27 7V15C27 22 22 27 16 29C10 27 5 22 5 15V7C8 7 12 6 16 3Z', panel(c));
const camera = (c) => p('M5 9H10L12 5H20L22 9H27C29 9 30 11 30 13V24C30 26 28 27 26 27H6C3 27 2 25 2 23V13C2 11 3 9 5 9Z', panel(c)) + circle(16, 18, 5) + dot(25, 13, c);
const picture = (c) => rect(4, 5, 24, 22, 4, panel(c)) + circle(11, 12, 2.3, accent(c)) + p('M5 24L12 17L17 22L22 16L28 23');
const basket = (c) => p('M4 13H28L25 26C25 28 7 28 7 26Z', panel(c)) + p('M10 13L14 5M22 13L18 5M3 13H29M12 18L13 24M20 18L19 24');
const clock = (c) => circle(16, 17, 11, panel(c)) + p('M16 10V17L21 20');
const tag = (c) => p('M5 5H16L28 17C29 18 29 19 28 20L20 28C19 29 18 29 17 28L5 16Z', panel(c)) + circle(11, 11, 1.7);
const book = (c) => rect(7, 3, 19, 26, 3, panel(c)) + p('M7 24H26M11 3V24M15 10H21M15 15H21');

const DRAWINGS = {
  // A woodland progression drawn for Borrowhood, rather than generic medals.
  'rank-squire': c => p('M9 15H24V18C24 24 20 28 16.5 29C13 28 9 24 9 18Z', panel(c)) + p('M6 15C6 8 26 8 27 15L26 17H7Z', accent(c)) + p('M16 9V5C19 3 23 4 24 6C21 8 18 8 16 6M12 21C12 23 13 24 14 25'),
  'rank-archer': c => p('M7 5C26 6 26 26 7 27L9 24C23 21 23 11 9 8Z', panel(c)) + p('M7 5L11 16L7 27M5 16H29M25 12L29 16L25 20M4 12L8 16L4 20'),
  // A tied neckerchief gives Outlaw its own silhouette beside Robin's cap.
  'rank-outlaw': c => p('M5 8C10 4 20 4 26 8L17 23C16 25 14 25 13 23Z', panel(c)) + p('M6 9C11 12 20 12 25 9M10 15L15 20') + p('M25 9C28 9 30 12 29 16L25 14L22 18L22 12Z', accent(c)) + circle(24, 10, 2.5, accent(c)),
  'rank-ranger': c => p('M13 19H19L20 29H12Z', accent(c)) + p('M9 24C1 24 1 15 7 13C4 7 10 3 14 6C18 0 25 4 24 10C32 12 31 20 26 22C22 27 18 24 16 22C14 25 11 25 9 24Z', panel(c)) + p('M16 28V13M16 21L10 16M16 18L22 13'),
  // Robin is Robin Hood: a longbow and a forest-green cap with a golden feather.
  'rank-robin': c => p('M6 4C-1 15 5 26 16 29', `stroke="${c.accent}" stroke-width="2.8"`) + p('M6 4L16 29') + p('M8 22C11 13 17 12 24 10L23 18L28 22Z', panel(c)) + p('M20 16C18 8 24 2 29 3C29 9 26 14 20 16Z', accent(c)) + p('M19 18L26 6') + p('M6 23C11 19 17 20 22 22L29 23C24 29 12 29 6 23Z', panel(c)),
  home: c => p('M7 14V26C7 28 9 29 11 29H23C25 29 26 28 26 26V14', panel(c)) + p('M3 15L14 5C15 4 17 4 18 5L29 15', accent(c)) + p('M13 29V21C13 18 20 18 20 21V29M22 8V4H26V11'),
  heart,
  basket,
  cube: c => p('M5 11L16 5L27 11V23L16 29L5 23Z', panel(c)) + p('M5 11L16 17L27 11M16 17V29M10 8L21 14'),
  notifications: bell,
  'notifications-off': c => bell(c) + p('M4 4L28 28'),
  person,
  'person-add': c => `<g transform="translate(-3 0) scale(.85 1)">${person(c)}</g>` + p('M24 12V22M19 17H29'),
  'person-remove': c => `<g transform="translate(-3 0) scale(.85 1)">${person(c)}</g>` + p('M20 17H29'),
  people: c => circle(12, 10, 4, panel(c)) + circle(23, 11, 3, accent(c)) + p('M3 27V24C3 15 21 15 21 24V27Z', panel(c)) + p('M23 18C27 18 30 21 30 25V27H25'),
  chatbubble: chat,
  mail: c => rect(3, 7, 26, 20, 4, panel(c)) + p('M4 9L14 17C15 18 17 18 18 17L28 9M4 25L11 19M28 25L21 19'),
  search: c => circle(14, 14, 9, panel(c)) + p('M21 21L29 29'),
  bookmark: c => p('M8 4H24V28L16 23L8 28Z', panel(c)),
  gift: c => rect(5, 13, 22, 16, 2, panel(c)) + rect(3, 9, 26, 6, 2, accent(c)) + p('M16 9V29M16 9C3 11 6 0 12 4ZM16 9C29 11 26 0 20 4Z'),
  leaf: c => p('M26 4C10 2 2 12 7 22C12 31 29 24 26 4Z', panel(c)) + p('M5 29L22 10M12 21V15M17 16H23'),
  location: c => p('M16 29C12 24 6 18 6 12C6-1 26-1 26 12C26 18 20 24 16 29Z', panel(c)) + circle(16, 12, 3.5),
  time: clock,
  alarm: c => clock(c) + p('M5 4L2 8M27 4L30 8M8 26L6 30M24 26L26 30'),
  calendar: c => rect(4, 6, 24, 23, 4, panel(c)) + p('M4 13H28M10 3V9M22 3V9') + dot(10, 19, c) + dot(16, 19, c) + dot(22, 19, c) + dot(10, 24, c) + dot(16, 24, c),
  image: picture,
  images: c => p('M3 22V5C3 3 5 2 7 2H23') + `<g transform="translate(2 2) scale(.9)">${picture(c)}</g>`,
  camera,
  shield,
  'shield-checkmark': c => shield(c) + p('M11 16L15 20L22 12'),
  'lock-closed': c => rect(5, 14, 22, 15, 4, panel(c)) + p('M10 14V9C10 1 22 1 22 9V14') + circle(16, 21, 1.5) + p('M16 22V25'),
  star: c => p('M16 3L20 11L29 13L22 20L24 29L16 25L8 29L10 20L3 13L12 11Z', panel(c)),
  bulb: c => p('M10 21C10 17 6 17 6 11C6-1 26-1 26 11C26 17 22 17 22 21Z', panel(c)) + p('M11 25H21M13 29H19M16 21V15M12 12L16 15L20 12'),
  'happy': c => circle(16, 16, 13, panel(c)) + dot(11, 13, c, 1.3) + dot(21, 13, c, 1.3) + p('M10 20C13 25 19 25 22 20'),
  sad: c => circle(16, 16, 13, panel(c)) + dot(11, 13, c, 1.3) + dot(21, 13, c, 1.3) + p('M11 23C13 19 19 19 21 23'),
  hammer: c => p('M6 4H16L22 10L17 15L11 10H6Z', panel(c)) + p('M17 14L25 23C28 26 24 30 21 27L13 17Z', accent(c)),
  construct: c => p('M20 3L19 9L23 13L29 12C30 19 23 23 18 19L8 29C4 31 1 27 4 24L14 14C10 8 13 3 20 3Z', panel(c)),
  restaurant: c => p('M7 3V11M3 3V10C3 16 11 16 11 10V3M7 15V29M25 3C19 6 18 15 19 18H25M25 3V29'),
  football: c => p('M27 4C29 14 25 27 7 28C2 11 14 2 27 4Z', panel(c)) + p('M10 23L23 10M13 14L18 19M17 10L22 15'),
  laptop: c => rect(5, 5, 22, 17, 3, panel(c)) + p('M5 22L2 27C1 29 31 29 30 27L27 22M12 25H20'),
  bonfire: c => p('M16 3C17 11 24 9 25 17C27 30 5 32 6 19C6 14 10 11 11 7L14 14C17 12 17 8 16 3Z', panel(c)) + p('M5 30L27 26M5 26L27 30'),
  brush: c => p('M9 26C5 21 5 12 9 7L16 3L19 11L28 14L23 20C18 24 15 26 9 26Z', panel(c)) + p('M9 26L6 29M12 10L17 16M18 8L23 14'),
  sparkles: c => p('M16 11C8-1 23-1 16 11C28 3 33 16 21 17C32 27 18 33 16 22C9 34-1 24 11 17C-2 13 6 2 16 11Z', panel(c)) + circle(16, 16, 4, accent(c)),
  pricetag: tag,
  ribbon: c => circle(16, 12, 9, panel(c)) + p('M10 20L7 30L14 27L16 22M22 20L25 30L18 27L16 22') + circle(16, 12, 4),
  trophy: c => p('M9 4H23V12C23 24 9 24 9 12Z', panel(c)) + p('M9 7H3V11C3 16 6 18 11 18M23 7H29V11C29 16 26 18 21 18M16 21V28M10 29H22'),
  flag: c => p('M6 29V4M6 5C14 0 20 12 28 7V21C20 26 14 14 6 19', panel(c)),
  megaphone: c => p('M5 12H11L26 5V25L11 18H5Z', panel(c)) + p('M9 18L12 28H17L14 20M11 12V18'),
  'hand-right': c => p('M9 17V8C9 5 13 5 13 8V15V4C13 1 17 1 17 4V15V6C17 3 21 3 21 6V16V10C21 7 25 7 25 10V21C25 32 12 33 8 25L3 18C1 14 5 12 8 16L11 19', panel(c)),
  'hand-left': c => `<g transform="translate(32 0) scale(-1 1)">${DRAWINGS['hand-right'](c)}</g>`,
  'swap-horizontal': () => p('M4 10H27L21 4M28 22H5L11 28'),
  send: c => p('M3 5L29 16L3 27L7 16Z', panel(c)) + p('M7 16H29'),
  navigate: c => p('M28 4L19 29L14 18L3 13Z', panel(c)),
  'cloud-offline': c => p('M9 24H7C-1 24 0 13 7 13C6 1 25 1 25 13C33 14 31 24 24 24H20', panel(c)) + p('M3 3L29 29'),
  settings: c => p('M13 3H19L20 7L24 9L28 8L31 13L27 17V21L24 26L19 25L16 29L11 26L8 27L3 23L5 18L2 14L5 9L10 9Z', panel(c)) + circle(16, 16, 5),
  'stats-chart': c => rect(4, 17, 5, 12, 2, panel(c)) + rect(14, 10, 5, 19, 2, accent(c)) + rect(24, 3, 5, 26, 2, panel(c)),
  'trending-up': () => p('M3 25L12 16L18 20L29 7M21 7H29V15'),
  'document-text': book,
  receipt: c => p('M7 3H25V29L20 26L16 29L12 26L7 29Z', panel(c)) + p('M11 9H21M11 15H21M11 21H17'),
  card: c => rect(3, 6, 26, 22, 4, panel(c)) + p('M3 13H29M8 22H14'),
  cash: c => rect(3, 7, 26, 19, 3, panel(c)) + circle(16, 16.5, 4.5) + p('M3 12C7 12 8 10 8 7M24 7C24 10 26 12 29 12M3 21C7 21 8 23 8 26M24 26C24 23 26 21 29 21'),
  wallet: c => p('M27 9H7C3 9 3 4 7 4H24V9M5 8V25C5 28 8 29 11 29H27V9', panel(c)) + rect(20, 16, 10, 7, 2, accent(c)) + dot(24, 19.5, c),
  trash: c => p('M7 9L9 27C9 30 23 30 23 27L25 9', panel(c)) + p('M4 9H28M11 9V4H21V9M13 14V24M19 14V24'),
  copy: c => p('M8 24H5C3 24 3 22 3 20V5C3 3 5 3 7 3H21V7') + rect(9, 9, 20, 21, 3, panel(c)),
  pencil: c => p('M5 22L22 5C26 1 31 6 27 10L10 27L3 29Z', panel(c)) + p('M19 8L24 13M5 22L10 27'),
  'request-note': c => p('M7 3H22C24 3 25 5 25 7V26C25 28 23 29 21 29H7C5 29 4 27 4 25V7C4 5 5 3 7 3Z', panel(c)) + p('M9 10H19M9 15H16M9 20H13') + p('M18 24C17 18 22 14 29 14C29 21 25 25 18 24Z', accent(c)) + p('M16 28L25 19'),
  share: c => p('M9 13H5V27H27V13H23M16 22V3M10 9L16 3L22 9', panel(c)),
  open: () => p('M13 5H5V27H27V19M18 3H29V14M29 3L14 18'),
  'log-out': () => p('M14 4H5V28H14M12 16H29M23 10L29 16L23 22'),
  call: c => p('M8 3L14 10L10 14C12 18 14 20 18 22L22 18L29 24C23 38-6 11 8 3Z', panel(c)),
  link: () => p('M13 21L10 24C7 27 3 25 3 22C3 20 4 19 5 18L11 12C14 9 17 9 20 12M19 11L22 8C25 5 29 7 29 10C29 12 28 13 27 14L21 20C18 23 15 23 12 20M12 20L20 12'),
  eye: c => p('M2 16C9 3 23 3 30 16C23 29 9 29 2 16Z', panel(c)) + circle(16, 16, 4),
  'finger-print': () => p('M6 18V14C6 0 26 0 26 14V19M10 22V14C10 6 22 6 22 14V22M14 26V14C14 12 18 12 18 14V24L16 29M5 23L7 27M25 24L23 29'),
  scan: () => p('M3 11V4H10M22 4H29V11M29 22V29H22M10 29H3V22M3 16H29'),
  hourglass: c => p('M7 3H25V7C25 12 21 13 18 16C21 19 25 20 25 25V29H7V25C7 20 11 19 14 16C11 13 7 12 7 7Z', panel(c)) + p('M7 3H25M7 29H25M11 7H21'),
  flash: c => p('M18 2L5 19H15L13 30L28 12H18Z', panel(c)),
  bug: c => rect(10, 8, 12, 21, 6, panel(c)) + p('M12 8L9 3M20 8L23 3M10 14H4M22 14H28M10 21H3M22 21H29M10 26L5 30M22 26L27 30M16 14V29'),
  wifi: c => p('M3 10C11 3 21 3 29 10M7 16C12 11 20 11 25 16M12 22C14 20 18 20 20 22') + dot(16, 27, c, 1.5),
  code: () => p('M10 8L3 16L10 24M22 8L29 16L22 24M19 4L13 28'),
  refresh: () => p('M27 12C23 1 7 1 4 13C0 26 19 34 27 23M27 4V12H19'),
  'arrow-forward': () => arrow(0),
  'arrow-back': () => arrow(180),
  'arrow-up': () => arrow(-90),
  'arrow-down': () => arrow(90),
  'arrow-redo': () => p('M5 26V20C5 12 13 11 27 11M21 5L27 11L21 17'),
  'arrow-undo': () => `<g transform="translate(32 0) scale(-1 1)">${DRAWINGS['arrow-redo']()}</g>`,
  'chevron-forward': () => chevron(0),
  'chevron-back': () => chevron(180),
  'chevron-up': () => chevron(-90),
  'chevron-down': () => chevron(90),
  add: () => p('M16 5V27M5 16H27'),
  close: () => p('M7 7L25 25M7 25L25 7'),
  checkmark: () => p('M5 16L12 23L27 8'),
  'checkmark-done': () => p('M2 16L8 22L22 8M14 20L18 24L30 12'),
  'checkmark-circle': c => circle(16, 16, 13, panel(c)) + p('M9 16L14 21L23 11'),
  checkbox: c => rect(3, 3, 26, 26, 6, panel(c)) + p('M9 16L14 21L23 11'),
  square: c => rect(3, 3, 26, 26, 6, panel(c)),
  'close-circle': c => circle(16, 16, 13, panel(c)) + p('M11 11L21 21M11 21L21 11'),
  'add-circle': c => circle(16, 16, 13, panel(c)) + p('M16 9V23M9 16H23'),
  'arrow-up-circle': c => circle(16, 16, 13, panel(c)) + p('M16 24V8M10 14L16 8L22 14'),
  'arrow-down-circle': c => `<g transform="rotate(180 16 16)">${DRAWINGS['arrow-up-circle'](c)}</g>`,
  'alert-circle': c => circle(16, 16, 13, panel(c)) + p('M16 8V17') + dot(16, 23, c, 1.2),
  warning: c => p('M13 5C14 2 18 2 19 5L30 25C31 28 29 29 27 29H5C3 29 1 28 2 25Z', panel(c)) + p('M16 11V19') + dot(16, 24, c, 1.1),
  'information-circle': c => circle(16, 16, 13, panel(c)) + dot(16, 9, c, 1.1) + p('M13 15H16V24M13 24H20'),
  'help-circle': c => circle(16, 16, 13, panel(c)) + p('M11 11C11 4 24 6 21 13C20 16 16 16 16 20') + dot(16, 25, c, 1),
  ellipse: c => circle(16, 16, 11, panel(c)),
  'ellipsis-horizontal': c => dot(6, 16, c, 1.8) + dot(16, 16, c, 1.8) + dot(26, 16, c, 1.8),
};

const ALIASES = {
  create: 'pencil', 'paper-plane': 'send', 'chatbubble-ellipses': 'chatbubble',
  chatbubbles: 'chatbubble', alert: 'alert-circle', help: 'help-circle',
  repeat: 'swap-horizontal', flame: 'bonfire', rocket: 'rank-archer', library: 'document-text',
  'checkmark-shield': 'shield-checkmark',
};
const PALETTES = {
  'request-note': ['#E7C590', '#A7BF98'],
  pencil: ['#DFB66F', '#DEA088'],
  'rank-squire': ['#DBBB8E', '#A7BF98'],
  'rank-archer': ['#DDB483', '#DDB483'],
  'rank-outlaw': ['#DEA088', '#E9BC96'],
  'rank-ranger': ['#9DBB90', '#D0A27A'],
  'rank-robin': ['#8EB081', '#DFB66F'],
  heart: ['#E6A392', '#D48976'], home: ['#B8CBB0', '#DCA083'],
  basket: ['#E7C590', '#D9AE74'], cube: ['#E7C590', '#D9AE74'],
  chatbubble: ['#AFCABB', '#D8E5DA'], people: ['#ABC5B8', '#E0AB91'],
  person: ['#ABC5B8', '#E0AB91'], leaf: ['#A7C393', '#D0DDB7'],
  gift: ['#E7BB9F', '#B7C9A6'], camera: ['#B8C4DA', '#D6DDE9'],
  notifications: ['#E9CA92', '#D9AD75'], bulb: ['#E9CA92', '#D9AD75'],
  bonfire: ['#E4A080', '#E9CA92'], football: ['#CDA182', '#E1BE9F'],
  hammer: ['#B9C4C3', '#DAAF8A'], construct: ['#B9C4C3', '#DAAF8A'],
};

export function resolveIconName(name = 'pricetag') {
  const base = String(name).replace(/-(outline|sharp)$/, '');
  const resolved = ALIASES[base] || base;
  return DRAWINGS[resolved] ? resolved : 'pricetag';
}

export function hasBorrowhoodIcon(name) {
  const base = String(name).replace(/-(outline|sharp)$/, '');
  return Boolean(DRAWINGS[ALIASES[base] || base]);
}

export function iconSvg(name, { color = '#42594C', illustrated = false, selected = false } = {}) {
  const base = resolveIconName(name);
  // Only color values belong in attributes; never interpolate names or markup.
  const safeColor = String(color).replace(/[<>"'&]/g, '') || '#42594C';
  const palette = PALETTES[base] || ['#C3CFB2', '#DDB89B'];
  const c = {
    stroke: illustrated ? '#42594C' : safeColor,
    fill: illustrated ? palette[0] : safeColor,
    accent: illustrated ? palette[1] : safeColor,
    opacity: illustrated ? 1 : selected ? (['heart', 'bookmark', 'star', 'ellipse'].includes(base) ? 1 : 0.2) : 0,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 32 32"><g fill="none" stroke="${c.stroke}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${DRAWINGS[base](c)}</g></svg>`;
}

export const BORROWHOOD_ICON_NAMES = Object.keys(DRAWINGS);
