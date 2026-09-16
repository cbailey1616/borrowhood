import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../utils/config';

export default function BackHeader({ navigation, title, fallbackTab = 'Feed', fallbackRoute = 'Main' }) {
  const insets = useSafeAreaInsets();
  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace(fallbackRoute, fallbackRoute === 'Main' ? { screen: fallbackTab } : undefined);
  };

  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        <HapticPressable accessibilityLabel="Back" onPress={goBack} hitSlop={8} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={COLORS.primary} />
        </HapticPressable>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <View accessible={false} style={styles.spacer} />
      </View>
    </View>
  );
}

// Native-stack supplies the latest options, including titles set by a screen.
export function renderBackHeader({ navigation, options, route }) {
  return <BackHeader navigation={navigation} title={options.title ?? route.name} />;
}

const styles = StyleSheet.create({
  header: { backgroundColor: COLORS.background, paddingHorizontal: SPACING.lg },
  row: { minHeight: 60, paddingVertical: SPACING.sm, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  back: { width: 44, height: 44, flexShrink: 0, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  title: { ...TYPOGRAPHY.headline, flex: 1, color: COLORS.primary, textAlign: 'center' },
  spacer: { width: 44, flexShrink: 0 },
});
