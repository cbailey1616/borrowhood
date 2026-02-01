import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, CONDITION_LABELS } from '../utils/config';

export default function SavedScreen({ navigation }) {
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

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
      activeOpacity={0.7}
    >
      <Image
        source={{ uri: item.photoUrl || 'https://via.placeholder.com/120' }}
        style={styles.cardImage}
      />
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <TouchableOpacity
            style={styles.heartButton}
            onPress={() => handleUnsave(item.id)}
          >
            <Ionicons name="heart" size={22} color={COLORS.danger} />
          </TouchableOpacity>
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
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={listings}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
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
              <TouchableOpacity
                style={styles.browseButton}
                onPress={() => navigation.navigate('Feed')}
              >
                <Text style={styles.browseButtonText}>Browse Items</Text>
              </TouchableOpacity>
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
    padding: 16,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardImage: {
    width: 120,
    height: 120,
    backgroundColor: COLORS.gray[700],
  },
  cardContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginRight: 8,
  },
  heartButton: {
    padding: 4,
  },
  cardCondition: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  price: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
  freeTag: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ownerAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.gray[700],
  },
  ownerName: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  browseButton: {
    marginTop: 24,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  browseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
