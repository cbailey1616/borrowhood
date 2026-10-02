import React from 'react';
import { FriendlyIcon } from './Icon';

// Category controls use the same untiled line drawings as other list rows.
export default function CategoryIcon({ icon, size = 22, radius, illustrated = false, ...props }) {
  return <FriendlyIcon {...props} name={String(icon).startsWith('sparkles') ? 'brush' : icon}
    size={size} illustrated={illustrated} />;
}
