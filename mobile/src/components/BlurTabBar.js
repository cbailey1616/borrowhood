import React, { useCallback } from 'react';
import { View, Text, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, ANIMATION } from '../utils/config';
import { haptics } from '../utils/haptics';
import HapticPressable from './HapticPressable';

const TAB_ICONS = {
  Feed: { active: 'home', inactive: 'home-outline' },
  Saved: { active: 'heart', inactive: 'heart-outline' },
  MyItems: { active: 'cube', inactive: 'cube-outline' },
  Activity: { active: 'notifications', inactive: 'notifications-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
};

const TAB_LABELS = {
  Feed: 'Feed',
  Saved: 'Saved',
  MyItems: 'My Items',
  Activity: 'Activity',
  Profile: 'Profile',
};

function TabButton({ route, isFocused, onPress, onLongPress, badge }) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    if (!isFocused) {
      scale.value = withSequence(
        withSpring(1.15, ANIMATION.spring.bouncy),
        withSpring(1, ANIMATION.spring.default)
      );
    }
    onPress();
  }, [isFocused, onPress]);

  const icons = TAB_ICONS[route.name] || { active: 'ellipse', inactive: 'ellipse-outline' };
  const iconName = isFocused ? icons.active : icons.inactive;
  const label = TAB_LABELS[route.name] || route.name;

  return (
    <HapticPressable
      haptic="selection"
      onPress={handlePress}
      onLongPress={onLongPress}
      style={styles.tabButton}
      scaleDown={1}
    >
      <Animated.View style={[styles.iconContainer, animatedStyle]}>
        <Ionicons
          name={iconName}
          size={24}
          color={isFocused ? COLORS.primary : COLORS.textMuted}
        />
        {badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </Animated.View>
      <Text
        style={[
          styles.label,
          { color: isFocused ? COLORS.primary : COLORS.textMuted },
        ]}
      >
        {label}
      </Text>
    </HapticPressable>
  );
}

export default function BlurTabBar({ state, descriptors, navigation, unreadCount = 0 }) {
  const insets = useSafeAreaInsets();

  const content = (
    <View style={[styles.inner, { paddingBottom: insets.bottom || 16 }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        return (
          <TabButton
            key={route.key}
            route={route}
            isFocused={isFocused}
            onPress={onPress}
            onLongPress={onLongPress}
            badge={route.name === 'Activity' ? unreadCount : 0}
          />
        );
      })}
    </View>
  );

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.container}>
        <View style={styles.separator} />
        <BlurView intensity={80} tint="dark" style={styles.blur}>
          <View style={styles.blurOverlay}>{content}</View>
        </BlurView>
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.androidFallback]}>
      <View style={styles.separator} />
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.separator,
  },
  blur: {
    overflow: 'hidden',
  },
  blurOverlay: {
    backgroundColor: COLORS.materials.thin,
  },
  androidFallback: {
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
  },
  inner: {
    flexDirection: 'row',
    paddingTop: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#E53935',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
