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
  Modal,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../utils/config';
import api from '../services/api';

export default function BundlesScreen({ navigation }) {
  const [bundles, setBundles] = useState([]);
  const [myBundles, setMyBundles] = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBundle, setNewBundle] = useState({ name: '', description: '', listingIds: [] });
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState('browse');

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const [allBundles, mine, listings] = await Promise.all([
        api.getBundles(),
        api.getMyBundles(),
        api.getMyListings(),
      ]);
      setBundles(allBundles);
      setMyBundles(mine);
      setMyListings(listings);
    } catch (err) {
      Alert.alert('Error', 'Failed to load bundles');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBundle = async () => {
    if (!newBundle.name.trim()) {
      Alert.alert('Error', 'Bundle name is required');
      return;
    }
    if (newBundle.listingIds.length < 2) {
      Alert.alert('Error', 'Select at least 2 items for the bundle');
      return;
    }

    setCreating(true);
    try {
      await api.createBundle(newBundle);
      setShowCreateModal(false);
      setNewBundle({ name: '', description: '', listingIds: [] });
      loadData();
      Alert.alert('Success', 'Bundle created!');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to create bundle');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteBundle = async (bundleId) => {
    Alert.alert(
      'Delete Bundle',
      'Are you sure you want to delete this bundle?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteBundle(bundleId);
              loadData();
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to delete bundle');
            }
          },
        },
      ]
    );
  };

  const toggleListingSelection = (listingId) => {
    setNewBundle(prev => ({
      ...prev,
      listingIds: prev.listingIds.includes(listingId)
        ? prev.listingIds.filter(id => id !== listingId)
        : [...prev.listingIds, listingId],
    }));
  };

  const renderBundle = ({ item }) => (
    <TouchableOpacity
      style={styles.bundleCard}
      onPress={() => navigation.navigate('BundleDetail', { bundleId: item.id })}
    >
      <View style={styles.bundleImages}>
        {item.listings?.slice(0, 4).map((listing, idx) => (
          <Image
            key={idx}
            source={{ uri: listing.photoUrl || 'https://via.placeholder.com/60' }}
            style={[
              styles.bundleImage,
              { position: 'absolute', left: idx * 20, zIndex: 4 - idx }
            ]}
          />
        ))}
      </View>
      <View style={styles.bundleInfo}>
        <Text style={styles.bundleName}>{item.name}</Text>
        <Text style={styles.bundleCount}>{item.listings?.length || 0} items</Text>
        {item.description && (
          <Text style={styles.bundleDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        {item.discountPercent > 0 && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{item.discountPercent}% bundle discount</Text>
          </View>
        )}
      </View>
      {item.isOwner && (
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteBundle(item.id)}
        >
          <Text style={styles.deleteButtonText}>×</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const displayBundles = activeTab === 'browse' ? bundles : myBundles;

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'browse' && styles.tabActive]}
          onPress={() => setActiveTab('browse')}
        >
          <Text style={[styles.tabText, activeTab === 'browse' && styles.tabTextActive]}>
            Browse
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'mine' && styles.tabActive]}
          onPress={() => setActiveTab('mine')}
        >
          <Text style={[styles.tabText, activeTab === 'mine' && styles.tabTextActive]}>
            My Bundles
          </Text>
        </TouchableOpacity>
      </View>

      {displayBundles.length > 0 ? (
        <FlatList
          data={displayBundles}
          renderItem={renderBundle}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={styles.emptyTitle}>
            {activeTab === 'browse' ? 'No Bundles Available' : 'No Bundles Yet'}
          </Text>
          <Text style={styles.emptyText}>
            {activeTab === 'browse'
              ? 'Bundle items together for easier borrowing'
              : 'Create a bundle to offer multiple items together'}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCreateModal(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Bundle</Text>

            <TextInput
              style={styles.input}
              value={newBundle.name}
              onChangeText={(text) => setNewBundle(prev => ({ ...prev, name: text }))}
              placeholder="Bundle name"
              placeholderTextColor={COLORS.textMuted}
            />

            <TextInput
              style={[styles.input, styles.textArea]}
              value={newBundle.description}
              onChangeText={(text) => setNewBundle(prev => ({ ...prev, description: text }))}
              placeholder="Description (optional)"
              placeholderTextColor={COLORS.textMuted}
              multiline
            />

            <Text style={styles.selectLabel}>Select Items ({newBundle.listingIds.length} selected)</Text>
            <FlatList
              data={myListings}
              keyExtractor={(item) => item.id}
              style={styles.listingsList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.listingItem,
                    newBundle.listingIds.includes(item.id) && styles.listingItemSelected
                  ]}
                  onPress={() => toggleListingSelection(item.id)}
                >
                  <Image
                    source={{ uri: item.photos?.[0] || 'https://via.placeholder.com/50' }}
                    style={styles.listingItemImage}
                  />
                  <Text style={styles.listingItemTitle} numberOfLines={1}>{item.title}</Text>
                  {newBundle.listingIds.includes(item.id) && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              )}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.createButton}
                onPress={handleCreateBundle}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color={COLORS.background} />
                ) : (
                  <Text style={styles.createButtonText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  tabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[800],
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  bundleCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  bundleImages: {
    width: 80,
    height: 80,
    position: 'relative',
  },
  bundleImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: COLORS.gray[700],
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  bundleInfo: {
    flex: 1,
    marginLeft: 16,
  },
  bundleName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  bundleCount: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  bundleDescription: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  discountBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  discountText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
  deleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.danger + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 18,
    color: COLORS.danger,
    fontWeight: '500',
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
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  fabText: {
    fontSize: 28,
    color: COLORS.background,
    fontWeight: '300',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 16,
  },
  input: {
    backgroundColor: COLORS.gray[800],
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[700],
  },
  textArea: {
    minHeight: 60,
  },
  selectLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 8,
  },
  listingsList: {
    maxHeight: 200,
    marginBottom: 16,
  },
  listingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: COLORS.gray[800],
    borderRadius: 8,
    marginBottom: 8,
  },
  listingItemSelected: {
    backgroundColor: COLORS.primary + '20',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  listingItemImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: COLORS.gray[700],
  },
  listingItemTitle: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    marginLeft: 10,
  },
  checkmark: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[700],
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  createButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
});
