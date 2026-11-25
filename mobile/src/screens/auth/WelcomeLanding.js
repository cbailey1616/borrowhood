import { Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import HapticPressable from '../../components/HapticPressable';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../utils/config';

export default function WelcomeLanding({
  navigation, disabled, reservedBottom, socialButtons, biometricButton, terms,
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const photoHeight = Math.min(328, Math.max(120, height * 0.32));

  return (
    <SafeAreaView style={styles.page} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.column, { paddingTop: Math.max(0, reservedBottom - insets.top) }]}>
          <View style={styles.header}>
            <View style={styles.brand}>
              <Image source={require('../../../assets/logo.png')} accessible={false} style={styles.hat} />
              <Text style={styles.wordmark} numberOfLines={1} adjustsFontSizeToFit>Borrowhood</Text>
            </View>
            <HapticPressable onPress={() => navigation.navigate('Login')} disabled={disabled}
              testID="Welcome.button.openSignIn" accessibilityRole="button" accessibilityLabel="Sign in"
              style={styles.signIn} pressedBackgroundColor={COLORS.primaryMuted}>
              <Text style={styles.signInText}>Sign in</Text>
            </HapticPressable>
          </View>

          <Image source={require('../../../assets/brand/porch-toolbox.jpg')} accessible={false}
            resizeMode="cover" style={[styles.photo, { height: photoHeight }]} />

          <View style={styles.body}>
            <Text accessibilityRole="header" style={styles.title}>Borrow from people nearby.</Text>
            <HapticPressable onPress={() => navigation.navigate('Register')} disabled={disabled}
              testID="Welcome.link.createAccount" accessibilityRole="button" accessibilityLabel="Create an account"
              scaleDown={0.98} style={styles.create}>
              <Text style={styles.createText}>Create an account</Text>
            </HapticPressable>
            <View style={styles.divider} accessible={false}>
              <View style={styles.rule} /><Text style={styles.or}>or</Text><View style={styles.rule} />
            </View>
            {socialButtons}
            {biometricButton}
            <View style={styles.legal}>{terms}</View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.surface },
  scroll: { flexGrow: 1, alignItems: 'center' },
  column: { width: '100%', maxWidth: 640 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm, columnGap: SPACING.md,
  },
  brand: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: SPACING.sm, minHeight: 44 },
  hat: { width: 32, height: 32, resizeMode: 'contain' },
  wordmark: { ...TYPOGRAPHY.title2, fontFamily: 'Fraunces_600SemiBold', color: COLORS.primaryDark, flexShrink: 1 },
  signIn: { minHeight: 44, minWidth: 52, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm },
  signInText: { ...TYPOGRAPHY.button, color: COLORS.primary },
  photo: { width: '100%', backgroundColor: COLORS.primaryMuted },
  body: { width: '100%', maxWidth: 488, alignSelf: 'center', padding: SPACING.xl },
  title: { ...TYPOGRAPHY.displayTitle, color: COLORS.primaryDark, maxWidth: 360, marginBottom: SPACING.xl },
  create: {
    minHeight: 54, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  createText: { ...TYPOGRAPHY.headline, color: COLORS.surface, textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginVertical: SPACING.md },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, flex: 1 },
  or: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary },
  legal: { marginTop: SPACING.sm },
});
