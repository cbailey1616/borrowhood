import React, { forwardRef, useEffect, useState, useRef, useImperativeHandle } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import AppTextInput from './AppTextInput';
import HapticPressable from './HapticPressable';
import MessageReactionMenu from './MessageReactionMenu';
import { Ionicons } from './Icon';
import { COLORS, TYPOGRAPHY, CARD_SURFACE } from '../utils/config';
import { DISCUSSION_EMOJIS } from '../utils/discussionThread';

// Each composer owns its selection. Text and drafts belong to the screen.
const DiscussionComposer = forwardRef(function DiscussionComposer({
  value, onChangeText, onSend, inputAccessibilityLabel = 'Comment', sendAccessibilityLabel = 'Post comment',
  editable = true, disabled = false, loading = false, replyTo, onCancel,
  colors = COLORS, dark = false, resetKey, onFocus,
}, ref) {
  const localRef = useRef(null);
  useImperativeHandle(ref, () => localRef.current);
  const [caret, setCaret] = useState({ start: value.length, end: value.length });
  const [selection, setSelection] = useState(undefined);
  const [showEmoji, setShowEmoji] = useState(false);
  const [height, setHeight] = useState(72);
  useEffect(() => { setCaret({start: value.length,end: value.length}); setSelection(undefined); }, [resetKey]);
  useEffect(() => { if (!value) { setCaret({start:0,end:0}); setHeight(72); } }, [value]);
  const insert = (text, start = caret.start, end = caret.end) => {
    if (value.length - (end-start) + text.length > 2000) return;
    onChangeText(value.slice(0,start) + text + value.slice(end));
    const next = {start:start + text.length,end:start + text.length};
    setCaret(next); setSelection(next); localRef.current?.focus();
  };
  const unavailable = disabled || loading || !editable;
  return <View testID="DiscussionComposer.card" style={[styles.card, {backgroundColor: colors.surface, borderColor: colors.border}]}>
    {!!replyTo && <View style={styles.replyHeader}>
      <Text maxFontSizeMultiplier={1.4} style={[styles.replyLabel, {color:colors.textSecondary}]}>Replying to <Text style={{color:colors.primary}}>{replyTo}</Text></Text>
      <HapticPressable haptic={null} scaleDown={1} onPress={onCancel} style={styles.tool} accessibilityLabel="Cancel reply">
        <Ionicons name="close" size={22} color={colors.textMuted} illustrated={false} selected={false}/>
      </HapticPressable>
    </View>}
    <AppTextInput ref={localRef} testID="DiscussionComposer.input" value={value} selection={selection} accessibilityLabel={inputAccessibilityLabel}
      onFocus={() => onFocus?.()}
      onSelectionChange={event => { setCaret(event.nativeEvent.selection); setSelection(undefined); }}
      onChangeText={text => {
        const end = Math.max(0, Math.min(text.length, caret.end + text.length-value.length));
        setCaret({start:end,end}); setSelection(undefined); onChangeText(text);
      }}
      onContentSizeChange={event => setHeight(Math.max(72,Math.min(140,event.nativeEvent.contentSize.height || 72)))}
      style={[styles.input,{height,color:colors.text}]} placeholder={replyTo ? 'Write a reply…' : 'Join the conversation…'}
      placeholderTextColor={colors.textSecondary} maxLength={2000} multiline editable={editable}
      autoCapitalize="sentences" autoCorrect spellCheck showDoneAccessory={false} keyboardAppearance="light" />
    <View testID="DiscussionComposer.toolbar" style={[styles.footer,{borderTopColor:colors.borderLight}]}>
      <HapticPressable haptic={null} scaleDown={1} style={styles.tool} disabled={!editable} accessibilityLabel="Insert emoji" onPress={() => setShowEmoji(true)}>
        <Ionicons name="happy-outline" size={22} color={colors.primary} illustrated={false} selected={false}/>
      </HapticPressable>
      {value.length > 1800 && <Text maxFontSizeMultiplier={1.4} style={[styles.counter,{color:colors.textMuted}]}>{value.length}/2000</Text>}
      <HapticPressable haptic="light" scaleDown={0.97} accessibilityRole="button" accessibilityLabel={sendAccessibilityLabel}
        accessibilityState={{disabled:unavailable,busy:loading}} disabled={unavailable}
        onPress={() => { if (!unavailable) onSend?.(); }}
        style={[styles.post,{backgroundColor:unavailable ? colors.surfaceElevated : colors.primary}]}>
        {loading ? <ActivityIndicator size="small" color={colors.primary}/> : <Text maxFontSizeMultiplier={1.4} style={[styles.postText,{color:unavailable ? colors.textSecondary : colors.background}]}>{replyTo ? 'Reply' : 'Post'}</Text>}
      </HapticPressable>
    </View>
    {showEmoji && <MessageReactionMenu visible options={DISCUSSION_EMOJIS} colors={colors} onClose={() => setShowEmoji(false)}
      onSelect={emoji => { setShowEmoji(false); insert(emoji); }}/>}
  </View>;
});
export default DiscussionComposer;
const styles = StyleSheet.create({
  // The field and toolbar keep their own height inside virtualized list headers.
  card:{ ...CARD_SURFACE,flexShrink:0,borderWidth:1,borderRadius:18,padding:12},
  input:{...TYPOGRAPHY.body,flexShrink:0,minHeight:72,maxHeight:140,textAlignVertical:'top',paddingHorizontal:4,paddingTop:8,paddingBottom:12},
  footer:{flexShrink:0,borderTopWidth:StyleSheet.hairlineWidth,flexDirection:'row',alignItems:'center',paddingTop:5},
  tool:{width:44,minHeight:44,alignItems:'center',justifyContent:'center',opacity:1},
  post:{minHeight:44,minWidth:66,paddingHorizontal:16,marginLeft:'auto',alignItems:'center',justifyContent:'center',borderRadius:11,opacity:1},
  postText:{...TYPOGRAPHY.buttonSmall},counter:{...TYPOGRAPHY.caption1,marginLeft:'auto',marginRight:8},
  replyHeader:{flexDirection:'row',alignItems:'center'},replyLabel:{...TYPOGRAPHY.caption1,flex:1},
});
