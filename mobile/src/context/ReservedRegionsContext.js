import React, { createContext, useCallback, useContext, useState } from 'react';
import { Platform, StyleSheet, UIManager, View, requireNativeComponent } from 'react-native';

const hasNativeRegions = Platform.OS === 'ios' && UIManager.getViewManagerConfig?.('BorrowhoodReservedRegions');
const NativeRegions = hasNativeRegions ? requireNativeComponent('BorrowhoodReservedRegions') : null;
const ReservedRegionsContext = createContext({ regions: [], width: 0, height: 0 });

export function topReservedBottom(regions, height) {
  // Keyboard and other lower-window occlusions do not belong to the top ribbon.
  const topBand = Math.min(220, height / 3);
  return regions.reduce((bottom, region) =>
    Number.isFinite(region.y) && Number.isFinite(region.height) && region.y < topBand && region.height > 0
      ? Math.max(bottom, region.y + region.height) : bottom, 0);
}

export function reservedSideInsets(regions, width, top, bottom) {
  const clearance = { left: 0, right: 0 };
  if (!(width > 0)) return clearance;
  for (const region of regions) {
    if (![region.x, region.y, region.width, region.height].every(Number.isFinite)
      || region.width <= 0 || region.height <= 0
      || region.y >= bottom || region.y + region.height <= top) continue;
    if (region.x >= width / 2) clearance.right = Math.max(clearance.right, width - region.x);
    else if (region.x + region.width <= width / 2) clearance.left = Math.max(clearance.left, region.x + region.width);
  }
  return clearance;
}

// Reserve horizontal space only on the row that actually crosses system UI.
export function useReservedSideInsets(top, bottom) {
  const { regions, width } = useContext(ReservedRegionsContext);
  return reservedSideInsets(regions, width, top, bottom);
}

export function ReservedRegionsProvider({ children }) {
  const [layout, setLayout] = useState({ regions: [], width: 0, height: 0 });
  const onRegionsChange = useCallback(({ nativeEvent }) => {
    setLayout({ regions: nativeEvent.regions || [], width: nativeEvent.width || 0, height: nativeEvent.height || 0 });
  }, []);
  return <ReservedRegionsContext.Provider value={layout}>
    <View style={styles.window}>
      {children}
      {NativeRegions && <NativeRegions testID="Window.reservedRegions" pointerEvents="none"
        accessible={false} accessibilityValue={{ text: JSON.stringify(layout.regions) }} onRegionsChange={onRegionsChange} style={StyleSheet.absoluteFill} />}
    </View>
  </ReservedRegionsContext.Provider>;
}

export function useTopReservedSpace() {
  const { regions, height } = useContext(ReservedRegionsContext);
  return topReservedBottom(regions, height);
}
const styles = StyleSheet.create({ window: { flex: 1 } });
