import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, Dimensions, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import { haptics } from '../utils/haptics';
import HapticPressable from './HapticPressable';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function ActionSheet({
  isVisible,
  onClose,
  title,
  message,
  actions = [],
  cancelLabel = 'Cancel',
  multiSelect = false,
}) {
  const insets = useSafeAreaInsets();

  const handleCancel = useCallback(() => {
    haptics.light();
    onClose?.();
  }, [onClose]);

  const handleAction = useCallback(
    (action) => {
      if (action.destructive) {
        haptics.warning();
      } else {
        haptics.light();
      }
      if (multiSelect) {
        action.onPress?.();
      } else {
        onClose?.();
        setTimeout(() => {
          action.onPress?.();
        }, 200);
      }
    },
    [multiSelect, onClose]
  );

  if (!isVisible) return null;

  const bottomPad = (insets.bottom || 34) + SPACING.sm;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Full-screen dim backdrop */}
      <AnimatedPressable
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={styles.backdrop}
        onPress={handleCancel}
      />

      {/* Sheet content */}
      <Animated.View
        entering={SlideInDown.duration(300).easing(Easing.out(Easing.cubic))}
        exiting={SlideOutDown.duration(200).easing(Easing.in(Easing.cubic))}
        style={[styles.sheetContainer, { paddingBottom: bottomPad }]}
      >
        <View style={styles.sheetCard}>
          <View style={styles.grabHandle} />
          {title ? (
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              {message ? <Text style={styles.message}>{message}</Text> : null}
            </View>
          ) : null}
          <View style={styles.actionsContainer}>
            {actions.map((action, index) => (
              <HapticPressable
                key={index}
                onPress={() => handleAction(action)}
                haptic={null}
                style={[
                  styles.actionButton,
                  action.destructive && styles.destructiveButton,
                  action.primary && styles.primaryButton,
                ]}
              >
                {action.icon ? (
                  <View style={styles.actionIcon}>{action.icon}</View>
                ) : null}
                <Text
                  style={[
                    styles.actionText,
                    action.destructive && styles.destructiveText,
                    action.primary && styles.primaryText,
                  ]}
                >
                  {action.label}
                </Text>
              </HapticPressable>
            ))}
          </View>
        </View>
        <HapticPressable
          onPress={handleCancel}
          haptic="light"
          style={styles.cancelButton}
        >
          <Text style={styles.cancelText}>{multiSelect ? 'Done' : cancelLabel}</Text>
        </HapticPressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.md,
  },
  sheetCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    overflow: 'hidden',
  },
  grabHandle: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.textMuted,
    opacity: 0.4,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  header: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
    marginBottom: SPACING.sm,
  },
  title: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  message: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  actionsContainer: {
    marginBottom: SPACING.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
  },
  actionIcon: {
    marginRight: SPACING.md,
  },
  actionText: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },
  destructiveButton: {
    justifyContent: 'center',
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.md,
    borderBottomWidth: 0,
    marginTop: SPACING.xs,
    paddingVertical: SPACING.lg,
  },
  destructiveText: {
    color: '#fff',
    fontWeight: '600',
  },
  primaryButton: {
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    borderBottomWidth: 0,
    marginTop: SPACING.xs,
    paddingVertical: SPACING.lg,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '600',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    marginTop: SPACING.sm,
  },
  cancelText: {
    ...TYPOGRAPHY.headline,
    color: COLORS.primary,
  },
});
