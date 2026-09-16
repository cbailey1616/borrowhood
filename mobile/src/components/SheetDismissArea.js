import React, { useMemo } from 'react';
import { PanResponder, View } from 'react-native';

// Only the sheet heading owns this gesture; scrolling its contents stays native.
export default function SheetDismissArea({ children, onDismiss, style }) {
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, { dx, dy }) => dy > 10 && dy > Math.abs(dx) * 1.5,
    onPanResponderRelease: (_event, { dy, vy }) => {
      if (dy >= 48 || (dy > 12 && vy > 0.7)) onDismiss();
    },
    onPanResponderTerminationRequest: () => true,
  }), [onDismiss]);
  return <View {...pan.panHandlers} style={style}>{children}</View>;
}
