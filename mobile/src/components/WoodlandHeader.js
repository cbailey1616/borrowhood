import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import NativeHeader from './NativeHeader';
import WoodlandBackdrop from './WoodlandBackdrop';
import { COLORS, SPACING } from '../utils/config';

const WOODLAND_TITLE_STYLE = {
  fontFamily: 'DMSans_700Bold',
  fontWeight: '700',
  letterSpacing: 0,
};

export default function WoodlandHeader({ titleStyle, titleRowStyle, children, artwork = true, ...props }) {
  return <NativeHeader {...props} backdrop={artwork ? <WoodlandBackdrop /> : null}
    titleStyle={[WOODLAND_TITLE_STYLE, titleStyle]}
    titleRowStyle={[{ marginBottom: children ? 12 : 28 }, titleRowStyle]}>
    {children && artwork ? <View>
      <LinearGradient testID="Woodland.tabs.fade" pointerEvents="none" accessible={false}
        importantForAccessibility="no-hide-descendants"
        colors={[`${COLORS.background}00`, `${COLORS.background}EF`, `${COLORS.background}F5`, `${COLORS.background}00`]}
        locations={[0, 0.3, 0.7, 1]} style={styles.tabFade} />
      {children}
    </View> : children}
  </NativeHeader>;
}

const styles = StyleSheet.create({
  tabFade: { position: 'absolute', top: -SPACING.sm, bottom: -SPACING.sm, left: -SPACING.xl, right: -SPACING.xl },
});
