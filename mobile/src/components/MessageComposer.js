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
        keyboardAppearance="dark"
      />
      <View style={styles.actions}>
        {leadingAction}
        <HapticPressable
          haptic="medium"
          accessibilityRole="button"
          accessibilityLabel={sendAccessibilityLabel}
          accessibilityState={{ disabled: unavailable, busy: loading }}
          testID={sendTestID}
          style={styles.sendButton}
          disabled={unavailable}
          onPress={() => { if (!unavailable) onSend?.(); }}
        >
          {loading ? <ActivityIndicator size="small" color={COLORS.surface} />
            : <Ionicons name="send" size={21} color={COLORS.surface} />}
        </HapticPressable>
      </View>
    </View>
  );
});

export default MessageComposer;

const styles = StyleSheet.create({
  container: {
    padding: 6,
    borderWidth: 1,
    borderColor: COLORS.borderGreenStrong,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.surface,
  },
  input: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    minHeight: 48,
    maxHeight: 112,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  sendButton: {
    marginLeft: 'auto',
    width: 48,
    minHeight: 48,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
