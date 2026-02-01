import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import api from '../services/api';
import { COLORS } from '../utils/config';

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
      Alert.alert(
        'Welcome!',
        `You've joined ${neighborhood.name}. Start browsing items from your neighbors!`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
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
      Alert.alert(
        'Neighborhood Created!',
        `You've created and joined ${newName}. Invite your neighbors to start sharing!`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
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
    <View style={styles.neighborhoodCard}>
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
        <TouchableOpacity
          style={styles.joinButton}
          onPress={() => handleJoin(item)}
          disabled={joiningId === item.id}
        >
          {joiningId === item.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.joinButtonText}>Join Neighborhood</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
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
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
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
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => setShowCreateModal(true)}
      >
        <Ionicons name="add-circle-outline" size={22} color={COLORS.primary} />
        <Text style={styles.createButtonText}>Create New Neighborhood</Text>
      </TouchableOpacity>

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
              <TouchableOpacity
                style={styles.setLocationButton}
                onPress={() => navigation.navigate('EditProfile')}
              >
                <Text style={styles.setLocationButtonText}>Set Location</Text>
              </TouchableOpacity>
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
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
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

            <TouchableOpacity
              style={[styles.modalButton, isCreating && styles.modalButtonDisabled]}
              onPress={handleCreate}
              disabled={isCreating}
            >
              {isCreating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.modalButtonText}>Create & Join</Text>
              )}
            </TouchableOpacity>
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
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary + '15',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    gap: 8,
  },
  createButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
  },
  neighborhoodCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  neighborhoodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  neighborhoodImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.gray[700],
  },
  placeholderImage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  neighborhoodInfo: {
    flex: 1,
    marginLeft: 12,
  },
  neighborhoodName: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
  },
  neighborhoodStats: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  neighborhoodDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  joinButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  joinButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  memberBadgeText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.primary,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  setLocationButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 20,
  },
  setLocationButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
    marginBottom: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  modalButtonDisabled: {
    opacity: 0.7,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  // Overlay styles
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  overlayCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: COLORS.gray[700],
  },
  overlayIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  overlayTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  overlayText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  overlayButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  overlayButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  overlayDismiss: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  overlayDismissText: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
});
