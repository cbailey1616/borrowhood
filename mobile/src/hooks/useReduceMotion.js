import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Start still until the native preference arrives, and follow changes while open.
export default function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let mounted = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', value => {
      changed = true;
      if (mounted) setReduceMotion(Boolean(value));
    });
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.()).then(value => {
      if (mounted && !changed && typeof value === 'boolean') setReduceMotion(value);
    }).catch(() => {});
    return () => { mounted = false; subscription?.remove?.(); };
  }, []);
  return reduceMotion;
}
