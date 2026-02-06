import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../utils/config';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import AnimatedCard from '../components/AnimatedCard';
import ActionSheet from '../components/ActionSheet';

export default function CommunityLibraryScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkoutSheetVisible, setCheckoutSheetVisible] = useState(false);
  const [checkoutTarget, setCheckoutTarget] = useState(null);

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
      haptics.error();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCheckout = (item) => {
    setCheckoutTarget(item);
    setCheckoutSheetVisible(true);
  };

  const confirmCheckout = async () => {
    if (!checkoutTarget) return;
    const item = checkoutTarget;
    const returnDate = new Date();
    returnDate.setDate(returnDate.getDate() + (item.checkoutLimitDays || 14));

    try {
      await api.checkoutLibraryItem(item.id, returnDate.toISOString());
      loadItems();
      haptics.success();
    } catch (err) {
      haptics.error();
    }
  };

  const handleReturn = async (item) => {
    try {
      await api.returnLibraryItem(item.id);
      loadItems();
      haptics.success();
    } catch (err) {
      haptics.error();
    }
  };

  const getCheckoutMessage = () => {
    if (!checkoutTarget) return '';
    const returnDate = new Date();
    returnDate.setDate(returnDate.getDate() + (checkoutTarget.checkoutLimitDays || 14));
    return `Check out "${checkoutTarget.title}"? Return by ${returnDate.toLocaleDateString()}`;
  };

  const renderItem = ({ item, index }) => (
    <AnimatedCard index={index}>
      <HapticPressable
        style={styles.itemCardPressable}
        onPress={() => navigation.navigate('ListingDetail', { listingId: item.id })}
        haptic="light"
      >
        <BlurCard style={styles.itemCard}>
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
            <HapticPressable
              style={styles.checkoutButton}
              onPress={() => handleCheckout(item)}
              haptic="medium"
            >
              <Text style={styles.checkoutButtonText}>Check Out</Text>
            </HapticPressable>
          ) : item.isCheckedOutByMe ? (
            <HapticPressable
              style={styles.returnButton}
              onPress={() => handleReturn(item)}
              haptic="medium"
            >
              <Text style={styles.returnButtonText}>Return</Text>
            </HapticPressable>
          ) : null}
        </BlurCard>
      </HapticPressable>
    </AnimatedCard>
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
          <HapticPressable
            style={styles.donateButton}
            onPress={() => navigation.navigate('MyItems')}
            haptic="medium"
          >
            <Text style={styles.donateButtonText}>Donate an Item</Text>
          </HapticPressable>
        </View>
      )}

      <BlurCard style={styles.infoCard}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <View style={styles.infoContent}>
          <Text style={styles.infoTitle}>How it works</Text>
          <Text style={styles.infoText}>
            Community library items are free to borrow. Just return them on time so others can enjoy them too!
          </Text>
        </View>
      </BlurCard>

      <ActionSheet
        isVisible={checkoutSheetVisible}
        onClose={() => {
          setCheckoutSheetVisible(false);
          setCheckoutTarget(null);
        }}
        title="Check Out Item"
        message={getCheckoutMessage()}
        actions={[
          {
            label: 'Check Out',
            onPress: confirmCheckout,
          },
        ]}
        cancelLabel="Cancel"
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
  header: {
    padding: SPACING.xl,
    paddingBottom: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
  },
  title: {
    ...TYPOGRAPHY.h1,
    fontSize: 24,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  listContent: {
    padding: SPACING.lg,
  },
  itemCardPressable: {
    marginBottom: SPACING.md,
  },
  itemCard: {
    flexDirection: 'row',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.gray[700],
  },
  itemInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  itemTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  itemCondition: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  donatedBy: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
  },
  statusAvailable: {
    backgroundColor: COLORS.primary + '20',
  },
  statusUnavailable: {
    backgroundColor: COLORS.warning + '20',
  },
  statusText: {
    ...TYPOGRAPHY.caption,
  },
  statusTextAvailable: {
    color: COLORS.primary,
  },
  statusTextUnavailable: {
    color: COLORS.warning,
  },
  checkoutLimit: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  checkoutButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    marginLeft: SPACING.sm,
  },
  checkoutButtonText: {
    ...TYPOGRAPHY.button,
    fontSize: 13,
    color: COLORS.background,
  },
  returnButton: {
    backgroundColor: COLORS.gray[700],
    paddingHorizontal: 14,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    marginLeft: SPACING.sm,
  },
  returnButtonText: {
    ...TYPOGRAPHY.button,
    fontSize: 13,
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
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },
  donateButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.xxl,
  },
  donateButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.background,
  },
  infoCard: {
    flexDirection: 'row',
    margin: SPACING.lg,
    marginTop: 0,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  infoIcon: {
    fontSize: 20,
    marginRight: SPACING.md,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  infoText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
});
