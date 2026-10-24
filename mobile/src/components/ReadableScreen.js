import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS } from '../utils/config';

// Backgrounds fill the current window. Forms and long lists keep a comfortable
// reading width without changing screen identity or discarding drafts on resize.
export function withReadableLayout(Screen, maxWidth = 760) {
  function ReadableScreen(props) {
    return <View style={styles.window}>
      <View testID="Screen.readableContent" style={[styles.content, { maxWidth }]}>
        <Screen {...props} />
      </View>
    </View>;
  }
  ReadableScreen.displayName = `Readable(${Screen.displayName || Screen.name || 'Screen'})`;
  return ReadableScreen;
}

const styles = StyleSheet.create({
  window: { flex: 1, minWidth: 0, minHeight: 0, backgroundColor: COLORS.background },
  content: { flex: 1, minWidth: 0, minHeight: 0, width: '100%', alignSelf: 'center' },
});
