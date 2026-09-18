import React, { forwardRef, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import AppTextInput from './AppTextInput';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../utils/config';

// Message and thread composers share one keyboard and send-control layout.
const MessageComposer = forwardRef(function MessageComposer({
  value, onChangeText, onSend, placeholder = 'Write a message…',
  inputAccessibilityLabel = 'Message', sendAccessibilityLabel = 'Send message',
  inputTestID, sendTestID, testID, maxLength = 2000, editable = true,
  disabled = false, loading = false, leadingAction, style, resetKey,
}, ref) {
  const [inputHeight, setInputHeight] = useState(48);
  useEffect(() => { setInputHeight(48); }, [resetKey]);
  useEffect(() => { if (!value) setInputHeight(48); }, [value]);
  const unavailable = disabled || loading;

  return (
    <View testID={testID} style={[styles.container, style]}>
      {leadingAction}
      <AppTextInput
        ref={ref}
        style={[styles.input, { height: inputHeight }]}
        value={value}
        onChangeText={onChangeText}
        onContentSizeChange={event => {
          const height = event.nativeEvent.contentSize.height;
          if (Number.isFinite(height)) setInputHeight(Math.max(48, Math.min(112, Math.ceil(height))));
        }}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        accessibilityLabel={inputAccessibilityLabel}
        testID={inputTestID}
        multiline
        maxLength={maxLength}
        editable={editable}
        autoCapitalize="sentences"
        autoCorrect
        spellCheck
        showDoneAccessory={false}
        keyboardAppearance="light"
      />
      <HapticPressable
        haptic="medium"
        accessibilityRole="button"
        accessibilityLabel={sendAccessibilityLabel}
        accessibilityState={{ disabled: unavailable, busy: loading }}
        testID={sendTestID}
        style={[styles.sendButton, unavailable && styles.sendUnavailable]}
        disabled={unavailable}
        onPress={() => { if (!unavailable) onSend?.(); }}
      >
        {loading ? <ActivityIndicator size="small" color={COLORS.spinner} />
          : <Ionicons name="arrow-up" size={23} color={unavailable ? COLORS.textMuted : COLORS.surface} />}
      </HapticPressable>
    </View>
  );
});

export default MessageComposer;

const styles = StyleSheet.create({
  container: {
    padding: 4,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.separator,
    borderRadius: 28,
    backgroundColor: COLORS.surface,
  },
  input: {
    ...TYPOGRAPHY.body,
    flex: 1,
    minWidth: 0,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
    minHeight: 48,
    maxHeight: 112,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 44,
    height: 44,
    marginBottom: 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendUnavailable: { backgroundColor: COLORS.surfaceElevated, opacity: 1 },
});
