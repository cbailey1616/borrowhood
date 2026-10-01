import React, { forwardRef } from 'react';
import { TextInput } from 'react-native';

// Use the native keyboard without adding a toolbar. Form scroll views handle
// outside taps and drag-to-dismiss while preserving buttons and input focus.
const AppTextInput = forwardRef(function AppTextInput({
  showDoneAccessory, // Retained for existing callers; never forwarded to native.
  keyboardAppearance = 'light',
  maxFontSizeMultiplier = 1.4,
  ...props
}, ref) {
  return <TextInput {...props} ref={ref} keyboardAppearance={keyboardAppearance} maxFontSizeMultiplier={maxFontSizeMultiplier} />;
});

export default AppTextInput;
