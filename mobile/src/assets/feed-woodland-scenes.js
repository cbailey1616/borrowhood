import { COLORS } from '../utils/config';

const sun = (x, y, color = COLORS.artwork.honey16) => `<circle cx="${x}" cy="${y}" r="66" fill="${color}" opacity="0.16"/><circle cx="${x}" cy="${y}" r="46" fill="${color}" opacity="0.32"/>`;
const grove = (x, y, color, scale = 1) => `<g transform="translate(${x} ${y}) scale(${scale})" fill="${color}"><circle cx="-20" cy="0" r="15"/><circle cx="0" cy="-10" r="22"/><circle cx="25" cy="1" r="16"/><circle cx="49" cy="-7" r="19"/></g>`;
const pine = (x, y, height, color) => `<path d="M${x} ${y}l${height * 0.28} ${height * 0.57}h-${height * 0.13}l${height * 0.24} ${height * 0.43}h-${height * 0.78}l${height * 0.24}-${height * 0.43}h-${height * 0.13}Z" fill="${color}"/>`;
const hills = (w, back, front) => `<path d="M0 110Q${w * 0.19} 85 ${w * 0.43} 102T${w * 0.78} 96T${w} 88V176H0Z" fill="${back}"/><path d="M0 139Q${w * 0.21} 116 ${w * 0.48} 127T${w} 111V176H0Z" fill="${front}"/>`;
const birch = (x, y, scale = 1) => `<g transform="translate(${x} ${y}) scale(${scale})"><ellipse cy="-20" rx="17" ry="24" fill="${COLORS.artwork.sage45}"/><ellipse cx="13" cy="-11" rx="15" ry="19" fill="${COLORS.artwork.sage66}"/><path d="M0-25L2 32M2 8L13-9" stroke="${COLORS.artwork.parchment16}" stroke-width="5" stroke-linecap="round"/><path d="M0-7H4M-1 6H2M1 22H5" stroke="${COLORS.artwork.sage10}" stroke-width="1.5" stroke-linecap="round"/></g>`;
const flowers = (x, y) => `<g transform="translate(${x} ${y})"><path d="M0 0V13M12 3V14M22-6V13" fill="none" stroke="${COLORS.artwork.sage08}" stroke-width="1.5"/><circle r="3" fill="${COLORS.artwork.clay10}"/><circle cx="12" cy="3" r="3" fill="${COLORS.artwork.honey14}"/><circle cx="22" cy="-6" r="3" fill="${COLORS.artwork.sky01}"/></g>`;

// Every scene leaves the wordmark clear and fades into the same feed surface.
// Stable IDs let a saved rotation survive additions or changes to the artwork.
export const FEED_WOODLAND_SCENES = [
  {
    id: 'sunlit-grove', name: 'Sunlit grove', sky: COLORS.artwork.parchment12,
    draw: w => `<circle cx="${w - 64}" cy="44" r="66" fill="${COLORS.artwork.honey21}" opacity="0.22"/>
      <circle cx="${w - 64}" cy="44" r="46" fill="${COLORS.artwork.honey16}" opacity="0.36"/>
      ${hills(w, COLORS.artwork.honey43, COLORS.artwork.sage67)}
      <g fill="${COLORS.artwork.sage25}"><circle cx="22" cy="129" r="14"/><circle cx="40" cy="120" r="19"/><circle cx="58" cy="133" r="13"/></g>
      <g fill="${COLORS.artwork.sage56}"><circle cx="${w * 0.55}" cy="104" r="13"/><circle cx="${w * 0.6}" cy="96" r="18"/><circle cx="${w * 0.65}" cy="104" r="12"/>
      <circle cx="${w - 103}" cy="94" r="15"/><circle cx="${w - 83}" cy="86" r="22"/><circle cx="${w - 58}" cy="95" r="16"/><circle cx="${w - 33}" cy="88" r="19"/></g>`,
  },
  {
    id: 'pine-meadow', name: 'Pine meadow', sky: COLORS.artwork.sage75,
    draw: w => `${sun(w - 66, 42, COLORS.artwork.honey28)}
      <path d="M${w * 0.25} 74h68M${w * 0.33} 82h47" stroke="${COLORS.artwork.parchment19}" stroke-width="7" stroke-linecap="round" opacity="0.7"/>
      ${hills(w, COLORS.artwork.sage70, COLORS.artwork.sage60)}
      ${pine(21, 93, 51, COLORS.artwork.sage23)}${pine(47, 73, 67, COLORS.artwork.sage50)}${pine(78, 96, 42, COLORS.artwork.sage23)}
      ${pine(w - 115, 94, 45, COLORS.artwork.sage46)}${pine(w - 76, 66, 75, COLORS.artwork.sage26)}${pine(w - 35, 82, 57, COLORS.artwork.sage39)}`,
  },
  {
    id: 'birch-trail', name: 'Birch trail', sky: COLORS.artwork.parchment11,
    draw: w => `${sun(w - 64, 40, COLORS.artwork.honey24)}${hills(w, COLORS.artwork.honey42, COLORS.artwork.sage58)}
      <path d="M${w * 0.57} 100C${w * 0.4} 113 ${w * 0.68} 122 ${w * 0.41} 144L${w * 0.7} 168H${w * 0.28}C${w * 0.77} 119 ${w * 0.33} 115 ${w * 0.57} 100Z" fill="${COLORS.artwork.parchment06}"/>
      ${birch(22, 105, 0.9)}${birch(56, 100, 0.72)}${birch(w - 89, 105, 0.95)}${birch(w - 42, 97, 1.05)}`,
  },
  {
    id: 'wildflower-clearing', name: 'Wildflower clearing', sky: COLORS.artwork.clay13,
    draw: w => `${sun(w - 62, 45, COLORS.artwork.wood45)}${hills(w, COLORS.artwork.honey44, COLORS.artwork.sage64)}
      ${grove(25, 114, COLORS.artwork.sage30, 0.75)}${grove(w - 86, 105, COLORS.artwork.sage52, 0.93)}
      <g fill="${COLORS.artwork.clay12}"><circle cx="${w - 103}" cy="88" r="6"/><circle cx="${w - 81}" cy="82" r="7"/><circle cx="${w - 61}" cy="95" r="5"/><circle cx="${w - 35}" cy="89" r="6"/></g>
      ${flowers(17, 144)}${flowers(w - 29, 126)}${flowers(w * 0.42, 103)}`,
  },
  {
    id: 'autumn-woods', name: 'Autumn woods', sky: COLORS.artwork.parchment09,
    draw: w => `${sun(w - 66, 44, COLORS.artwork.wood25)}${hills(w, COLORS.artwork.honey41, COLORS.artwork.honey25)}
      ${grove(27, 121, COLORS.artwork.wood24, 0.8)}${grove(w - 97, 96, COLORS.artwork.wood31, 1.02)}
      <g fill="${COLORS.artwork.honey20}"><circle cx="${w - 106}" cy="81" r="18"/><circle cx="${w - 48}" cy="97" r="20"/></g>
      <path d="M${w - 90} 100V134M${w - 90} 113l-12-12" stroke="${COLORS.artwork.wood10}" stroke-width="2.5" stroke-linecap="round"/>
      <g fill="${COLORS.artwork.wood12}" opacity="0.65"><ellipse cx="${w * 0.37}" cy="83" rx="5" ry="2.5" transform="rotate(-25 ${w * 0.37} 83)"/><ellipse cx="${w * 0.43}" cy="95" rx="4" ry="2.5"/><ellipse cx="${w * 0.51}" cy="78" rx="5" ry="2.5" transform="rotate(25 ${w * 0.51} 78)"/></g>`,
  },
  {
    id: 'misty-creek', name: 'Misty creek', sky: COLORS.artwork.stone10,
    draw: w => `${sun(w - 65, 43, COLORS.artwork.parchment14)}
      <path d="M0 113Q${w * 0.22} 55 ${w * 0.43} 104T${w * 0.8} 94T${w} 103V176H0Z" fill="${COLORS.artwork.sage68}"/>
      ${pine(32, 81, 60, COLORS.artwork.stone05)}${pine(67, 100, 40, COLORS.artwork.sage61)}${pine(w - 46, 74, 66, COLORS.artwork.stone06)}
      <path d="M0 143Q${w * 0.2} 118 ${w * 0.49} 134T${w} 119V176H0Z" fill="${COLORS.artwork.sage57}"/>
      <path d="M${w * 0.64} 105Q${w * 0.35} 124 ${w * 0.74} 135T${w} 161V176H${w * 0.8}Q${w * 0.31} 137 ${w * 0.54} 121T${w * 0.64} 105Z" fill="${COLORS.artwork.sky03}"/>
      <path d="M${w * 0.18} 89H${w * 0.58}M${w * 0.32} 101H${w * 0.82}" stroke="${COLORS.artwork.parchment17}" stroke-width="6" stroke-linecap="round" opacity="0.65"/>`,
  },
];

export const getFeedWoodlandScene = index => FEED_WOODLAND_SCENES[index] || FEED_WOODLAND_SCENES[0];

export function feedWoodlandSvg(index, width = 402, height = 176) {
  const w = Number.isFinite(width) ? Math.max(1, width) : 402;
  const h = Number.isFinite(height) ? Math.max(176, height) : 176;
  // Extend the sky above the landscape instead of stretching its geometry.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 ${176 - h} ${w} ${h}">
    ${getFeedWoodlandScene(index).draw(w)}
    <path d="M0 161Q${w * 0.22} 150 ${w * 0.47} 163T${w} 145V176H0Z" fill="${COLORS.background}"/>
  </svg>`;
}
