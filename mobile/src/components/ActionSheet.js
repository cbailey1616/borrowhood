import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ScrollView, useWindowDimensions } from 'react-native';
import PopupLayer from './PopupLayer';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import { haptics } from '../utils/haptics';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import LayeredCard from './LayeredCard';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function ActionSheet({
  isVisible,
  onClose,
  title,
  message,
  actions = [],
  cancelLabel = 'Cancel',
  multiSelect = false,
  variant = 'menu',
  icon,
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const confirmation = variant === 'confirmation';
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
          style={[styles.sheetContainer, { paddingBottom: bottomPad, maxHeight: height - insets.top - SPACING.md }]}
        >
          <LayeredCard style={styles.sheetDepth} radius={RADIUS.xl}>
            <ScrollView style={styles.sheetCard} contentContainerStyle={confirmation && styles.confirmationCard} bounces={false}>
              {confirmation ? <>
                <View style={styles.confirmationHeader}>
                  {icon ? <View style={styles.confirmationIcon}>{icon}</View> : null}
                  <Text style={styles.confirmationTitle}>{title}</Text>
                  <HapticPressable accessibilityRole="button" accessibilityLabel="Close confirmation" onPress={handleCancel} style={styles.confirmationClose}>
                    <Ionicons name="close" size={20} color={COLORS.primary} />
                  </HapticPressable>
                </View>
                {message ? <Text style={styles.confirmationMessage}>{message}</Text> : null}
              </> : <>
              {title ? (
                <View style={styles.header}>
                  <Text style={styles.title}>{title}</Text>
                  {message ? <Text style={styles.message}>{message}</Text> : null}
                </View>
              ) : null}
              </>}
              <View style={[styles.actionsContainer, confirmation && styles.confirmationActions]}>
                {actions.map((action, index) => (
                  <HapticPressable
                    key={index}
                    onPress={() => handleAction(action)}
                    haptic={null}
                    accessibilityRole="button"
                    testID={action.testID}
                    accessibilityLabel={action.accessibilityLabel || (typeof action.label === 'string' ? action.label : undefined)}
                    style={[
                      styles.actionButton,
                      action.destructive && styles.destructiveButton,
                      action.primary && styles.primaryButton,
                      confirmation && styles.confirmationButton,
                      confirmation && !action.primary && !action.destructive && styles.secondaryButton,
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
                        confirmation && styles.confirmationActionText,
                        confirmation && !action.primary && !action.destructive && styles.secondaryText,
                      ]}
                    >
                      {action.label}
                    </Text>
                  </HapticPressable>
                ))}
              </View>
            </ScrollView>
          </LayeredCard>
          {!confirmation && <HapticPressable
            onPress={handleCancel}
            haptic="light"
            accessibilityRole="button"
            style={styles.cancelButton}
          >
            <Text style={styles.cancelText}>{multiSelect ? 'Done' : cancelLabel}</Text>
          </HapticPressable>}
        </Animated.View>
      </View>
    </PopupLayer>
  );
}

const styles = StyleSheet.create({
  confirmationCard: { paddingVertical: 20 },
  confirmationHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  confirmationIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  confirmationTitle: { ...TYPOGRAPHY.h2, flex: 1, color: COLORS.primary, fontSize: 21, lineHeight: 27 },
  confirmationClose: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  confirmationMessage: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, lineHeight: 24, marginBottom: 20 },
  confirmationActions: { gap: 10, marginBottom: 0 },
  confirmationButton: { justifyContent: 'center', minHeight: 52, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 18, marginTop: 0, borderBottomWidth: 0 },
  confirmationActionText: { ...TYPOGRAPHY.button, lineHeight: 22, textAlign: 'center' },
  secondaryButton: { borderWidth: 1, borderBottomWidth: 1, borderColor: COLORS.borderGreen, backgroundColor: COLORS.surface },
  secondaryText: { color: COLORS.primary },
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
    width: '100%',
    maxWidth: 572,
    alignSelf: 'center',
    marginHorizontal: 'auto',
  },
  sheetDepth: { flexShrink: 1, marginBottom: SPACING.xs },
  sheetCard: {
    flexGrow: 0,
    flexShrink: 1,
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
    flexShrink: 0,
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    marginTop: SPACING.md,
  },
  cancelText: {
    ...TYPOGRAPHY.headline,
    color: COLORS.primary,
  },
});
