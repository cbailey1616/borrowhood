import { View, Text, Image, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HapticPressable from './HapticPressable';
import WoodlandBackdrop from './WoodlandBackdrop';
import WoodlandIllustration from './WoodlandIllustration';
import Icon from './Icon';
import { COLORS, RADIUS, TYPOGRAPHY, CARD_SURFACE } from '../utils/config';

// Town, neighborhood, then optional verification. Keep actions reachable when
// the keyboard or larger accessibility text leaves less vertical space.
export default function OnboardingLayout({
  step, title, description, scene, tone = COLORS.primaryMuted, compact = false,
  children, buttonLabel, onContinue, busy = false, disabled = false,
  error, note, secondaryActions, keyboardAvoiding = false, primaryAction,
  onBack, backDisabled = false,
}) {
  const insets = useSafeAreaInsets();
  const { height, fontScale } = useWindowDimensions();
  const inlineActions = height < 600 || fontScale >= 1.4;
  const unavailable = busy || disabled;
  const actions = <View style={[styles.footer, inlineActions && { paddingHorizontal: 0 }, { paddingBottom: Math.max(insets.bottom, 16) }]}>
    <View style={styles.footerInner}>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {primaryAction || (buttonLabel && <HapticPressable scaleDown={0.97} accessibilityRole="button" accessibilityLabel={buttonLabel}
        accessibilityState={{ disabled: unavailable, busy }} disabled={unavailable}
        onPress={onContinue} style={styles.button}>
        {busy ? <ActivityIndicator color={COLORS.surface} /> : <>
          <Text maxFontSizeMultiplier={1.4} style={styles.buttonText}>{buttonLabel}</Text>
          <Icon name="arrow-forward" size={20} color={COLORS.surface} />
        </>}
      </HapticPressable>)}
      {secondaryActions}
      {!!note && <Text style={styles.note}>{note}</Text>}
    </View>
  </View>;
  return (
    <KeyboardAvoidingView style={styles.page} enabled={keyboardAvoiding}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <WoodlandBackdrop fullScreen />
      <ScrollView key={step} style={styles.scroll} keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
        <View style={styles.sheet}>
          <View style={styles.brandRow}>
            <View style={styles.brand}>
              <Image source={require('../../assets/logo.png')} style={styles.logo} accessible={false} />
              <Text style={styles.wordmark}>Borrowhood</Text>
            </View>
            {onBack && <HapticPressable accessibilityRole="button" accessibilityLabel="Back"
              disabled={backDisabled || busy} accessibilityState={{ disabled: backDisabled || busy }}
              onPress={onBack} style={styles.backButton}>
              <Icon name="chevron-back" size={22} color={COLORS.primary} />
            </HapticPressable>}
          </View>
          <View style={styles.progress} accessible accessibilityRole="progressbar"
            accessibilityLabel="Getting started" accessibilityValue={{ min: 0, max: 3, now: step, text: 'Step ' + step + ' of 3' }}>
            {[1, 2, 3].map(value => <View key={value}
              style={[styles.segment, value <= step && styles.segmentFilled]} />)}
          </View>
          <View style={[styles.hero, compact && styles.compactHero]}>
            <View style={[styles.scene, compact && styles.compactScene]}
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <WoodlandIllustration scene={scene} width={compact ? 180 : 216} />
            </View>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>
          </View>
          {children}
        </View>
        {inlineActions && actions}
      </ScrollView>
      {!inlineActions && actions}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24, alignItems: 'center' },
  sheet: { ...CARD_SURFACE, width: '100%', maxWidth: 520, backgroundColor: COLORS.surface, borderRadius: 24, padding: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 },
  logo: { width: 32, height: 32, resizeMode: 'contain' },
  wordmark: { ...TYPOGRAPHY.title3, fontFamily: 'Fraunces_600SemiBold', fontWeight: '600', color: COLORS.primary, flexShrink: 1 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.full, backgroundColor: COLORS.surface },
  progress: { flexDirection: 'row', gap: 7, marginTop: 18 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  segmentFilled: { backgroundColor: COLORS.primary },
  hero: { alignItems: 'flex-start', paddingTop: 22, paddingBottom: 22, gap: 12 },
  compactHero: { paddingTop: 18, paddingBottom: 18 },
  scene: { width: '100%', alignItems: 'flex-start', paddingVertical: 8 },
  compactScene: { paddingVertical: 4 },
  title: { ...TYPOGRAPHY.largeTitle, lineHeight: 38, color: COLORS.primaryDark, textAlign: 'left' },
  description: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, textAlign: 'left', maxWidth: 420 },
  footer: { width: '100%', backgroundColor: COLORS.background, paddingHorizontal: 24, paddingTop: 14 },
  footerInner: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  button: { minHeight: 54, paddingHorizontal: 20, paddingVertical: 15, borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  buttonText: { ...TYPOGRAPHY.headline, color: COLORS.surface, textAlign: 'center', flexShrink: 1 },
  note: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, textAlign: 'center', marginTop: 10 },
  error: { ...TYPOGRAPHY.bodySmall, color: COLORS.danger, marginBottom: 12 },
});
