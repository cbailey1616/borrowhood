import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const MainViewportContext = createContext(null);

// Keep tab content sized to the full current window through rotation and resizing.
// Navigation stays along the bottom on phones, Duo, and tablets.
export function useContentDimensions() {
  const window = useWindowDimensions();
  const viewport = useContext(MainViewportContext);
  return viewport ? { ...window, width: viewport.width, height: viewport.height } : window;
}

export function useContentInsets() {
  const insets = useSafeAreaInsets();
  const viewport = useContext(MainViewportContext);
  return viewport?.insets || insets;
}

export function useMainViewport() {
  return useContext(MainViewportContext);
}
