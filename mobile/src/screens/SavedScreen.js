import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
  Dimensions,
  InteractionManager,
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
import AnimatedCard from '../components/AnimatedCard';
import NativeHeader from '../components/NativeHeader';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../utils/config';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = SPACING.sm;
const CARD_WIDTH = (SCREEN_WIDTH - SPACING.lg * 2 - GRID_GAP) / 2;
const IMAGE_HEIGHT = CARD_WIDTH * 1.1;

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
        <Ionicons name="heart" size={18} color={COLORS.danger} />
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
      InteractionManager.runAfterInteractions(() => {
        fetchSaved();
      });
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
    <AnimatedCard index={index} style={[styles.cardWrap, index % 2 === 0 ? { marginRight: GRID_GAP } : null]}>
      <HapticPressable
        onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
        haptic="light"
        style={styles.card}
      >
        <View style={styles.imageWrap}>
          <Image
            source={{ uri: item.photoUrl || 'https://via.placeholder.com/200' }}
            style={styles.cardImage}
          />
          <HeartButton onUnsave={() => handleUnsave(item.id)} />
          {!item.isAvailable && (
            <View style={styles.unavailableBadge}>
              <Text style={styles.unavailableText}>Borrowed</Text>
            </View>
          )}
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <View style={styles.cardRow}>
            {item.isFree ? (
              <Text style={styles.freeTag}>Free</Text>
            ) : (
              <Text style={styles.price}>${item.pricePerDay}/day</Text>
            )}
            {item.owner?.rating > 0 && (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={10} color={COLORS.warning} />
                <Text style={styles.ratingText}>{item.owner.rating.toFixed(1)}</Text>
              </View>
            )}
          </View>
          <View style={styles.ownerRow}>
            {item.owner?.profilePhotoUrl ? (
              <Image source={{ uri: item.owner.profilePhotoUrl }} style={styles.ownerAvatar} />
            ) : (
              <View style={[styles.ownerAvatar, styles.ownerAvatarPlaceholder]}>
                <Ionicons name="person" size={10} color={COLORS.textMuted} />
              </View>
            )}
            <Text style={styles.ownerName} numberOfLines={1}>
              {item.owner?.firstName || 'Unknown'}
            </Text>
          </View>
        </View>
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
        numColumns={2}
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
              <View style={styles.emptyIconWrap}>
                <Ionicons name="heart-outline" size={40} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>No saved items</Text>
              <Text style={styles.emptySubtitle}>
                Tap the heart on items you like to save them here for later
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
  // Card grid
  cardWrap: {
    width: CARD_WIDTH,
    marginBottom: GRID_GAP,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  // Image
  imageWrap: {
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: IMAGE_HEIGHT,
    backgroundColor: COLORS.gray[700],
  },
  heartButton: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    width: 32,
    height: 32,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailableBadge: {
    position: 'absolute',
    bottom: SPACING.sm,
    left: SPACING.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.xs,
  },
  unavailableText: {
    ...TYPOGRAPHY.caption1,
    color: '#fff',
    fontWeight: '600',
    fontSize: 10,
  },
  // Info
  cardInfo: {
    padding: SPACING.sm,
    paddingTop: SPACING.sm,
    gap: 3,
  },
  cardTitle: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.text,
    fontWeight: '600',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.primary,
  },
  freeTag: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '700',
    color: COLORS.primary,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: 1,
  },
  ownerAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.gray[700],
  },
  ownerAvatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerName: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    flex: 1,
  },
  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
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
