import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
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
    emoji: '🏹',
    title: 'Welcome to\nBorrowhood',
    subtitle: 'Your neighborhood sharing community. Why buy when you can borrow from people you trust?',
  },
  {
    id: 'trust',
    icon: 'people-outline',
    title: 'Build Your\nTrust Circle',
    subtitle: 'Start with close friends, expand to your neighborhood, and connect with your whole town.',
    cards: [
      {
        emoji: '🤝',
        label: 'Close Friends',
        description: 'People you know & trust',
        tintBg: 'rgba(45,90,39,0.09)',
        tintBorder: 'rgba(45,90,39,0.27)',
      },
      {
        emoji: '🏘️',
        label: 'Neighborhood',
        description: 'Neighbors in your city',
        tintBg: 'rgba(184,134,11,0.09)',
        tintBorder: 'rgba(184,134,11,0.27)',
      },
      {
        emoji: '🏛️',
        label: 'Town',
        description: 'ID-verified members via Stripe',
        tintBg: 'rgba(70,130,180,0.09)',
        tintBorder: 'rgba(70,130,180,0.27)',
      },
    ],
  },
  {
    id: 'share',
    icon: 'construct-outline',
    title: 'Share & Request\nAnything',
    subtitle: 'List items you\'re happy to lend, or post a request for something you need. Your neighbors might have it.',
    miniCards: true,
  },
  {
    id: 'confidence',
    icon: 'shield-checkmark-outline',
    title: 'Borrow with\nConfidence',
    subtitle: 'Every rental is protected with secure payments, deposits, and built-in dispute resolution.',
    cards: [
      {
        emoji: '💳',
        label: 'Secure Payments',
        description: 'Powered by Stripe',
        tintBg: 'rgba(45,90,39,0.09)',
        tintBorder: 'rgba(45,90,39,0.27)',
      },
      {
        emoji: '🛡️',
        label: 'Deposit Holds',
        description: 'Released after safe return',
        tintBg: 'rgba(184,134,11,0.09)',
        tintBorder: 'rgba(184,134,11,0.27)',
      },
      {
        emoji: '🪪',
        label: 'ID Verification',
        description: 'Town members verified by Stripe Identity',
        tintBg: 'rgba(70,130,180,0.09)',
        tintBorder: 'rgba(70,130,180,0.27)',
      },
      {
        emoji: '⚖️',
        label: 'Dispute Support',
        description: 'Fair resolution process',
        tintBg: 'rgba(45,90,39,0.09)',
        tintBorder: 'rgba(45,90,39,0.27)',
      },
    ],
  },
];

// ── Dot Indicator ───────────────────────────────────────────────────

function Dot({ index, currentIndex }) {
  const width = useSharedValue(index === currentIndex ? 24 : 8);

  useEffect(() => {
    width.value = withSpring(
      index === currentIndex ? 24 : 8,
      ANIMATION.spring.default
    );
  }, [currentIndex]);

  const animStyle = useAnimatedStyle(() => ({
    width: width.value,
    backgroundColor: index === currentIndex ? COLORS.accent : COLORS.surfaceElevated,
    borderColor: index === currentIndex ? COLORS.accent : COLORS.border,
  }));

  return <Animated.View style={[styles.dot, animStyle]} />;
}

// ── Feature Card ────────────────────────────────────────────────────

function FeatureCard({ emoji, label, description, tintBg, tintBorder }) {
  return (
    <View style={[styles.featureCard, { borderColor: tintBorder }]}>
      <View style={[styles.featureIcon, { backgroundColor: tintBg, borderColor: tintBorder }]}>
        <Text style={styles.featureEmoji}>{emoji}</Text>
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureLabel}>{label}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}

// ── Mini Preview Cards (Slide 3) ────────────────────────────────────

function MiniPreviewCards() {
  return (
    <View style={styles.miniCardsContainer}>
      {/* Available listing */}
      <View style={styles.miniCard}>
        <View style={styles.miniCardIcon}>
          <Text style={{ fontSize: 20 }}>🔧</Text>
        </View>
        <View style={styles.miniCardText}>
          <Text style={styles.miniCardTitle}>DeWalt Drill</Text>
          <Text style={styles.miniCardSubtitle}>Matt K. · 0.2 mi</Text>
        </View>
        <View style={styles.priceBadge}>
          <Text style={styles.priceBadgeText}>$5/day</Text>
        </View>
      </View>

      {/* Divider with "or" */}
      <View style={styles.orDivider}>
        <View style={styles.orLine} />
        <Text style={styles.orText}>or</Text>
        <View style={styles.orLine} />
      </View>

      {/* Wanted card — banner style matching feed */}
      <View style={styles.miniCardWanted}>
        <LinearGradient
          colors={['#C0392B', '#E74C3C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.wantedBanner}
        >
          <View style={styles.wantedBannerLeft}>
            <Text style={{ fontSize: 9 }}>📢</Text>
            <Text style={styles.wantedBannerLabel}>WANTED</Text>
          </View>
          <Text style={styles.wantedBannerDate}>Needed by Mar 10</Text>
        </LinearGradient>
        <View style={styles.wantedContent}>
          <View style={[styles.miniCardIcon, { backgroundColor: 'rgba(192,57,43,0.09)' }]}>
            <Text style={{ fontSize: 20 }}>🪚</Text>
          </View>
          <View style={styles.miniCardText}>
            <Text style={styles.miniCardTitle}>Need a Tile Saw</Text>
            <Text style={styles.miniCardSubtitle}>Dave R. · 2h ago</Text>
          </View>
        </View>
      </View>

      <Text style={styles.miniTagline}>List what you have, or ask for what you need</Text>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────

export default function OnboardingIntroScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const navigateForward = useCallback(async () => {
    haptics.medium();
    try { await api.updateOnboardingStep(1); } catch (e) {}
    navigation.replace('OnboardingNeighborhood');
  }, [navigation]);

  const handleContinue = useCallback(() => {
    if (currentIndex < SLIDES.length - 1) {
      haptics.light();
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      navigateForward();
    }
  }, [currentIndex, navigateForward]);

  const isLastSlide = currentIndex === SLIDES.length - 1;

  const renderSlide = ({ item }) => (
    <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
      <View style={styles.slideContent}>
        {/* Icon / Emoji */}
        {item.emoji && !item.icon && (
          <Text style={styles.heroEmoji}>{item.emoji}</Text>
        )}
        {item.icon && (
          <View style={styles.iconContainer}>
            <Ionicons name={item.icon} size={36} color={COLORS.primary} />
          </View>
        )}

        {/* Title & Subtitle */}
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideSubtitle}>{item.subtitle}</Text>

        {/* Feature Cards */}
        {item.cards && (
          <View style={styles.cardsContainer}>
            {item.cards.map((card, i) => (
              <FeatureCard key={i} {...card} />
            ))}
          </View>
        )}

        {/* Mini Preview Cards (Slide 3) */}
        {item.miniCards && <MiniPreviewCards />}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />

      {/* Bottom Area */}
      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + SPACING.lg }]}>
        {/* Dot Indicators */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <Dot key={i} index={i} currentIndex={currentIndex} />
          ))}
        </View>

        {/* Continue Button */}
        <HapticPressable onPress={handleContinue} haptic="medium">
          <LinearGradient
            colors={isLastSlide ? [COLORS.greenBg, COLORS.greenSurface] : ['#8B4513', '#A0522D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.continueButton,
              isLastSlide && { borderWidth: 1.5, borderColor: COLORS.greenBorder },
            ]}
          >
            <Text style={styles.continueText}>
              {isLastSlide ? 'Get Started 🏹' : 'Continue ›'}
            </Text>
          </LinearGradient>
        </HapticPressable>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  // Slides
  slide: {
    flex: 1,
    justifyContent: 'center',
  },
  slideContent: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl + SPACING.sm,
  },
  heroEmoji: {
    fontSize: 64,
    marginBottom: SPACING.xl,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.borderGreenStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  slideTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.8,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  slideSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 250,
    marginBottom: SPACING.xl,
  },

  // Feature Cards
  cardsContainer: {
    width: '100%',
    marginTop: SPACING.sm,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 11,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  featureEmoji: {
    fontSize: 18,
  },
  featureText: {
    flex: 1,
  },
  featureLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  featureDescription: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
  },

  // Mini Preview Cards (Slide 3)
  miniCardsContainer: {
    width: '100%',
    marginTop: SPACING.sm,
  },
  miniCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
    padding: 10,
    gap: SPACING.sm,
  },
  miniCardWanted: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(192, 57, 43, 0.18)',
  },
  miniCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCardText: {
    flex: 1,
  },
  miniCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  miniCardSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  priceBadge: {
    backgroundColor: COLORS.primaryMuted,
    borderWidth: 1,
    borderColor: COLORS.borderGreen,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  priceBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  wantedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  wantedBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  wantedBannerLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
  },
  wantedBannerDate: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  wantedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 10,
    gap: SPACING.sm,
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.separator,
  },
  orText: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  miniTagline: {
    fontSize: 12,
    fontStyle: 'italic',
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.md,
  },

  // Bottom Area
  bottomArea: {
    paddingHorizontal: SPACING.xl,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  continueButton: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  continueText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
