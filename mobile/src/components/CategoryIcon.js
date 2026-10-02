import React from 'react';
import { FriendlyIcon } from './Icon';

// Keep category drawings in the original woodland palette, without a tile.
export default function CategoryIcon({ icon, size = 22, radius, illustrated = true, ...props }) {
  return <FriendlyIcon {...props} name={String(icon).startsWith('sparkles') ? 'brush' : icon}
    size={size} illustrated={illustrated} />;
}
