import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, SHADOWS } from '../utils/config';
import api from '../services/api';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import BlurCard from '../components/BlurCard';
import { haptics } from '../utils/haptics';

export default function BundlesScreen({ navigation }) {
  const [bundles, setBundles] = useState([]);
  const [myBundles, setMyBundles] = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBundle, setNewBundle] = useState({ name: '', description: '', listingIds: [] });
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState('browse');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [validationError, setValidationError] = useState(null);

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
      haptics.error();
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBundle = async () => {
    if (!newBundle.name.trim()) {
      setValidationError('Bundle name is required');
      haptics.warning();
      return;
    }
    if (newBundle.listingIds.length < 2) {
      setValidationError('Select at least 2 items for the bundle');
      haptics.warning();
      return;
    }
    setValidationError(null);

    setCreating(true);
    try {
      await api.createBundle(newBundle);
      setShowCreateModal(false);
      setNewBundle({ name: '', description: '', listingIds: [] });
      loadData();
      haptics.success();
    } catch (err) {
      haptics.error();
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteBundle = async (bundleId) => {
    setDeleteTarget(bundleId);
    setShowDeleteSheet(true);
  };

  const performDeleteBundle = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteBundle(deleteTarget);
      haptics.success();
      loadData();
    } catch (err) {
      haptics.error();
    }
    setDeleteTarget(null);
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
    <HapticPressable
      onPress={() => navigation.navigate('BundleDetail', { bundleId: item.id })}
      haptic="light"
    >
      <BlurCard style={styles.bundleCard}>
        <View style={styles.bundleCardContent}>
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
            <HapticPressable
              style={styles.deleteButton}
              onPress={() => handleDeleteBundle(item.id)}
              haptic="medium"
            >
              <Text style={styles.deleteButtonText}>x</Text>
            </HapticPressable>
          )}
        </View>
      </BlurCard>
    </HapticPressable>
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
        <HapticPressable
          style={[styles.tab, activeTab === 'browse' && styles.tabActive]}
          onPress={() => setActiveTab('browse')}
          haptic="light"
        >
          <Text style={[styles.tabText, activeTab === 'browse' && styles.tabTextActive]}>
            Browse
          </Text>
        </HapticPressable>
        <HapticPressable
          style={[styles.tab, activeTab === 'mine' && styles.tabActive]}
          onPress={() => setActiveTab('mine')}
          haptic="light"
        >
          <Text style={[styles.tabText, activeTab === 'mine' && styles.tabTextActive]}>
            My Bundles
          </Text>
        </HapticPressable>
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

      <HapticPressable
        style={styles.fab}
        onPress={() => setShowCreateModal(true)}
        haptic="medium"
      >
        <Text style={styles.fabText}>+</Text>
      </HapticPressable>

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
                <HapticPressable
                  style={[
                    styles.listingItem,
                    newBundle.listingIds.includes(item.id) && styles.listingItemSelected
                  ]}
                  onPress={() => toggleListingSelection(item.id)}
                  haptic="light"
                >
                  <Image
                    source={{ uri: item.photos?.[0] || 'https://via.placeholder.com/50' }}
                    style={styles.listingItemImage}
                  />
                  <Text style={styles.listingItemTitle} numberOfLines={1}>{item.title}</Text>
                  {newBundle.listingIds.includes(item.id) && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </HapticPressable>
              )}
            />

            {validationError && (
              <Text style={styles.validationError}>{validationError}</Text>
            )}

            <View style={styles.modalButtons}>
              <HapticPressable
                style={styles.cancelButton}
                onPress={() => setShowCreateModal(false)}
                haptic="light"
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </HapticPressable>
              <HapticPressable
                style={styles.createButton}
                onPress={handleCreateBundle}
                disabled={creating}
                haptic="medium"
              >
                {creating ? (
                  <ActivityIndicator size="small" color={COLORS.background} />
                ) : (
                  <Text style={styles.createButtonText}>Create</Text>
                )}
              </HapticPressable>
            </View>
          </View>
        </View>
      </Modal>

      <ActionSheet
        isVisible={showDeleteSheet}
        onClose={() => { setShowDeleteSheet(false); setDeleteTarget(null); }}
        title="Delete Bundle"
        message="Are you sure you want to delete this bundle?"
        actions={[
          {
            label: 'Delete',
            destructive: true,
            onPress: performDeleteBundle,
          },
        ]}
      />
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    ...TYPOGRAPHY.body,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  listContent: {
    padding: SPACING.lg,
  },
  bundleCard: {
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.separator,
  },
  bundleCardContent: {
    flexDirection: 'row',
    padding: SPACING.lg,
  },
  bundleImages: {
    width: 80,
    height: 80,
    position: 'relative',
  },
  bundleImage: {
    width: 50,
    height: 50,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.gray[700],
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  bundleInfo: {
    flex: 1,
    marginLeft: SPACING.lg,
  },
  bundleName: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
  },
  bundleCount: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  bundleDescription: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
  discountBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
    alignSelf: 'flex-start',
    marginTop: SPACING.sm,
  },
  discountText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
  },
  deleteButton: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.danger + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    ...TYPOGRAPHY.body,
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
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    ...TYPOGRAPHY.footnote,
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
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  fabText: {
    fontSize: 28,
    color: COLORS.background,
    fontWeight: '300',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.xl,
    maxHeight: '80%',
  },
  modalTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 20,
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  input: {
    backgroundColor: COLORS.separator,
    borderRadius: RADIUS.md,
    padding: SPACING.md + 2,
    ...TYPOGRAPHY.body,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray[700],
  },
  textArea: {
    minHeight: 60,
  },
  selectLabel: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  listingsList: {
    maxHeight: 200,
    marginBottom: SPACING.lg,
  },
  listingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md - 2,
    backgroundColor: COLORS.separator,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.sm,
  },
  listingItemSelected: {
    backgroundColor: COLORS.primary + '20',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  listingItemImage: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.xs,
    backgroundColor: COLORS.gray[700],
  },
  listingItemTitle: {
    ...TYPOGRAPHY.footnote,
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    marginLeft: SPACING.md - 2,
  },
  checkmark: {
    ...TYPOGRAPHY.body,
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
  validationError: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.danger,
    marginBottom: SPACING.sm,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.gray[700],
    alignItems: 'center',
  },
  cancelButtonText: {
    ...TYPOGRAPHY.button,
    fontSize: 16,
    color: COLORS.text,
  },
  createButton: {
    flex: 1,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  createButtonText: {
    ...TYPOGRAPHY.button,
    fontSize: 16,
    color: COLORS.background,
  },
});
