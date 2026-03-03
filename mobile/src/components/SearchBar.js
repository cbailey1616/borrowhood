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
  onSubmitEditing,
  autoFocus = false,
  style,
  dark = false,
  testID,
  accessibilityLabel,
}) {
  const handleClear = useCallback(() => {
    onChangeText?.('');
  }, [onChangeText]);

  const iconColor = dark ? 'rgba(255,255,255,0.5)' : COLORS.textMuted;
  const inputColor = dark ? '#fff' : COLORS.text;
  const placeholderColor = dark ? 'rgba(255,255,255,0.5)' : COLORS.textMuted;

  return (
    <View style={[styles.container, style]} testID={testID} accessibilityLabel={accessibilityLabel || placeholder} accessibilityRole="search">
      <Ionicons
        name="search"
        size={17}
        color={iconColor}
        style={styles.icon}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderColor}
        style={[styles.input, { color: inputColor }]}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onFocus={onFocus}
        onBlur={onBlur}
        onSubmitEditing={onSubmitEditing}
      />
      {value && value.length > 0 ? (
        <HapticPressable onPress={handleClear} haptic="light" style={styles.clearButton}>
          <Ionicons name="close-circle-sharp" size={18} color={iconColor} />
        </HapticPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 36,
    borderWidth: 1,
    borderColor: COLORS.borderBrownStrong,
  },
  icon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    ...TYPOGRAPHY.body,
    padding: 0,
    height: '100%',
  },
  clearButton: {
    marginLeft: SPACING.sm,
    padding: 2,
  },
});
