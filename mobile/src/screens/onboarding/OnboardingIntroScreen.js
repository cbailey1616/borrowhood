import React, { useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  withSpring,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  useDerivedValue,
} from 'react-native-reanimated';
import { Ionicons } from '../../components/Icon';
import HapticPressable from '../../components/HapticPressable';
import { haptics } from '../../utils/haptics';
import api from '../../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../../utils/config';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Slide Data ──────────────────────────────────────────────────────

const SLIDES = [
  {
    id: 'welcome',
    icon: 'navigate', emoji: '🏹',
    grad: ['#3E8E5A', '#1C5230'],
    title: 'Welcome to\nBorrowhood',
    subtitle: 'Your neighborhood sharing community. Why buy when you can borrow from people you trust?',
  },
  {
    id: 'trust',
    icon: 'people',
    grad: ['#46A06A', '#1C5230'],
    title: 'Build Your\nTrust Circle',
    subtitle: 'Start with close friends, expand to your neighborhood, and connect with your whole town.',
    cards: [
      { icon: 'people', grad: ['#46A06A', '#1C5230'], label: 'Close Friends', description: 'People you know & trust', tintBorder: 'rgba(45,90,39,0.27)' },
      { icon: 'home', grad: ['#E8A23D', '#C0763A'], label: 'Neighborhood', description: 'Neighbors in your city', tintBorder: 'rgba(184,134,11,0.27)' },
      { icon: 'business', grad: ['#5AA9F0', '#2E5FC0'], label: 'Town', description: 'ID-verified members via Stripe', tintBorder: 'rgba(70,130,180,0.27)' },
    ],
  },
  {
    id: 'share',
    icon: 'swap-horizontal',
    grad: ['#E8A23D', '#C0763A'],
    title: 'Share & Request\nAnything',
    subtitle: 'List items you\'re happy to share, or post a request for something you need. Your neighbors might have it.',
    miniCards: true,
  },
  {
    id: 'confidence',
    icon: 'shield-checkmark',
    grad: ['#4ABE7B', '#1E7A48'],
    title: 'Borrow with\nConfidence',
    subtitle: 'Every rental is protected with secure payments, deposits, and built-in dispute resolution.',
    cards: [
      { icon: 'card', grad: ['#46A06A', '#1C5230'], label: 'Secure Payments', description: 'Powered by Stripe', tintBorder: 'rgba(45,90,39,0.27)' },
      { icon: 'shield-checkmark', grad: ['#E8A23D', '#C0763A'], label: 'Deposit Holds', description: 'Released after safe return', tintBorder: 'rgba(184,134,11,0.27)' },
      { icon: 'finger-print', grad: ['#5AA9F0', '#2E5FC0'], label: 'ID Verification', description: 'Town members verified by Stripe Identity', tintBorder: 'rgba(70,130,180,0.27)' },
      { icon: 'chatbubbles', grad: ['#46A06A', '#1C5230'], label: 'Dispute Support', description: 'Fair resolution process', tintBorder: 'rgba(45,90,39,0.27)' },
    ],
  },
];

// ── Hero emblem — gradient disc with a gentle float + scroll-linked scale ──

function HeroEmblem({ slide, index, scrollX }) {
  const float = useSharedValue(0);
  useEffect(() => {
    float.value = withRepeat(
      withDelay(index * 120, withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) })),
      -1,
      true
    );
  }, []);

  const style = useAnimatedStyle(() => {
    const input = [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH];
    // scroll-linked: scale up at center, fall away to the sides
    const scale = interpolate(scrollX.value, input, [0.6, 1, 0.6], Extrapolation.CLAMP);
    // parallax: hero drifts opposite the swipe a touch
    const translateX = interpolate(scrollX.value, input, [40, 0, -40], Extrapolation.CLAMP);
    const floatY = interpolate(float.value, [0, 1], [-5, 5]);
    return { transform: [{ translateX }, { scale }, { translateY: floatY }] };
  });

  return (
    <Animated.View style={[styles.heroWrap, style]}>
      <View style={styles.heroGlow} />
      <LinearGradient
        colors={slide.grad}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.heroDisc}
      >
        <View style={styles.heroGloss} />
        {slide.emoji
          ? <Text style={styles.heroEmoji}>{slide.emoji}</Text>
          : <Ionicons name={slide.icon} size={44} color="#fff" />}
      </LinearGradient>
    </Animated.View>
  );
}

// ── Dot Indicator (scroll-linked width) ─────────────────────────────

function Dot({ index, scrollX }) {
  const style = useAnimatedStyle(() => {
    const input = [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH];
    const w = interpolate(scrollX.value, input, [8, 26, 8], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, input, [0.4, 1, 0.4], Extrapolation.CLAMP);
    return { width: w, opacity };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

// ── Feature / preview cards (unchanged content, theme styling) ──────

// Small gradient tile with a white glyph — shared by feature + preview cards.
function GradientTile({ icon, grad, style }) {
  return (
    <LinearGradient colors={grad} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={style}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '42%', backgroundColor: 'rgba(255,255,255,0.16)' }} />
      <Ionicons name={icon} size={style === styles.miniCardIcon ? 20 : 18} color="#fff" />
    </LinearGradient>
  );
}

function FeatureCard({ icon, grad, label, description, tintBorder }) {
  return (
    <View style={[styles.featureCard, { borderColor: tintBorder }]}>
      <GradientTile icon={icon} grad={grad} style={styles.featureIcon} />
      <View style={styles.featureText}>
        <Text style={styles.featureLabel}>{label}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}

function MiniPreviewCards() {
  return (
    <View style={styles.miniCardsContainer}>
      {/* A listing (kitchen) */}
      <View style={styles.miniCard}>
        <GradientTile icon="restaurant" grad={['#FF8A65', '#D8434E']} style={styles.miniCardIcon} />
        <View style={styles.miniCardText}>
          <Text style={styles.miniCardTitle}>Stand Mixer</Text>
          <Text style={styles.miniCardSubtitle}>Maria K. · 0.2 mi</Text>
        </View>
        <View style={styles.priceBadge}><Text style={styles.priceBadgeText}>$5/day</Text></View>
      </View>
      <View style={styles.orDivider}>
        <View style={styles.orLine} /><Text style={styles.orText}>or</Text><View style={styles.orLine} />
      </View>
      {/* A request (electronics) */}
      <View style={styles.miniCardWanted}>
        <LinearGradient colors={['#C0392B', '#E74C3C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wantedBanner}>
          <View style={styles.wantedBannerLeft}>
            <Ionicons name="megaphone" size={11} color="#fff" /><Text style={styles.wantedBannerLabel}>ISO</Text>
          </View>
          <Text style={styles.wantedBannerDate}>Needed by Mar 10</Text>
        </LinearGradient>
        <View style={styles.wantedContent}>
          <GradientTile icon="tv" grad={['#9B7BE8', '#5B3FB0']} style={styles.miniCardIcon} />
          <View style={styles.miniCardText}>
            <Text style={styles.miniCardTitle}>Need a Projector</Text>
            <Text style={styles.miniCardSubtitle}>Dave R. · 2h ago</Text>
          </View>
        </View>
      </View>
      <Text style={styles.miniTagline}>List what you have, or ask for what you need</Text>
    </View>
  );
}

// ── Slide (scroll-linked fade + rise on the text/cards) ─────────────

function Slide({ item, index, scrollX }) {
  const bodyStyle = useAnimatedStyle(() => {
    const input = [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH];
    const opacity = interpolate(scrollX.value, input, [0, 1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(scrollX.value, input, [28, 0, 28], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateY }] };
  });

  return (
    <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
      <View style={styles.slideContent}>
        <HeroEmblem slide={item} index={index} scrollX={scrollX} />
        <Animated.View style={[styles.slideBody, bodyStyle]}>
          <Text style={styles.slideTitle}>{item.title}</Text>
          <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
          {item.cards && (
            <View style={styles.cardsContainer}>
              {item.cards.map((card, i) => <FeatureCard key={i} {...card} />)}
            </View>
          )}
          {item.miniCards && <MiniPreviewCards />}
        </Animated.View>
      </View>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────

export default function OnboardingIntroScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef(null);
  const scrollX = useSharedValue(0);
  const indexSV = useDerivedValue(() => Math.round(scrollX.value / SCREEN_WIDTH));

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const navigateForward = useCallback(async () => {
    haptics.medium();
    try { await api.updateOnboardingStep(1); } catch (e) {}
    // navigate (not replace) so the next step's back arrow can return here
    navigation.navigate('OnboardingNeighborhood');
  }, [navigation]);

  const handleContinue = useCallback(() => {
    const current = Math.round(scrollX.value / SCREEN_WIDTH);
    if (current < SLIDES.length - 1) {
      haptics.light();
      flatListRef.current?.scrollToIndex({ index: current + 1, animated: true });
    } else {
      navigateForward();
    }
  }, [navigateForward]);

  // CTA label swaps on the last slide
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, [(SLIDES.length - 2) * SCREEN_WIDTH, (SLIDES.length - 1) * SCREEN_WIDTH], [1, 1], Extrapolation.CLAMP),
  }));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={({ item, index }) => <Slide item={item} index={index} scrollX={scrollX} />}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
      />

      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + SPACING.lg }]}>
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => <Dot key={i} index={i} scrollX={scrollX} />)}
        </View>

        <HapticPressable onPress={handleContinue} haptic="medium">
          <LinearGradient
            colors={[COLORS.primary, COLORS.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.continueButton}
          >
            <Animated.Text style={[styles.continueText, ctaStyle]}>Continue</Animated.Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </LinearGradient>
        </HapticPressable>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  slide: { flex: 1, justifyContent: 'center' },
  slideContent: { alignItems: 'center', paddingHorizontal: SPACING.xl + SPACING.sm },
  slideBody: { alignItems: 'center', width: '100%' },

  // Hero emblem
  heroWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xl },
  heroGlow: {
    position: 'absolute', width: 130, height: 130, borderRadius: 65,
    backgroundColor: COLORS.primary, opacity: 0.12,
  },
  heroDisc: {
    width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  heroGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: 40, backgroundColor: 'rgba(255,255,255,0.18)' },
  heroEmoji: { fontSize: 46 },

  slideTitle: {
    fontSize: 30, fontWeight: '700', letterSpacing: -0.8, color: COLORS.text,
    textAlign: 'center', marginBottom: SPACING.md,
  },
  slideSubtitle: {
    fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 21,
    maxWidth: 270, marginBottom: SPACING.xl,
  },

  cardsContainer: { width: '100%', marginTop: SPACING.sm },
  featureCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
    borderRadius: 12, borderWidth: 1.5, padding: 11, paddingHorizontal: 14, marginBottom: 8,
  },
  featureIcon: {
    width: 36, height: 36, borderRadius: 10, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md,
  },
  featureText: { flex: 1 },
  featureLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  featureDescription: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },

  miniCardsContainer: { width: '100%', marginTop: SPACING.sm },
  miniCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
    borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.borderBrown, padding: 10, gap: SPACING.sm,
  },
  miniCardWanted: { borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(192, 57, 43, 0.18)' },
  miniCardIcon: {
    width: 40, height: 40, borderRadius: 10, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  miniCardText: { flex: 1 },
  miniCardTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  miniCardSubtitle: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  priceBadge: {
    backgroundColor: COLORS.primaryMuted, borderWidth: 1, borderColor: COLORS.borderGreen,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  priceBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  wantedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5, paddingHorizontal: 10 },
  wantedBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wantedBannerLabel: { fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 1 },
  wantedBannerDate: { fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  wantedContent: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, padding: 10, gap: SPACING.sm },
  orDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: SPACING.sm, gap: SPACING.sm },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: COLORS.separator },
  orText: { fontSize: 11, color: COLORS.textMuted },
  miniTagline: { fontSize: 12, fontStyle: 'italic', color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.md },

  bottomArea: { paddingHorizontal: SPACING.xl },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg },
  dot: { height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  continueButton: {
    flexDirection: 'row', borderRadius: RADIUS.lg, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  continueText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
