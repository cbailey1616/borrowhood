import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ScrollView, useWindowDimensions } from 'react-native';
import PopupLayer from './PopupLayer';
import SheetDismissArea from './SheetDismissArea';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, CARD_SURFACE } from '../utils/config';
import { haptics } from '../utils/haptics';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import LayeredCard from './LayeredCard';
import useReduceMotion from '../hooks/useReduceMotion';

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
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const confirmation = variant === 'confirmation';
  const itemMenu = variant === 'item';
  const options = variant === 'options' || itemMenu;
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
    dismiss(() => onClose?.());
  }, [onClose, dismiss]);

  const handleAction = useCallback(
    (action) => {
      const feedback = action.haptic || (action.destructive ? 'warning' : null);
      if (feedback && haptics[feedback]) haptics[feedback]();
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
      <View style={styles.modalContainer} onAccessibilityEscape={handleCancel}>
        {/* Full-screen dim backdrop */}
        <AnimatedPressable
          entering={reduceMotion ? undefined : FadeIn.duration(150)}
          exiting={reduceMotion ? undefined : FadeOut.duration(120)}
          style={styles.backdrop}
          onPress={handleCancel}
          accessible={false}
        />

        {/* Sheet content */}
        <Animated.View
          entering={reduceMotion ? undefined : SlideInDown.duration(200)}
          exiting={reduceMotion ? undefined : SlideOutDown.duration(150)}
          style={[styles.sheetContainer, itemMenu && styles.itemSheetContainer, { paddingBottom: bottomPad, maxHeight: height - insets.top - SPACING.md }]}
        >
          <LayeredCard style={styles.sheetDepth} radius={itemMenu ? 28 : RADIUS.xl}>
            <ScrollView style={[styles.sheetCard, itemMenu && styles.itemSheetCard]} contentContainerStyle={[confirmation && styles.confirmationCard, options && styles.optionsCard, itemMenu && styles.itemCard]} bounces={false}>
              <SheetDismissArea onDismiss={handleCancel}>
              {itemMenu && <View style={styles.itemHandle} accessible={false} />}
              {confirmation || options ? <>
                <View style={[styles.confirmationHeader, itemMenu && styles.itemHeader]}>
                  {icon ? <View style={[styles.confirmationIcon, itemMenu && styles.itemHeaderIcon]}>{React.isValidElement(icon) ? React.cloneElement(icon, { size: 22 }) : icon}</View> : null}
                  <Text maxFontSizeMultiplier={1.4} style={[styles.confirmationTitle, itemMenu && styles.itemTitle]} accessibilityRole="header">{title}</Text>
                  <HapticPressable accessibilityRole="button" accessibilityLabel={options ? `Close ${title || 'options'}` : 'Close confirmation'} onPress={handleCancel} style={[styles.confirmationClose, itemMenu && styles.itemClose]}>
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
              </SheetDismissArea>
              <View style={[styles.actionsContainer, confirmation && styles.confirmationActions, options && styles.optionsActions, itemMenu && styles.itemActions]}>
                {actions.map((action, index) => (
                  <HapticPressable
                    key={index}
                    onPress={() => handleAction(action)}
                    haptic={null}
                    scaleDown={action.primary ? 0.97 : 1}
                    pressedBackgroundColor={action.primary || action.destructive ? undefined : COLORS.cardHover}
                    accessibilityRole={options && typeof action.selected === 'boolean' ? 'checkbox' : 'button'}
                    accessibilityState={options && typeof action.selected === 'boolean' ? { checked: action.selected } : undefined}
                    testID={action.testID}
                    accessibilityLabel={action.accessibilityLabel || (typeof action.label === 'string' ? action.label : undefined)}
                    style={[
                      styles.actionButton,
                      action.destructive && styles.destructiveButton,
                      action.primary && styles.primaryButton,
                      confirmation && styles.confirmationButton,
                      confirmation && !action.primary && !action.destructive && styles.secondaryButton,
                      options && styles.optionButton,
                      options && action.selected && styles.selectedOption,
                      itemMenu && styles.itemButton,
                      itemMenu && action.destructive && styles.itemDestructiveButton,
                    ]}
                  >
                    {action.icon ? (
                      <View style={[styles.actionIcon, options && styles.optionIcon, itemMenu && styles.itemActionIcon]}>{React.isValidElement(action.icon) ? React.cloneElement(action.icon, { size: 22 }) : action.icon}</View>
                    ) : null}
                    <Text maxFontSizeMultiplier={1.4}
                      style={[
                        styles.actionText,
                        action.destructive && styles.destructiveText,
                        action.primary && styles.primaryText,
                        confirmation && styles.confirmationActionText,
                        confirmation && !action.primary && !action.destructive && styles.secondaryText,
                        options && styles.optionText,
                        itemMenu && styles.itemActionText,
                        itemMenu && action.destructive && styles.itemDestructiveText,
                      ]}
                    >
                      {action.label}
                    </Text>
                    {!confirmation && !action.primary && (!action.destructive || itemMenu) && index < actions.length - 1 &&
                      <View pointerEvents="none" style={[styles.actionDivider,
                        !action.icon && { left: 0 }, options && !itemMenu && styles.optionDivider]} />}
                  </HapticPressable>
                ))}
              </View>
            </ScrollView>
          </LayeredCard>
          {!confirmation && !options && <HapticPressable
            onPress={handleCancel}
            haptic={null}
            accessibilityRole="button"
            style={styles.cancelButton}
          >
            <Text maxFontSizeMultiplier={1.4} style={styles.cancelText}>{multiSelect ? 'Done' : cancelLabel}</Text>
          </HapticPressable>}
        </Animated.View>
      </View>
    </PopupLayer>
  );
}

const styles = StyleSheet.create({
  itemSheetContainer: { paddingHorizontal: 12 },
  itemSheetCard: { borderRadius: 28, paddingHorizontal: 24 },
  itemCard: { paddingTop: 8, paddingBottom: 12 },
  itemHandle: { width: 30, height: 3, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 16 },
  itemHeader: { marginBottom: 12, gap: 14, alignItems: 'center' },
  itemHeaderIcon: { width: 22, height: 22, backgroundColor: 'transparent' },
  itemTitle: { ...TYPOGRAPHY.title2, lineHeight: 29, color: COLORS.text },
  itemClose: { backgroundColor: 'transparent' },
  itemActions: { gap: 0, marginBottom: 0 },
  itemButton: { minHeight: 66, paddingVertical: 14, paddingHorizontal: 0, marginTop: 0, justifyContent: 'flex-start', backgroundColor: 'transparent', borderWidth: 0, borderBottomWidth: 0, borderRadius: 0 },
  itemActionIcon: { width: 22, height: 22, minWidth: 22, minHeight: 22, backgroundColor: 'transparent', marginRight: 14 },
  itemActionText: { ...TYPOGRAPHY.headline, lineHeight: 23, color: COLORS.text, flex: 1 },
  itemDestructiveButton: { backgroundColor: 'transparent' },
  itemDestructiveText: { color: COLORS.danger },
  optionsCard: { paddingVertical: SPACING.md },
  optionsActions: { gap: 0, marginBottom: 0 },
  optionButton: { minHeight: 64, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderWidth: 0, borderRadius: 0, backgroundColor: 'transparent' },
  selectedOption: { backgroundColor: COLORS.primaryMuted },
  optionIcon: { width: 22, height: 22, backgroundColor: 'transparent', marginRight: SPACING.md },
  optionText: { ...TYPOGRAPHY.headline, color: COLORS.primary, flex: 1 },
  confirmationCard: { paddingVertical: 20 },
  confirmationHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  confirmationIcon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  confirmationTitle: { ...TYPOGRAPHY.title3, flex: 1, color: COLORS.primary, lineHeight: 27 },
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
  },
  actionDivider: { position: 'absolute', left: 22 + SPACING.md, right: 0, bottom: 0,
    height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border },
  optionDivider: { left: SPACING.md + 22 + SPACING.md, right: SPACING.md },
  actionIcon: {
    marginRight: SPACING.md,
    minWidth: 22,
    minHeight: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    ...TYPOGRAPHY.button,
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
    color: COLORS.white,
    fontFamily: 'DMSans_500Medium',
    fontWeight: '500',
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
    color: COLORS.white,
    fontFamily: 'DMSans_500Medium',
    fontWeight: '500',
  },
  cancelButton: {
    ...CARD_SURFACE,
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
