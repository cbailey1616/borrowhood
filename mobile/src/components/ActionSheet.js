import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import PopupLayer from './PopupLayer';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import { haptics } from '../utils/haptics';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';

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
  const [closing, setClosing] = useState(false);
  const pending = useRef(null);
  const finishDismiss = useCallback(() => {
    const callback = pending.current;
    pending.current = null;
    callback?.();
  }, []);
  useEffect(() => { if (!isVisible) setClosing(false); }, [isVisible]);
  useEffect(() => {
    if (closing && Platform.OS !== 'ios') finishDismiss();
  }, [closing, finishDismiss]);
  const dismiss = useCallback(callback => {
    if (pending.current || closing) return;
    pending.current = callback;
    setClosing(true);
  }, [closing]);

  const handleCancel = useCallback(() => {
    haptics.light();
    dismiss(() => onClose?.());
  }, [onClose, dismiss]);

  const handleAction = useCallback(
    (action) => {
      if (action.destructive) {
        haptics.warning();
      } else {
        haptics.light();
      }
      if (multiSelect) action.onPress?.();
      else dismiss(() => {
        action.onPress?.();
        onClose?.();
      });
    },
    [multiSelect, onClose, dismiss]
  );

  const bottomPad = (insets.bottom || 34) + SPACING.sm;

  return (
    <PopupLayer
      visible={isVisible && !closing}
      onDismiss={finishDismiss}
      onRequestClose={handleCancel}
    >
      <View style={styles.modalContainer}>
        {/* Full-screen dim backdrop */}
        <AnimatedPressable
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(120)}
          style={styles.backdrop}
          onPress={handleCancel}
        />

        {/* Sheet content */}
        <Animated.View
          entering={SlideInDown.duration(200)}
          exiting={SlideOutDown.duration(150)}
          style={[styles.sheetContainer, { paddingBottom: bottomPad }]}
        >
          <View style={styles.sheetCard}>
            <HapticPressable accessibilityRole="button" accessibilityLabel="Close menu"
              onPress={handleCancel} style={styles.closeControl}>
              <Ionicons name="close" size={20} color={COLORS.primary} />
            </HapticPressable>
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
                  testID={action.testID}
                  accessibilityLabel={action.accessibilityLabel || (typeof action.label === 'string' ? action.label : undefined)}
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
    </PopupLayer>
  );
}

const styles = StyleSheet.create({
  closeControl: {
    alignSelf: 'flex-end', width: 44, height: 44, marginTop: SPACING.sm,
    borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  modalContainer: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
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
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    flexShrink: 1,
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
