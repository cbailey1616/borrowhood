import { iconSvg } from './borrowhood-icons';

// Small, quiet woodland scenes use the same original drawings as the controls.
// The paper stays flat; color and a little open space do the work.
const object = (name, x, y, size) => `<g transform="translate(${x} ${y}) scale(${size / 32})">${iconSvg(name, { illustrated: true }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>`;
const ground = '<path d="M34 105H166M39 102L36 97M43 102L46 96M157 103L160 98" fill="none" stroke="#B6BFA7" stroke-width="1.5" stroke-linecap="round"/>';
const scenes = {
  neighborhood: () => object('tree', 24, 26, 60) + object('home', 71, 25, 76) + object('leaf', 148, 68, 29) + ground,
  saved: () => object('heart', 59, 19, 81) + object('leaf', 142, 64, 30) + ground,
  sharing: () => object('basket', 55, 29, 84) + object('leaf', 139, 64, 31) + ground,
  messages: () => object('chatbubble', 47, 28, 83) + object('mail', 123, 68, 43) + ground,
  caughtUp: () => object('notifications', 62, 19, 76) + object('leaf', 139, 68, 28) + ground,
  onboardingShare: () => object('home', 22, 26, 66) + object('basket', 99, 44, 67) + object('leaf', 161, 69, 25) + ground,
  onboardingAudience: () => object('people', 20, 32, 68) + object('home', 112, 28, 66) +
    '<path d="M91 63h14m-7-5v10" fill="none" stroke="#DFB66F" stroke-width="2.5" stroke-linecap="round"/>' + ground,
  onboardingTown: () => object('home', 29, 30, 64) + object('location', 109, 22, 71) + ground,
  onboardingVerify: () => object('identity-seal', 58, 13, 86) +
    '<path d="M40 48l-7-8m8 23l-10-2m127-13l7-8m-6 23l10-2" fill="none" stroke="#A6B69B" stroke-width="2.5" stroke-linecap="round"/>' + ground,
};

export function illustrationSvg(scene = 'neighborhood') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360" viewBox="0 0 200 120">${(scenes[scene] || scenes.neighborhood)()}</svg>`;
}

export const BORROWHOOD_SCENES = Object.keys(scenes);
