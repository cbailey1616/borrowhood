import { useCallback, useEffect, useRef } from 'react';

// Capture this before awaiting work. A result may navigate only during the
// same visit to the same screen, even if the user leaves and returns meanwhile.
export default function useNavigationTask(navigation, identity) {
  const visit = useRef({ identity, generation: 0, mounted: true });
  if (visit.current.identity !== identity) {
    visit.current.identity = identity;
    visit.current.generation += 1;
  }
  useEffect(() => {
    visit.current.mounted = true;
    const unsubscribe = navigation?.addListener?.('blur', () => { visit.current.generation += 1; });
    return () => {
      visit.current.mounted = false;
      visit.current.generation += 1;
      unsubscribe?.();
    };
  }, [navigation]);
  return useCallback(() => {
    const generation = visit.current.generation;
    return () => !!navigation && visit.current.mounted && visit.current.generation === generation
      && navigation.isFocused?.() !== false;
  }, [navigation]);
}
