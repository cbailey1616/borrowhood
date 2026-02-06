import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import { haptics } from '../utils/haptics';

const NEEDS_LOCATION_MESSAGE = 'Set your location in your profile to discover neighborhoods nearby.';

export default function JoinCommunityScreen({ navigation }) {
  const { user, refreshUser } = useAuth();
  const { showError } = useError();
  const [neighborhoods, setNeighborhoods] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [joiningId, setJoiningId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [needsLocation, setNeedsLocation] = useState(false);

  useEffect(() => {
    fetchNeighborhoods();
  }, []);

  const fetchNeighborhoods = async () => {
    try {
      // Check if user has location set
      if (!user?.latitude || !user?.longitude) {
        setNeedsLocation(true);
        setNeighborhoods([]);
      } else {
        setNeedsLocation(false);
        const data = await api.getCommunities();
        setNeighborhoods(data || []);
      }
    } catch (error) {
      console.error('Failed to fetch neighborhoods:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async (neighborhood) => {
    setJoiningId(neighborhood.id);
    try {
      await api.joinCommunity(neighborhood.id);
      await refreshUser();
      haptics.success();
      navigation.goBack();
    } catch (error) {
      haptics.error();
      showError({
        message: error.message || 'Unable to join this neighborhood. Please check your connection and try again.',
        type: 'network',
      });
    } finally {
      setJoiningId(null);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      showError({
        message: 'Please enter a name for your neighborhood to continue.',
        type: 'validation',
      });
      return;
    }

    setIsCreating(true);
    try {
      const result = await api.createCommunity({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      });
      await api.joinCommunity(result.id);
      await refreshUser();
      setShowCreateModal(false);
      haptics.success();
      navigation.goBack();
    } catch (error) {
      haptics.error();
      const errorCode = error.code || '';
      if (errorCode === 'LOCATION_REQUIRED') {
        setShowCreateModal(false);
        showError({
          message: 'Please set your location in your profile first.',
          type: 'validation',
        });
        navigation.navigate('EditProfile');
      } else {
        showError({
          message: error.message || 'Unable to create neighborhood. Please check your connection and try again.',
          type: 'network',
        });
      }
    } finally {
      setIsCreating(false);
    }
  };

  const filteredNeighborhoods = neighborhoods.filter(c =>
    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderNeighborhood = ({ item }) => (
    <BlurCard style={styles.neighborhoodCard}>
      <View style={styles.neighborhoodCardContent}>
        <View style={styles.neighborhoodHeader}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.neighborhoodImage} />
          ) : (
            <View style={[styles.neighborhoodImage, styles.placeholderImage]}>
              <Ionicons name="home" size={24} color={COLORS.gray[500]} />
            </View>
          )}
          <View style={styles.neighborhoodInfo}>
            <Text style={styles.neighborhoodName}>{item.name}</Text>
            <Text style={styles.neighborhoodStats}>
              {item.memberCount || 0} neighbors{item.distanceMiles ? ` • ${item.distanceMiles} mi away` : ''}
            </Text>
          </View>
        </View>

        {item.description && (
          <Text style={styles.neighborhoodDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}

        {item.isMember ? (
          <View style={styles.memberBadge}>
            <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
            <Text style={styles.memberBadgeText}>Joined</Text>
          </View>
        ) : (
          <HapticPressable
            style={styles.joinButton}
            onPress={() => handleJoin(item)}
            disabled={joiningId === item.id}
            haptic="medium"
          >
            {joiningId === item.id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.joinButtonText}>Join Neighborhood</Text>
            )}
          </HapticPressable>
        )}
      </View>
    </BlurCard>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search neighborhoods..."
          placeholderTextColor={COLORS.textSecondary}
        />
        {searchQuery.length > 0 && (
          <HapticPressable onPress={() => setSearchQuery('')} haptic="light">
            <Ionicons name="close-circle" size={20} color={COLORS.textSecondary} />
          </HapticPressable>
        )}
      </View>

      {/* Info */}
      <View style={styles.infoCard}>
        <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} />
        <Text style={styles.infoText}>
          Join your neighborhood to share items with nearby neighbors. Don't see yours? Create it!
        </Text>
      </View>

      {/* Create Button */}
      <HapticPressable
        style={styles.createButton}
        onPress={() => setShowCreateModal(true)}
        haptic="medium"
      >
        <Ionicons name="add-circle-outline" size={22} color={COLORS.primary} />
        <Text style={styles.createButtonText}>Create New Neighborhood</Text>
      </HapticPressable>

      {/* Neighborhoods List */}
      <FlatList
        data={filteredNeighborhoods}
        renderItem={renderNeighborhood}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name={needsLocation ? "location-outline" : "home-outline"} size={48} color={COLORS.gray[600]} />
            <Text style={styles.emptyText}>
              {needsLocation ? 'Location Required' : 'No neighborhoods nearby'}
            </Text>
            <Text style={styles.emptySubtext}>
              {needsLocation
                ? 'Set your location in your profile to discover neighborhoods within 1 mile.'
                : 'Be the first to create a neighborhood in your area!'}
            </Text>
            {needsLocation && (
              <HapticPressable
                style={styles.setLocationButton}
                onPress={() => navigation.navigate('EditProfile')}
                haptic="medium"
              >
                <Text style={styles.setLocationButtonText}>Set Location</Text>
              </HapticPressable>
            )}
          </View>
        }
      />

      {/* Create Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Neighborhood</Text>
              <HapticPressable onPress={() => setShowCreateModal(false)} haptic="light">
                <Ionicons name="close" size={24} color={COLORS.text} />
              </HapticPressable>
            </View>

            <Text style={styles.inputLabel}>Neighborhood Name *</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g., Maple Street, Downtown East"
              placeholderTextColor={COLORS.textSecondary}
              maxLength={100}
            />

            <Text style={styles.inputLabel}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="Tell neighbors about your area..."
              placeholderTextColor={COLORS.textSecondary}
              multiline
              numberOfLines={3}
              maxLength={500}
            />

            <HapticPressable
              style={[styles.modalButton, isCreating && styles.modalButtonDisabled]}
              onPress={handleCreate}
              disabled={isCreating}
              haptic="medium"
            >
              {isCreating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.modalButtonText}>Create & Join</Text>
              )}
            </HapticPressable>
          </View>
        </KeyboardAvoidingView>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    margin: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.separator,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md + 2,
    paddingHorizontal: SPACING.md,
    ...TYPOGRAPHY.body,
    fontSize: 16,
    color: COLORS.text,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary + '15',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    padding: SPACING.md + 2,
    borderRadius: RADIUS.md,
    gap: SPACING.md - 2,
  },
  infoText: {
    ...TYPOGRAPHY.footnote,
    flex: 1,
    color: COLORS.text,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    padding: SPACING.md + 2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    gap: SPACING.sm,
  },
  createButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.primary,
  },
  listContent: {
    padding: SPACING.lg,
    paddingTop: 0,
  },
  neighborhoodCard: {
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.separator,
  },
  neighborhoodCardContent: {
    padding: SPACING.lg,
  },
  neighborhoodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  neighborhoodImage: {
    width: 50,
    height: 50,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.gray[700],
  },
  placeholderImage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  neighborhoodInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  neighborhoodName: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  neighborhoodStats: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  neighborhoodDescription: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  joinButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md - 2,
    alignItems: 'center',
  },
  joinButtonText: {
    ...TYPOGRAPHY.button,
    color: '#fff',
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs + 2,
    paddingVertical: SPACING.md,
  },
  memberBadgeText: {
    ...TYPOGRAPHY.body,
    fontWeight: '500',
    color: COLORS.primary,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
    marginTop: SPACING.lg,
  },
  emptySubtext: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl - 4,
  },
  setLocationButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.md - 2,
    marginTop: SPACING.xl - 4,
  },
  setLocationButtonText: {
    ...TYPOGRAPHY.button,
    color: '#fff',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-start',
    paddingTop: 60,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xxl,
    padding: SPACING.xl,
    marginHorizontal: SPACING.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  modalTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 20,
    color: COLORS.text,
  },
  inputLabel: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md + 2,
    ...TYPOGRAPHY.body,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.separator,
    marginBottom: SPACING.lg,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  modalButtonDisabled: {
    opacity: 0.7,
  },
  modalButtonText: {
    ...TYPOGRAPHY.button,
    fontSize: 16,
    color: '#fff',
  },
  // Overlay styles
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 100,
    paddingHorizontal: SPACING.xl - 4,
  },
  overlayCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: COLORS.gray[700],
  },
  overlayIconContainer: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: SPACING.lg,
  },
  overlayTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.md - 2,
  },
  overlayText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  overlayButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  overlayButtonText: {
    ...TYPOGRAPHY.button,
    fontSize: 16,
    color: '#fff',
  },
  overlayDismiss: {
    alignItems: 'center',
    paddingVertical: SPACING.md + 2,
    marginTop: SPACING.sm,
  },
  overlayDismissText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
});
