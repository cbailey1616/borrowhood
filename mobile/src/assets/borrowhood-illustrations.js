import { iconSvg } from './borrowhood-icons';

// Small, quiet woodland scenes use the same original drawings as the controls.
// The paper stays flat; color and a little open space do the work.
const object = (name, x, y, size) => `<g transform="translate(${x} ${y}) scale(${size / 32})">${iconSvg(name, { illustrated: true }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>`;
const ground = '<path d="M34 105H166M39 102L36 97M43 102L46 96M157 103L160 98" fill="none" stroke="#B6BFA7" stroke-width="1.5" stroke-linecap="round"/>';
const scenes = {
  neighborhood: () => object('rank-ranger', 24, 26, 60) + object('home', 71, 25, 76) + object('leaf', 148, 68, 29) + ground,
  saved: () => object('heart', 59, 19, 81) + object('leaf', 142, 64, 30) + ground,
  sharing: () => object('basket', 55, 29, 84) + object('leaf', 139, 64, 31) + ground,
  messages: () => object('chatbubble', 47, 28, 83) + object('mail', 123, 68, 43) + ground,
  caughtUp: () => object('notifications', 62, 19, 76) + object('leaf', 139, 68, 28) + ground,
};

export function illustrationSvg(scene = 'neighborhood') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360" viewBox="0 0 200 120">${(scenes[scene] || scenes.neighborhood)()}</svg>`;
}

export const BORROWHOOD_SCENES = Object.keys(scenes);
