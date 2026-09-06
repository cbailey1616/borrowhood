import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../utils/config';

// One visible dismissal control, with our own sizing and parchment treatment.
// A custom header also avoids a second native glass capsule around the button.
export function ModalHeader({ title }) {
  const insets = useSafeAreaInsets();
  return (
    <View testID="Modal.header" style={[styles.header, { paddingTop: Platform.OS === 'ios' ? SPACING.sm : insets.top + SPACING.sm }]}>
      <View style={styles.headerRow}>
        <View testID="Modal.headerSpacer" accessible={false} style={styles.spacer} />
        <ModalTitle title={title} />
        <ModalCloseButton />
      </View>
    </View>
  );
}

export function ModalTitle({ title }) {
  return (
    <View style={styles.titleGroup}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    </View>
  );
}

export function ModalCloseButton() {
  const navigation = useNavigation();
  return (
    <HapticPressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      onPress={() => navigation.goBack()}
      style={styles.closeButton}
    >
      <Ionicons name="close" size={21} color={COLORS.primary} />
    </HapticPressable>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: COLORS.background, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: SPACING.sm },
  spacer: { width: 44, height: 44, flexShrink: 0 },
  titleGroup: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.xs },
  title: { ...TYPOGRAPHY.headline, textAlign: 'center', color: COLORS.primary },
  closeButton: {
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
