import React, { forwardRef, useCallback } from 'react';
import { RefreshControl } from 'react-native';
import { haptics } from '../utils/haptics';

// Feedback belongs to the user's pull gesture, never to a loading-state change.
// Forward native props, event arguments, and callback results unchanged.
export default forwardRef(function HapticRefreshControl({ onRefresh, refreshing, enabled, ...props }, ref) {
  const handleRefresh = useCallback((...args) => {
    if (!refreshing && enabled !== false) haptics.light();
    return onRefresh?.(...args);
  }, [onRefresh, refreshing, enabled]);

  return <RefreshControl {...props} ref={ref} refreshing={refreshing}
    enabled={enabled} onRefresh={handleRefresh} />;
});
