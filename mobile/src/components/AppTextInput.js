import React, { forwardRef, useId, useState } from 'react';
import { InputAccessoryView, Keyboard, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import { COLORS, SPACING, TYPOGRAPHY } from '../utils/config';

// The accessory belongs to the native keyboard, so it follows sheets, keyboard
// changes and multiline fields without covering a screen's input or actions.
const AppTextInput = forwardRef(function AppTextInput({ onFocus, onBlur, inputAccessoryViewID, ...props }, ref) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const accessoryId = `borrowhood-keyboard-${id}`;
  const showAccessory = Platform.OS === 'ios' && !inputAccessoryViewID;
  return <>
    <TextInput {...props} ref={ref}
      inputAccessoryViewID={inputAccessoryViewID || (showAccessory ? accessoryId : undefined)}
      onFocus={event => { setFocused(true); onFocus?.(event); }}
      onBlur={event => { setFocused(false); onBlur?.(event); }} />
    {showAccessory && <InputAccessoryView nativeID={accessoryId} backgroundColor={COLORS.card}>
      <View style={styles.toolbar} accessibilityElementsHidden={!focused}
        importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}>
        <HapticPressable accessibilityRole="button" accessibilityLabel="Done, close keyboard"
          onPress={Keyboard.dismiss} style={styles.done} haptic="light">
          <Ionicons name="chevron-down" size={18} color={COLORS.primary} />
          <Text style={styles.label}>Done</Text>
        </HapticPressable>
      </View>
    </InputAccessoryView>}
  </>;
});

export default AppTextInput;

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
    backgroundColor: COLORS.card, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator, paddingHorizontal: SPACING.md,
  },
  done: {
    minHeight: 44, minWidth: 80, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.sm,
  },
  label: { ...TYPOGRAPHY.headline, color: COLORS.primary },
});
