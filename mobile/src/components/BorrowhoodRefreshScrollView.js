import React, { forwardRef } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { BorrowhoodRefreshIndicator, useBorrowhoodRefresh } from './BorrowhoodRefreshList';
import { COLORS } from '../utils/config';

// Keep keyboard avoidance and swipe gestures on the plan page's existing scroll
// view. Its surface is transparent so the hat is visible in the native pull gap.
export default forwardRef(function BorrowhoodRefreshScrollView({ refreshing, onRefresh, style, children, ...props }, ref) {
  const { scrollY, branded, visibleRefreshing, handleRefresh, scrollHandler } = useBorrowhoodRefresh({ refreshing, onRefresh, nativeScroll: false });
  return <View style={[styles.viewport, style]}>
    {branded && <BorrowhoodRefreshIndicator scrollY={scrollY} refreshing={visibleRefreshing} />}
    <KeyboardAwareScrollView {...props} ref={ref} style={styles.scroll}
      onScroll={scrollHandler} scrollEventThrottle={16}
      refreshControl={<RefreshControl refreshing={visibleRefreshing} onRefresh={handleRefresh}
        tintColor={branded ? 'transparent' : COLORS.spinner} colors={[COLORS.spinner]} />}>
      {children}
    </KeyboardAwareScrollView>
  </View>;
});

const styles = StyleSheet.create({
  viewport: { flex: 1, backgroundColor: COLORS.background, overflow: 'hidden' },
  scroll: { flex: 1, backgroundColor: 'transparent' },
});
