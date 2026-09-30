import React, { useEffect, useRef } from 'react';
import { Modal, View, Pressable, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmojiReactionPicker from './EmojiReactionPicker';

// Window coordinates belong in a modal. A nested thread/header must not clip
// the toolbar or subtract its own layout offset from the long-press position.
export default function MessageReactionMenu({ visible, position, onClose, onSelect, onMore }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pendingMore = useRef(null);
  const finishDismissal = () => { const action = pendingMore.current; pendingMore.current = null; action?.(); };
  useEffect(() => { if (!visible && Platform.OS !== 'ios') finishDismissal(); }, [visible]);
  useEffect(() => () => { pendingMore.current = null; }, []);
  const close = () => { pendingMore.current = null; onClose(); };
  const more = () => { pendingMore.current = onMore; onClose(); };
  const top = Math.max(insets.top + 12, Math.min((position?.y ?? height * .4) - 64, height - insets.bottom - 80));
  return <Modal visible={!!visible} transparent animationType="fade" onRequestClose={close} onDismiss={finishDismissal}>
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close reactions" />
      <EmojiReactionPicker onSelect={onSelect} onMore={more}
        style={{ top, left: (width - Math.min(340, width - 32)) / 2 }} />
    </View>
  </Modal>;
}
