import React, { useCallback } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import HapticPressable from './HapticPressable';

export default function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search',
  onFocus,
  onBlur,
  autoFocus = false,
  style,
}) {
  const handleClear = useCallback(() => {
    onChangeText?.('');
  }, [onChangeText]);

  return (
    <View style={[styles.container, style]}>
      <Ionicons
        name="search"
        size={17}
        color={COLORS.textMuted}
        style={styles.icon}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {value && value.length > 0 ? (
        <HapticPressable onPress={handleClear} haptic="light" style={styles.clearButton}>
          <Ionicons name="close-circle-sharp" size={18} color={COLORS.textMuted} />
        </HapticPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 36,
  },
  icon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    padding: 0,
    height: '100%',
  },
  clearButton: {
    marginLeft: SPACING.sm,
    padding: 2,
  },
});
