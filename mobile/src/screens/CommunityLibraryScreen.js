import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Image,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../utils/config';
import api from '../services/api';

export default function CommunityLibraryScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [])
  );

  const loadItems = async () => {
    try {
      const data = await api.getLibraryItems();
      setItems(data);
    } catch (err) {
      Alert.alert('Error', 'Failed to load library items');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCheckout = async (item) => {
    const returnDate = new Date();
    returnDate.setDate(returnDate.getDate() + (item.checkoutLimitDays || 14));

    Alert.alert(
      'Check Out Item',
      `Check out "${item.title}"? Return by ${returnDate.toLocaleDateString()}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Check Out',
          onPress: async () => {
            try {
              await api.checkoutLibraryItem(item.id, returnDate.toISOString());
              loadItems();
              Alert.alert('Success', 'Item checked out!');
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to check out');
            }
          },
        },
      ]
    );
  };

  const handleReturn = async (item) => {
    try {
      await api.returnLibraryItem(item.id);
      loadItems();
      Alert.alert('Success', 'Item returned!');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to return');
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.itemCard}
      onPress={() => navigation.navigate('ListingDetail', { listingId: item.id })}
    >
      <Image
        source={{ uri: item.photoUrl || 'https://via.placeholder.com/100' }}
        style={styles.itemImage}
      />
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.itemCondition}>Condition: {item.condition}</Text>
        {item.donatedBy && (
          <Text style={styles.donatedBy}>Donated by {item.donatedBy}</Text>
        )}
        <View style={styles.statusRow}>
          <View style={[
            styles.statusBadge,
            item.isAvailable ? styles.statusAvailable : styles.statusUnavailable
          ]}>
            <Text style={[
              styles.statusText,
              item.isAvailable ? styles.statusTextAvailable : styles.statusTextUnavailable
            ]}>
              {item.isAvailable ? 'Available' : 'Checked Out'}
            </Text>
          </View>
          <Text style={styles.checkoutLimit}>{item.checkoutLimitDays} day limit</Text>
        </View>
      </View>
      {item.isAvailable ? (
        <TouchableOpacity
          style={styles.checkoutButton}
          onPress={() => handleCheckout(item)}
        >
          <Text style={styles.checkoutButtonText}>Check Out</Text>
        </TouchableOpacity>
      ) : item.isCheckedOutByMe ? (
        <TouchableOpacity
          style={styles.returnButton}
          onPress={() => handleReturn(item)}
        >
          <Text style={styles.returnButtonText}>Return</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Community Library</Text>
        <Text style={styles.subtitle}>
          Free items donated by community members
        </Text>
      </View>

      {items.length > 0 ? (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadItems();
              }}
              tintColor={COLORS.primary}
            />
          }
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📚</Text>
          <Text style={styles.emptyTitle}>Library is Empty</Text>
          <Text style={styles.emptyText}>
            Be the first to donate an item to the community library!
          </Text>
          <TouchableOpacity
            style={styles.donateButton}
            onPress={() => navigation.navigate('MyItems')}
          >
            <Text style={styles.donateButtonText}>Donate an Item</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.infoCard}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <View style={styles.infoContent}>
          <Text style={styles.infoTitle}>How it works</Text>
          <Text style={styles.infoText}>
            Community library items are free to borrow. Just return them on time so others can enjoy them too!
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[800],
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  listContent: {
    padding: 16,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
    alignItems: 'center',
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: COLORS.gray[700],
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  itemCondition: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  donatedBy: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusAvailable: {
    backgroundColor: COLORS.primary + '20',
  },
  statusUnavailable: {
    backgroundColor: COLORS.warning + '20',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusTextAvailable: {
    color: COLORS.primary,
  },
  statusTextUnavailable: {
    color: COLORS.warning,
  },
  checkoutLimit: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  checkoutButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 8,
  },
  checkoutButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.background,
  },
  returnButton: {
    backgroundColor: COLORS.gray[700],
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 8,
  },
  returnButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  emptyState: {
    flex: 1,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  donateButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  donateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  infoIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
});
