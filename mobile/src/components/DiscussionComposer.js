import React, { forwardRef, useEffect, useState, useRef, useImperativeHandle } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import AppTextInput from './AppTextInput';
import HapticPressable from './HapticPressable';
import MessageReactionMenu from './MessageReactionMenu';
import { Ionicons } from './Icon';
import { COLORS, TYPOGRAPHY } from '../utils/config';
import { DISCUSSION_EMOJIS } from '../utils/discussionThread';

// Each composer owns its selection and suggestions. Text/drafts belong to the screen.
const DiscussionComposer = forwardRef(function DiscussionComposer({
  value, onChangeText, onSend, inputAccessibilityLabel = 'Comment', sendAccessibilityLabel = 'Post comment',
  editable = true, disabled = false, loading = false, mentions = [], replyTo, onCancel,
  colors = COLORS, dark = false, resetKey,
}, ref) {
  const localRef = useRef(null);
  useImperativeHandle(ref, () => localRef.current);
  const [caret, setCaret] = useState({ start: value.length, end: value.length });
  const [selection, setSelection] = useState(undefined);
  const [showEmoji, setShowEmoji] = useState(false);
  const [focused, setFocused] = useState(false);
  const [height, setHeight] = useState(72);
  useEffect(() => { setCaret({start: value.length,end: value.length}); setSelection(undefined); }, [resetKey]);
  useEffect(() => { if (!value) { setCaret({start:0,end:0}); setHeight(72); } }, [value]);
  const before = value.slice(0, caret.end);
  const match = caret.start === caret.end ? before.match(/(^|\s)@([a-zA-Z0-9_]*)$/) : null;
  const choices = focused && match ? mentions.filter(person => person.handle.toLowerCase().startsWith(match[2].toLowerCase()) || person.name.toLowerCase().includes(match[2].toLowerCase())).slice(0,6) : [];
  const insert = (text, start = caret.start, end = caret.end) => {
    if (value.length - (end-start) + text.length > 2000) return;
    onChangeText(value.slice(0,start) + text + value.slice(end));
    const next = {start:start + text.length,end:start + text.length};
    setCaret(next); setSelection(next); localRef.current?.focus();
  };
  const unavailable = disabled || loading || !editable;
  return <View style={[styles.card, {backgroundColor: colors.surface, borderColor: colors.borderLight}]}>
    {!!replyTo && <View style={styles.replyHeader}>
      <Text style={[styles.replyLabel, {color:colors.textMuted}]}>Replying to <Text style={{color:colors.primary}}>{replyTo}</Text></Text>
      <HapticPressable onPress={onCancel} style={styles.tool} accessibilityLabel="Cancel reply">
        <Ionicons name="close" size={18} color={colors.textMuted}/>
      </HapticPressable>
    </View>}
    {!!choices.length && <View style={[styles.suggestions, {backgroundColor: colors.surfaceElevated}]} accessibilityLabel="Mention suggestions">
      {choices.map(person => <HapticPressable key={person.id} style={styles.mentionChoice}
        accessibilityLabel={`Mention ${person.name}`} onPress={() => insert(`@${person.handle} `, caret.end-match[2].length-1,caret.end)}>
        <Text style={[styles.mentionName,{color:colors.text}]}>{person.name}</Text>
        <Text style={[styles.handle,{color:colors.textMuted}]}>@{person.handle}</Text>
      </HapticPressable>)}
    </View>}
    <AppTextInput ref={localRef} value={value} selection={selection} accessibilityLabel={inputAccessibilityLabel}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onSelectionChange={event => { setCaret(event.nativeEvent.selection); setSelection(undefined); }}
      onChangeText={text => {
        const end = Math.max(0, Math.min(text.length, caret.end + text.length-value.length));
        setCaret({start:end,end}); setSelection(undefined); onChangeText(text);
      }}
      onContentSizeChange={event => setHeight(Math.max(72,Math.min(140,event.nativeEvent.contentSize.height || 72)))}
      style={[styles.input,{height,color:colors.text}]} placeholder={replyTo ? 'Write a reply…' : 'Join the conversation…'}
      placeholderTextColor={colors.textMuted} maxLength={2000} multiline editable={editable}
      autoCapitalize="sentences" autoCorrect spellCheck showDoneAccessory={false} keyboardAppearance={dark ? 'dark' : 'light'} />
    <View style={[styles.footer,{borderTopColor:colors.borderLight}]}>
      <HapticPressable style={styles.tool} disabled={!editable} accessibilityLabel="Insert emoji" onPress={() => setShowEmoji(true)}>
        <Ionicons name="happy-outline" size={21} color={colors.primary}/>
      </HapticPressable>
      <HapticPressable style={styles.tool} disabled={!editable} accessibilityLabel="Mention a neighbor" onPress={() => {
        setFocused(true); insert((before && !/\s$/.test(before) ? ' ' : '') + '@');
      }}><Text style={[styles.at,{color:colors.primary}]}>@</Text></HapticPressable>
      {value.length > 1800 && <Text style={[styles.counter,{color:colors.textMuted}]}>{value.length}/2000</Text>}
      <HapticPressable accessibilityRole="button" accessibilityLabel={sendAccessibilityLabel}
        accessibilityState={{disabled:unavailable,busy:loading}} disabled={unavailable}
        onPress={() => { if (!unavailable) onSend?.(); }}
        style={[styles.post,{backgroundColor:unavailable ? colors.surfaceElevated : colors.primary}]}>
        {loading ? <ActivityIndicator size="small" color={colors.primary}/> : <Text style={[styles.postText,{color:unavailable ? colors.textMuted : colors.background}]}>{replyTo ? 'Reply' : 'Post'}</Text>}
      </HapticPressable>
    </View>
    {showEmoji && <MessageReactionMenu visible options={DISCUSSION_EMOJIS} colors={colors} onClose={() => setShowEmoji(false)}
      onSelect={emoji => { setShowEmoji(false); insert(emoji); }}/>}
  </View>;
});
export default DiscussionComposer;
const styles = StyleSheet.create({
  card:{borderWidth:StyleSheet.hairlineWidth,borderRadius:18,padding:12},
  input:{...TYPOGRAPHY.body,fontSize:16,minHeight:72,maxHeight:140,textAlignVertical:'top',paddingHorizontal:4,paddingTop:8,paddingBottom:12},
  footer:{borderTopWidth:StyleSheet.hairlineWidth,flexDirection:'row',alignItems:'center',paddingTop:5},
  tool:{width:44,minHeight:44,alignItems:'center',justifyContent:'center'},
  at:{...TYPOGRAPHY.body,fontSize:21},
  post:{minHeight:40,minWidth:66,paddingHorizontal:16,marginLeft:'auto',alignItems:'center',justifyContent:'center',borderRadius:11},
  postText:{...TYPOGRAPHY.subheadline,fontWeight:'600'},counter:{...TYPOGRAPHY.caption1,marginLeft:'auto',marginRight:8},
  replyHeader:{flexDirection:'row',alignItems:'center'},replyLabel:{...TYPOGRAPHY.caption1,flex:1},
  suggestions:{borderRadius:12,padding:4},mentionChoice:{minHeight:44,paddingHorizontal:9,paddingVertical:7},
  mentionName:{...TYPOGRAPHY.footnote},handle:{...TYPOGRAPHY.caption1},
});
