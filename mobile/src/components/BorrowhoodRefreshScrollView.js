import React, { forwardRef } from 'react';
import { Platform, RefreshControl, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { BorrowhoodRefreshIndicator, useBorrowhoodRefresh } from './BorrowhoodRefreshList';
import { COLORS } from '../utils/config';

// Keep keyboard avoidance and swipe gestures on the plan page's existing scroll
// view. Its surface is transparent so the hat is visible in the native pull gap.
export default forwardRef(function BorrowhoodRefreshScrollView({ refreshing, onRefresh, style, children, ...props }, ref) {
  const { scrollY, branded, visibleRefreshing, handleRefresh, scrollHandler } = useBorrowhoodRefresh({ refreshing, onRefresh, nativeScroll: false });
  return <View style={[styles.viewport, style, Platform.OS === 'android' && visibleRefreshing && styles.androidRefreshing]}>
    {branded && <BorrowhoodRefreshIndicator scrollY={scrollY} refreshing={visibleRefreshing} />}
    <KeyboardAwareScrollView {...props} ref={ref} style={styles.scroll}
      onScroll={scrollHandler} scrollEventThrottle={16}
      refreshControl={<RefreshControl refreshing={visibleRefreshing} onRefresh={handleRefresh}
        progressViewOffset={Platform.OS === 'android' && branded ? -1000 : undefined}
        tintColor={branded ? 'transparent' : COLORS.spinner} colors={[branded ? 'transparent' : COLORS.spinner]}
        progressBackgroundColor={branded ? 'transparent' : undefined} />}>
      {children}
    </KeyboardAwareScrollView>
  </View>;
});

const styles = StyleSheet.create({
  viewport: { flex: 1, backgroundColor: COLORS.background, overflow: 'hidden' },
  androidRefreshing: { paddingTop: 80 },
  scroll: { flex: 1, backgroundColor: 'transparent' },
});
