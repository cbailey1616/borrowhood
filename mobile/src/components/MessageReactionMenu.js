import React, { useEffect, useRef } from 'react';
import { Modal, View, Pressable, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmojiReactionPicker from './EmojiReactionPicker';
import { reactionPickerHeight } from '../utils/reactions';

// Window coordinates belong in a modal. A nested thread/header must not clip
// the toolbar or subtract its own layout offset from the long-press position.
export default function MessageReactionMenu({ visible, position, onClose, onSelect, onMore, options, colors }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pendingMore = useRef(null);
  const finishDismissal = () => { const action = pendingMore.current; pendingMore.current = null; action?.(); };
  useEffect(() => { if (!visible && Platform.OS !== 'ios') finishDismissal(); }, [visible]);
  useEffect(() => () => { pendingMore.current = null; }, []);
  const close = () => { pendingMore.current = null; onClose(); };
  const more = () => { pendingMore.current = onMore; onClose(); };
  const pickerHeight = reactionPickerHeight(options?.length, !!onMore);
  const top = Math.max(insets.top + 12, Math.min((position?.y ?? height * .4) - pickerHeight, height - insets.bottom - pickerHeight - 16));
  return <Modal visible={!!visible} transparent animationType="fade" onRequestClose={close} onDismiss={finishDismissal}>
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close reactions" />
      <EmojiReactionPicker options={options} colors={colors} onSelect={onSelect} onMore={onMore ? more : undefined}
        style={{ top, left: (width - Math.min(340, width - 32)) / 2 }} />
    </View>
  </Modal>;
}
