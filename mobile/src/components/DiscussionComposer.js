import React, { forwardRef, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import AppTextInput from './AppTextInput';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import { COLORS, TYPOGRAPHY } from '../utils/config';

const DiscussionComposer = forwardRef(function DiscussionComposer({
  value, onChangeText, onSend, inputAccessibilityLabel = 'Comment', sendAccessibilityLabel = 'Post comment',
  editable = true, disabled = false, loading = false, replyTo, quote, onCancel, colors = COLORS, onFocus,
}, ref) {
  const [height, setHeight] = useState(44);
  useEffect(() => { if (!value) setHeight(44); }, [value]);
  const unavailable = disabled || loading || !editable;

  return <View>
    {!!replyTo && <View style={styles.replyHeader}>
      <View style={[styles.quote, { borderLeftColor: colors.primaryLight }]}>
        <Text style={[styles.replyLabel, { color: colors.primary }]}>Replying to {replyTo}</Text>
        {!!quote && <Text style={[styles.excerpt, { color: colors.textSecondary }]} numberOfLines={1}>“{quote}”</Text>}
      </View>
      {!!onCancel && <HapticPressable onPress={onCancel} style={styles.button} accessibilityLabel="Cancel reply">
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </HapticPressable>}
    </View>}
    <View testID="DiscussionComposer.card" style={[styles.field, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <AppTextInput ref={ref} testID="DiscussionComposer.input" value={value} onChangeText={onChangeText} onFocus={onFocus}
        accessibilityLabel={inputAccessibilityLabel} style={[styles.input, { height, color: colors.text }]}
        onContentSizeChange={event => setHeight(Math.min(140, Math.max(44, Math.ceil(event.nativeEvent.contentSize.height || 44))))}
        placeholder={replyTo ? 'Write a reply…' : 'Add a public comment…'} placeholderTextColor={colors.textSecondary}
        maxLength={2000} multiline editable={editable} autoCapitalize="sentences" autoCorrect spellCheck />
      <HapticPressable haptic="light" accessibilityLabel={sendAccessibilityLabel}
        accessibilityState={{ disabled: unavailable, busy: loading }} disabled={unavailable}
        onPress={() => { if (!unavailable) onSend(); }} style={styles.button}>
        {loading ? <ActivityIndicator size="small" color={colors.primary} /> :
          <Ionicons name="send-outline" size={21} color={unavailable ? colors.textSecondary : colors.primaryDark} illustrated={false} />}
      </HapticPressable>
    </View>
    {value.length > 1800 && <Text style={[styles.counter, { color: colors.textSecondary }]}>{value.length}/2000</Text>}
  </View>;
});
export default DiscussionComposer;

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'flex-end', borderRadius: 14, borderWidth: 1 },
  input: { ...TYPOGRAPHY.body, flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'center' },
  button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: 1 },
  replyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  quote: { flex: 1, borderLeftWidth: 2, paddingLeft: 10, paddingVertical: 2 },
  replyLabel: { ...TYPOGRAPHY.buttonCaption }, excerpt: { ...TYPOGRAPHY.caption1 },
  counter: { ...TYPOGRAPHY.caption1, textAlign: 'right', marginTop: 4 },
});
