import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import AnimatedCard from '../components/AnimatedCard';
import NativeHeader from '../components/NativeHeader';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import { COLORS, CONDITION_LABELS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../utils/config';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

function HeartButton({ onUnsave }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    haptics.light();
    scale.value = withSequence(
      withSpring(1.3, ANIMATION.spring.bouncy),
      withSpring(1, ANIMATION.spring.default)
    );
    onUnsave();
  }, [onUnsave]);

  return (
    <HapticPressable onPress={handlePress} haptic={null} style={styles.heartButton}>
      <Animated.View style={animStyle}>
        <Ionicons name="heart" size={22} color={COLORS.danger} />
      </Animated.View>
    </HapticPressable>
  );
}

export default function SavedScreen({ navigation }) {
  const [listings, setListings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const fetchSaved = useCallback(async () => {
    try {
      const data = await api.getSavedListings();
      setListings(data);
    } catch (error) {
      console.error('Failed to fetch saved listings:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchSaved();
    });
    return unsubscribe;
  }, [navigation, fetchSaved]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchSaved();
  };

  const handleUnsave = async (listingId) => {
    try {
      await api.unsaveListing(listingId);
      setListings(prev => prev.filter(l => l.id !== listingId));
    } catch (error) {
      console.error('Failed to unsave:', error);
    }
  };

  const renderItem = ({ item, index }) => (
    <AnimatedCard index={index}>
      <HapticPressable
        onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
        haptic="light"
      >
        <BlurCard style={styles.card}>
          <Image
            source={{ uri: item.photoUrl || 'https://via.placeholder.com/120' }}
            style={styles.cardImage}
          />
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <HeartButton onUnsave={() => handleUnsave(item.id)} />
            </View>

            <Text style={styles.cardCondition}>{CONDITION_LABELS[item.condition]}</Text>

            <View style={styles.priceRow}>
              {item.isFree ? (
                <Text style={styles.freeTag}>Free</Text>
              ) : (
                <Text style={styles.price}>${item.pricePerDay}/day</Text>
              )}
            </View>

            <View style={styles.ownerRow}>
              <Image
                source={{ uri: item.owner.profilePhotoUrl || 'https://via.placeholder.com/24' }}
                style={styles.ownerAvatar}
              />
              <Text style={styles.ownerName}>
                {item.owner.firstName} {item.owner.lastName?.charAt(0)}.
              </Text>
              {item.owner.rating > 0 && (
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={12} color={COLORS.warning} />
                  <Text style={styles.ratingText}>{item.owner.rating.toFixed(1)}</Text>
                </View>
              )}
            </View>
          </View>
        </BlurCard>
      </HapticPressable>
    </AnimatedCard>
  );

  return (
    <View style={styles.container}>
      <NativeHeader title="Saved" scrollY={scrollY} />

      <AnimatedFlatList
        data={listings}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          !isLoading && (
            <View style={styles.emptyContainer}>
              <Ionicons name="heart-outline" size={64} color={COLORS.gray[700]} />
              <Text style={styles.emptyTitle}>No saved items</Text>
              <Text style={styles.emptySubtitle}>
                Tap the heart icon on items you like to save them here
              </Text>
              <HapticPressable
                style={styles.browseButton}
                onPress={() => navigation.navigate('Feed')}
                haptic="medium"
              >
                <Text style={styles.browseButtonText}>Browse Items</Text>
              </HapticPressable>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  listContent: {
    padding: SPACING.lg,
    paddingBottom: 100,
  },
  card: {
    flexDirection: 'row',
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  cardImage: {
    width: 120,
    height: 120,
    backgroundColor: COLORS.gray[700],
  },
  cardContent: {
    flex: 1,
    padding: SPACING.md,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitle: {
    flex: 1,
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
    marginRight: SPACING.sm,
  },
  heartButton: {
    padding: 4,
  },
  cardCondition: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  price: {
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
    color: COLORS.primary,
  },
  freeTag: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.primary,
    backgroundColor: COLORS.primaryMuted,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.xs,
    overflow: 'hidden',
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  ownerAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.gray[700],
  },
  ownerName: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  browseButton: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  browseButtonText: {
    color: '#fff',
    ...TYPOGRAPHY.headline,
  },
});
