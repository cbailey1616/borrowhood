import { COLORS } from '../utils/config';

const sun = (x, y, color = '#EBC573') => `<circle cx="${x}" cy="${y}" r="66" fill="${color}" opacity="0.16"/><circle cx="${x}" cy="${y}" r="46" fill="${color}" opacity="0.32"/>`;
const grove = (x, y, color, scale = 1) => `<g transform="translate(${x} ${y}) scale(${scale})" fill="${color}"><circle cx="-20" cy="0" r="15"/><circle cx="0" cy="-10" r="22"/><circle cx="25" cy="1" r="16"/><circle cx="49" cy="-7" r="19"/></g>`;
const pine = (x, y, height, color) => `<path d="M${x} ${y}l${height * 0.28} ${height * 0.57}h-${height * 0.13}l${height * 0.24} ${height * 0.43}h-${height * 0.78}l${height * 0.24}-${height * 0.43}h-${height * 0.13}Z" fill="${color}"/>`;
const hills = (w, back, front) => `<path d="M0 110Q${w * 0.19} 85 ${w * 0.43} 102T${w * 0.78} 96T${w} 88V176H0Z" fill="${back}"/><path d="M0 139Q${w * 0.21} 116 ${w * 0.48} 127T${w} 111V176H0Z" fill="${front}"/>`;
const birch = (x, y, scale = 1) => `<g transform="translate(${x} ${y}) scale(${scale})"><ellipse cy="-20" rx="17" ry="24" fill="#BDCDA9"/><ellipse cx="13" cy="-11" rx="15" ry="19" fill="#D0DBBD"/><path d="M0-25L2 32M2 8L13-9" stroke="#F8F2E4" stroke-width="5" stroke-linecap="round"/><path d="M0-7H4M-1 6H2M1 22H5" stroke="#9EAF91" stroke-width="1.5" stroke-linecap="round"/></g>`;
const flowers = (x, y) => `<g transform="translate(${x} ${y})"><path d="M0 0V13M12 3V14M22-6V13" fill="none" stroke="#A1B28B" stroke-width="1.5"/><circle r="3" fill="#D8AFAC"/><circle cx="12" cy="3" r="3" fill="#E5C277"/><circle cx="22" cy="-6" r="3" fill="#B2BFCA"/></g>`;

// Every scene leaves the wordmark clear and fades into the same feed surface.
// Stable IDs let a saved rotation survive additions or changes to the artwork.
export const FEED_WOODLAND_SCENES = [
  {
    id: 'sunlit-grove', name: 'Sunlit grove', sky: '#F4EAD6',
    draw: w => `<circle cx="${w - 64}" cy="44" r="66" fill="#EFCF86" opacity="0.22"/>
      <circle cx="${w - 64}" cy="44" r="46" fill="#EBC573" opacity="0.36"/>
      ${hills(w, '#E0E2C9', '#D5DEC0')}
      <g fill="#AEC49A"><circle cx="22" cy="129" r="14"/><circle cx="40" cy="120" r="19"/><circle cx="58" cy="133" r="13"/></g>
      <g fill="#C5D5B4"><circle cx="${w * 0.55}" cy="104" r="13"/><circle cx="${w * 0.6}" cy="96" r="18"/><circle cx="${w * 0.65}" cy="104" r="12"/>
      <circle cx="${w - 103}" cy="94" r="15"/><circle cx="${w - 83}" cy="86" r="22"/><circle cx="${w - 58}" cy="95" r="16"/><circle cx="${w - 33}" cy="88" r="19"/></g>`,
  },
  {
    id: 'pine-meadow', name: 'Pine meadow', sky: '#E6EBDF',
    draw: w => `${sun(w - 66, 42, '#E6D6A8')}
      <path d="M${w * 0.25} 74h68M${w * 0.33} 82h47" stroke="#F8F5EA" stroke-width="7" stroke-linecap="round" opacity="0.7"/>
      ${hills(w, '#D5DFC9', '#C3D4B7')}
      ${pine(21, 93, 51, '#A8BF9E')}${pine(47, 73, 67, '#BACBB0')}${pine(78, 96, 42, '#A8BF9E')}
      ${pine(w - 115, 94, 45, '#B3C9AF')}${pine(w - 76, 66, 75, '#A6BEA2')}${pine(w - 35, 82, 57, '#B5C9AA')}`,
  },
  {
    id: 'birch-trail', name: 'Birch trail', sky: '#F0ECD9',
    draw: w => `${sun(w - 64, 40, '#E5D79C')}${hills(w, '#DEE2C9', '#C8D5B5')}
      <path d="M${w * 0.57} 100C${w * 0.4} 113 ${w * 0.68} 122 ${w * 0.41} 144L${w * 0.7} 168H${w * 0.28}C${w * 0.77} 119 ${w * 0.33} 115 ${w * 0.57} 100Z" fill="#F1E6CE"/>
      ${birch(22, 105, 0.9)}${birch(56, 100, 0.72)}${birch(w - 89, 105, 0.95)}${birch(w - 42, 97, 1.05)}`,
  },
  {
    id: 'wildflower-clearing', name: 'Wildflower clearing', sky: '#F3E7E1',
    draw: w => `${sun(w - 62, 45, '#E7C8AE')}${hills(w, '#DFE0CC', '#CBD7BD')}
      ${grove(25, 114, '#B5C6A1', 0.75)}${grove(w - 86, 105, '#C5D2AE', 0.93)}
      <g fill="#E6CBC2"><circle cx="${w - 103}" cy="88" r="6"/><circle cx="${w - 81}" cy="82" r="7"/><circle cx="${w - 61}" cy="95" r="5"/><circle cx="${w - 35}" cy="89" r="6"/></g>
      ${flowers(17, 144)}${flowers(w - 29, 126)}${flowers(w * 0.42, 103)}`,
  },
  {
    id: 'autumn-woods', name: 'Autumn woods', sky: '#F3E5D3',
    draw: w => `${sun(w - 66, 44, '#E9BC76')}${hills(w, '#E1DDC4', '#CFD2B3')}
      ${grove(27, 121, '#D7BA88', 0.8)}${grove(w - 97, 96, '#DAB593', 1.02)}
      <g fill="#E3C88E"><circle cx="${w - 106}" cy="81" r="18"/><circle cx="${w - 48}" cy="97" r="20"/></g>
      <path d="M${w - 90} 100V134M${w - 90} 113l-12-12" stroke="#BAA07E" stroke-width="2.5" stroke-linecap="round"/>
      <g fill="#D1AA70" opacity="0.65"><ellipse cx="${w * 0.37}" cy="83" rx="5" ry="2.5" transform="rotate(-25 ${w * 0.37} 83)"/><ellipse cx="${w * 0.43}" cy="95" rx="4" ry="2.5"/><ellipse cx="${w * 0.51}" cy="78" rx="5" ry="2.5" transform="rotate(25 ${w * 0.51} 78)"/></g>`,
  },
  {
    id: 'misty-creek', name: 'Misty creek', sky: '#E5EAE6',
    draw: w => `${sun(w - 65, 43, '#F7F1D6')}
      <path d="M0 113Q${w * 0.22} 55 ${w * 0.43} 104T${w * 0.8} 94T${w} 103V176H0Z" fill="#CCD9CF"/>
      ${pine(32, 81, 60, '#ADBEAE')}${pine(67, 100, 40, '#C2D0BC')}${pine(w - 46, 74, 66, '#B0C1B3')}
      <path d="M0 143Q${w * 0.2} 118 ${w * 0.49} 134T${w} 119V176H0Z" fill="#C7D2B8"/>
      <path d="M${w * 0.64} 105Q${w * 0.35} 124 ${w * 0.74} 135T${w} 161V176H${w * 0.8}Q${w * 0.31} 137 ${w * 0.54} 121T${w * 0.64} 105Z" fill="#BFCFD0"/>
      <path d="M${w * 0.18} 89H${w * 0.58}M${w * 0.32} 101H${w * 0.82}" stroke="#F5F2E8" stroke-width="6" stroke-linecap="round" opacity="0.65"/>`,
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
