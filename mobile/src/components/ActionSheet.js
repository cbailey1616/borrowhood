import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import { View, Text, Platform, StyleSheet } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { BlurView } from 'expo-blur';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import { haptics } from '../utils/haptics';
import HapticPressable from './HapticPressable';

export default function ActionSheet({
  isVisible,
  onClose,
  title,
  message,
  actions = [],
  cancelLabel = 'Cancel',
}) {
  const bottomSheetRef = useRef(null);

  useEffect(() => {
    if (isVisible) {
      bottomSheetRef.current?.expand();
    } else {
      bottomSheetRef.current?.close();
    }
  }, [isVisible]);

  const handleSheetChange = useCallback(
    (index) => {
      if (index === -1) {
        onClose?.();
      }
    },
    [onClose]
  );

  const handleCancel = useCallback(() => {
    haptics.light();
    bottomSheetRef.current?.close();
  }, []);

  const handleAction = useCallback(
    (action) => {
      if (action.destructive) {
        haptics.warning();
      } else {
        haptics.light();
      }
      bottomSheetRef.current?.close();
      // Delay action to let sheet close animation finish
      setTimeout(() => {
        action.onPress?.();
      }, 200);
    },
    []
  );

  const renderBackdrop = useCallback(
    (props) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.6}
        pressBehavior="close"
      />
    ),
    []
  );

  const snapPoints = useMemo(() => {
    // Calculate based on content: header + actions + cancel + padding
    const headerHeight = title ? 60 : 0;
    const messageHeight = message ? 30 : 0;
    const actionsHeight = actions.length * 56;
    const cancelHeight = 56;
    const paddingHeight = 40;
    return [headerHeight + messageHeight + actionsHeight + cancelHeight + paddingHeight];
  }, [title, message, actions.length]);

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      onChange={handleSheetChange}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
      style={styles.sheet}
    >
      <BottomSheetView style={styles.content}>
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
              style={styles.actionButton}
            >
              {action.icon ? (
                <View style={styles.actionIcon}>{action.icon}</View>
              ) : null}
              <Text
                style={[
                  styles.actionText,
                  action.destructive && styles.destructiveText,
                ]}
              >
                {action.label}
              </Text>
            </HapticPressable>
          ))}
        </View>
        <HapticPressable
          onPress={handleCancel}
          haptic="light"
          style={styles.cancelButton}
        >
          <Text style={styles.cancelText}>{cancelLabel}</Text>
        </HapticPressable>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    zIndex: 999,
  },
  sheetBg: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
  },
  handle: {
    backgroundColor: COLORS.gray[600],
    width: 36,
    height: 5,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
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
  destructiveText: {
    color: COLORS.danger,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    marginTop: SPACING.sm,
  },
  cancelText: {
    ...TYPOGRAPHY.headline,
    color: COLORS.primary,
  },
});
