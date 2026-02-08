import React, { useCallback } from 'react';
import { View, Text, StyleSheet, LayoutAnimation } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../utils/config';
import { haptics } from '../utils/haptics';
import HapticPressable from './HapticPressable';

export default function SegmentedControl({
  segments,
  selectedIndex,
  onIndexChange,
  style,
  testID,
}) {
  const containerWidth = useSharedValue(0);
  const segmentCount = segments.length;

  const onLayout = useCallback(
    (e) => {
      containerWidth.value = e.nativeEvent.layout.width;
    },
    []
  );

  const indicatorStyle = useAnimatedStyle(() => {
    const width = containerWidth.value / segmentCount;
    return {
      width: width - 4,
      transform: [
        {
          translateX: withSpring(
            selectedIndex * width + 2,
            ANIMATION.spring.default
          ),
        },
      ],
    };
  });

  const handlePress = useCallback(
    (index) => {
      if (index !== selectedIndex) {
        haptics.selection();
        onIndexChange(index);
      }
    },
    [selectedIndex, onIndexChange]
  );

  return (
    <View style={[styles.container, style]} onLayout={onLayout} testID={testID}>
      <Animated.View style={[styles.indicator, indicatorStyle]} />
      {segments.map((segment, index) => (
        <HapticPressable
          key={index}
          onPress={() => handlePress(index)}
          style={styles.segment}
          haptic={null}
          scaleDown={1}
          testID={testID ? `${testID}.${index}` : undefined}
          accessibilityLabel={segment}
          accessibilityRole="tab"
        >
          <Text
            style={[
              styles.segmentText,
              selectedIndex === index && styles.segmentTextActive,
            ]}
          >
            {segment}
          </Text>
        </HapticPressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.sm,
    padding: 2,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm - 2,
    zIndex: 0,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    zIndex: 1,
  },
  segmentText: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: COLORS.text,
    fontWeight: '600',
  },
});
