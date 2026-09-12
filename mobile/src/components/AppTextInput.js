import React, { forwardRef, useCallback, useEffect, useId, useRef, useState } from 'react';
import { InputAccessoryView, Keyboard, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import { COLORS, SPACING, TYPOGRAPHY } from '../utils/config';

const PAD_KEYBOARD_TYPES = new Set(['number-pad', 'decimal-pad', 'phone-pad', 'numeric', 'ascii-capable-number-pad']);
const PAD_INPUT_MODES = new Set(['numeric', 'decimal', 'tel']);
const ACCESSORY_COLORS = { background: COLORS.background, text: COLORS.primary, separator: COLORS.separator };

// Ordinary typing uses the same native keyboard as messages. Number/phone pads
// lack a return key, so keep one compact dismissal control attached to them.
const AppTextInput = forwardRef(function AppTextInput({ autoFocus, onFocus, onBlur, inputAccessoryViewID, showDoneAccessory, keyboardAppearance = 'dark', ...props }, ref) {
  const id = useId();
  const inputRef = useRef(null);
  const didAutoFocus = useRef(false);
  const [accessoryReady, setAccessoryReady] = useState(false);
  const [focused, setFocused] = useState(false);
  const accessoryId = `borrowhood-keyboard-${id}`;
  // React Native gives inputMode precedence over keyboardType.
  const usesPad = props.inputMode != null ? PAD_INPUT_MODES.has(props.inputMode) : PAD_KEYBOARD_TYPES.has(props.keyboardType);
  const showAccessory = (showDoneAccessory ?? usesPad) && Platform.OS === 'ios' && !inputAccessoryViewID;
  // This toolbar belongs to the app surface, not the native keyboard.
  const accessoryColors = ACCESSORY_COLORS;
  const setInputRef = useCallback(node => {
    inputRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  useEffect(() => {
    // Fabric attaches the accessory after the input enters the window. Native
    // autoFocus runs earlier, so wait for the toolbar's native layout first.
    if (showAccessory && autoFocus && accessoryReady && !didAutoFocus.current) {
      didAutoFocus.current = true;
      inputRef.current?.focus();
    }
  }, [showAccessory, autoFocus, accessoryReady]);

  return <>
    <TextInput {...props} ref={setInputRef} keyboardAppearance={keyboardAppearance} autoFocus={showAccessory ? false : autoFocus}
      inputAccessoryViewID={inputAccessoryViewID || (showAccessory ? accessoryId : undefined)}
      onFocus={event => { setFocused(true); onFocus?.(event); }}
      onBlur={event => { setFocused(false); onBlur?.(event); }} />
    {showAccessory && <InputAccessoryView nativeID={accessoryId} backgroundColor={accessoryColors.background}>
      <View style={[styles.toolbar, { backgroundColor: accessoryColors.background, borderTopColor: accessoryColors.separator }]}
        onLayout={() => setAccessoryReady(true)} accessibilityElementsHidden={!focused}
        importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}>
        <HapticPressable accessibilityRole="button" accessibilityLabel="Done, close keyboard"
          onPress={Keyboard.dismiss} style={styles.done} haptic="light">
          <Ionicons name="chevron-down" size={18} color={accessoryColors.text} />
          <Text style={[styles.label, { color: accessoryColors.text }]}>Done</Text>
        </HapticPressable>
      </View>
    </InputAccessoryView>}
  </>;
});

export default AppTextInput;

const styles = StyleSheet.create({
  toolbar: {
    minHeight: 44,
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACING.md,
  },
  done: {
    minHeight: 44, minWidth: 80, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.sm,
  },
  label: { ...TYPOGRAPHY.headline },
});
