import React, { useEffect, useRef } from 'react';
import { Keyboard, Modal, Platform, StyleSheet } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// iOS native-stack screens and native sheets can cover a root-level Modal.
// Mount popups directly in the app window; remove the entire touch layer on close.
export default function PopupLayer({ visible, onDismiss, onRequestClose, children }) {
  const previouslyVisible = useRef(false);
  const dismissCallback = useRef(onDismiss);
  dismissCallback.current = onDismiss;
  useEffect(() => {
    if (visible) Keyboard.dismiss();
    const closed = previouslyVisible.current && !visible;
    previouslyVisible.current = visible;
    if (closed && Platform.OS === 'ios') dismissCallback.current?.();
  }, [visible]);
  if (Platform.OS === 'ios') {
    if (!visible) return null;
    return <FullWindowOverlay unstable_accessibilityContainerViewIsModal>
      <GestureHandlerRootView style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        {children}
      </GestureHandlerRootView>
    </FullWindowOverlay>;
  }
  return <Modal visible={visible} transparent animationType="none" statusBarTranslucent
    onDismiss={onDismiss} onRequestClose={onRequestClose}>{children}</Modal>;
}
