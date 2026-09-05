import { Ionicons } from '@expo/vector-icons';

// Use the same outline family for decorative and category icons. Keep filled
// navigation states and status indicators explicit at their call sites.
export function outlineIcon(name = 'pricetag') {
  if (typeof name !== 'string' || !name) name = 'pricetag';
  if (name.endsWith('-outline')) return name;
  const outline = `${name.replace(/-sharp$/, '')}-outline`;
  return Ionicons.glyphMap[outline] ? outline : (Ionicons.glyphMap[name] ? name : 'pricetag-outline');
}
export { Ionicons };
export default Ionicons;
