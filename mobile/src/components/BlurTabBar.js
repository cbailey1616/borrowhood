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
import { Ionicons } from './Icon';
import { COLORS, ANIMATION } from '../utils/config';
import { haptics } from '../utils/haptics';
import HapticPressable from './HapticPressable';

const TAB_ICONS = {
  Feed: { active: 'home', inactive: 'home-outline' },
  // Saved is an always-recognizable destination, not a toggle. Keep its
  // signature pink filled heart visible even when another tab is selected.
  Saved: { active: 'heart', inactive: 'heart' },
  MyItems: { active: 'basket', inactive: 'basket-outline' },
  Activity: { active: 'chatbubbles', inactive: 'chatbubbles-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
};

const TAB_LABELS = {
  Feed: 'Home',
  Saved: 'Saved',
  MyItems: 'My Posts',
  Activity: 'Inbox',
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
  const isSaved = route.name === 'Saved';
  const iconColor = isSaved ? COLORS.saved : isFocused ? COLORS.primary : COLORS.textSecondary;

  return (
    <HapticPressable
      haptic="selection"
      onPress={handlePress}
      onLongPress={onLongPress}
      style={styles.tabButton}
      scaleDown={1}
      testID={`TabBar.${route.name}`}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={label}
      accessibilityValue={badge > 0 ? { text: `${badge} new` } : undefined}
    >
      <Animated.View style={[
        styles.iconContainer,
        isFocused && styles.iconContainerActive,
        isFocused && isSaved && styles.savedIconContainerActive,
        animatedStyle,
      ]}>
        <Ionicons
          name={iconName}
          size={26}
          illustrated={!isSaved}
          selected={isSaved || isFocused}
          color={iconColor}
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
          isFocused && { fontWeight: '600' },
          { color: isFocused ? COLORS.primary : COLORS.textSecondary },
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
        <BlurView intensity={80} tint="light" style={styles.blur}>
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
    backgroundColor: COLORS.materials.thick,
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
    width: 48,
    height: 36,
    borderRadius: 18,
  },
  iconContainerActive: {
    backgroundColor: COLORS.primaryMuted,
  },
  savedIconContainerActive: {
    backgroundColor: COLORS.savedMuted,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: COLORS.danger,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
