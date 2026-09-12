import { useState, useEffect, useCallback } from 'react';
import ListingPrice from '../components/ListingPrice';
import LayeredCard from '../components/LayeredCard';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  useWindowDimensions,
  InteractionManager,
} from 'react-native';
import ShimmerImage from '../components/ShimmerImage';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { Ionicons } from '../components/Icon';
import HeroIcon from '../components/HeroIcon';
import HapticPressable from '../components/HapticPressable';
import NativeHeader from '../components/NativeHeader';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../utils/config';

const GRID_GAP = SPACING.md;


function HeartButton({ onUnsave, title }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback((event) => {
    event?.stopPropagation?.();
    haptics.light();
    scale.value = withSequence(
      withSpring(1.3, ANIMATION.spring.bouncy),
      withSpring(1, ANIMATION.spring.default)
    );
    onUnsave();
  }, [onUnsave]);

  return (
    <HapticPressable onPress={handlePress} haptic={null} style={styles.heartButton} accessibilityRole="button" accessibilityLabel={`Unsave ${title}`}>
      <Animated.View style={animStyle}>
        <Ionicons name="heart" size={22} color={COLORS.saved} illustrated={false} selected />
      </Animated.View>
    </HapticPressable>
  );
}

export default function SavedScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const columns = width >= 1100 ? 4 : width >= 768 ? 3 : 2;
  const gridWidth = Math.min(width, 1440);
  const cardWidth = (gridWidth - SPACING.lg * 2 - GRID_GAP * (columns - 1)) / columns;
  const [listings, setListings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);


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
    <LayeredCard style={[styles.cardWrap, { width: cardWidth }, index % columns !== columns - 1 ? { marginRight: GRID_GAP } : null]}>
      <HapticPressable
        onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
        haptic="light"
        style={styles.card}
      >
        <View style={styles.imageWrap}>
          <ShimmerImage
            source={{ uri: item.photoUrl || null }}
            style={styles.cardImage}
          />
          <HeartButton title={item.title} onUnsave={() => handleUnsave(item.id)} />
          {item.isAvailable === false && (
            <View style={styles.unavailableBadge}>
              <Text style={styles.unavailableText}>{item.status === 'given_away' ? item.listingType === 'sell' ? 'Sold' : 'Claimed' : item.listingType === 'sell' || item.listingType === 'giveaway' ? 'Unavailable' : 'Borrowed'}</Text>
            </View>
          )}
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <ListingPrice listing={item} compact />
          <View style={styles.ownerRow}>
            {item.owner?.profilePhotoUrl ? (
              <ShimmerImage placeholderIcon="person" source={{ uri: item.owner.profilePhotoUrl }} style={styles.ownerAvatar} />
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
    </LayeredCard>
  );

  return (
    <View style={styles.container}>
      <NativeHeader title="Saved" />

      <FlatList
        data={listings}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        key={`saved-${columns}`}
        numColumns={columns}
        contentContainerStyle={[styles.listContent, { maxWidth: gridWidth }]}
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
              <HeroIcon icon="heart" size={80} />
              <Text style={styles.emptyTitle}>Nothing saved yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap the heart on any listing to save it here
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
    width: '100%',
    maxWidth: 660,
    alignSelf: 'center',
  },
  // Card grid
  cardWrap: {
    marginBottom: SPACING.xl,
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  // Image
  imageWrap: {
    position: 'relative',
    margin: SPACING.sm,
    marginBottom: 0,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    aspectRatio: 0.95,
    backgroundColor: COLORS.surfaceElevated,
  },
  heartButton: {
    position: 'absolute',
    top: SPACING.xs,
    right: SPACING.xs,
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.card,
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
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  cardTitle: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.text,
    fontWeight: '600',
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  ownerAvatar: {
    width: 18,
    height: 18,
    borderRadius: 6,
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
