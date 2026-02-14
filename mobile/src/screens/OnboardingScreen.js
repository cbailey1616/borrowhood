import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Image,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import BlurCard from '../components/BlurCard';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const { width } = Dimensions.get('window');

export default function OnboardingScreen({ onComplete }) {
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Step 1: Location
  const [city, setCity] = useState(user?.city || '');
  const [state, setState] = useState(user?.state || '');
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // Step 2: Neighborhoods
  const [neighborhoods, setNeighborhoods] = useState([]);
  const [isLoadingNeighborhoods, setIsLoadingNeighborhoods] = useState(false);
  const [joinedCommunity, setJoinedCommunity] = useState(null);

  // Step 3: Friends
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addedFriends, setAddedFriends] = useState([]);

  // ActionSheet states
  const [locationErrorSheet, setLocationErrorSheet] = useState({ visible: false, title: '', message: '' });
  const [genericErrorSheet, setGenericErrorSheet] = useState({ visible: false, title: '', message: '' });
  const [createNeighborhoodSheet, setCreateNeighborhoodSheet] = useState(false);
  const [neighborhoodName, setNeighborhoodName] = useState('');

  const handleGetLocation = async () => {
    setIsGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationErrorSheet({ visible: true, title: 'Permission Denied', message: 'Please enable location access in Settings, or enter your location manually below.' });
        setIsGettingLocation(false);
        return;
      }

      const location = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
      ]);

      const [address] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      const detectedCity = address?.city || address?.subregion || '';
      const detectedState = address?.region || '';

      if (detectedCity && detectedState) {
        setCity(detectedCity);
        setState(detectedState);
      } else {
        setLocationErrorSheet({ visible: true, title: 'Location Found', message: 'We got your coordinates but couldn\'t determine your city. Please enter it manually below.' });
      }
    } catch (error) {
      const msg = error.message === 'timeout'
        ? 'Location is taking too long. Please enter your city and state manually below.'
        : 'Could not get your location. Please enter it manually below.';
      setLocationErrorSheet({ visible: true, title: 'Location Unavailable', message: msg });
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleSaveLocation = async () => {
    if (!city.trim() || !state.trim()) {
      setGenericErrorSheet({ visible: true, title: 'Required', message: 'Please enter your city and state.' });
      return;
    }

    setIsLoading(true);
    try {
      await api.updateProfile({ city: city.trim(), state: state.trim() });
      await refreshUser();
      setStep(2);
      fetchNeighborhoods();
    } catch (error) {
      setGenericErrorSheet({ visible: true, title: 'Error', message: 'Failed to save location.' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNeighborhoods = async () => {
    setIsLoadingNeighborhoods(true);
    try {
      const data = await api.getCommunities();
      setNeighborhoods(data);
    } catch (error) {
      console.error('Failed to fetch neighborhoods:', error);
    } finally {
      setIsLoadingNeighborhoods(false);
    }
  };

  const handleJoinNeighborhood = async (community) => {
    setIsLoading(true);
    try {
      await api.joinCommunity(community.id);
      setJoinedCommunity(community);
      setNeighborhoods(prev =>
        prev.map(n => n.id === community.id ? { ...n, isMember: true } : n)
      );
    } catch (error) {
      setGenericErrorSheet({ visible: true, title: 'Error', message: 'Failed to join neighborhood.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNeighborhood = () => {
    setNeighborhoodName('');
    setCreateNeighborhoodSheet(true);
  };

  const handleConfirmCreateNeighborhood = async () => {
    if (!neighborhoodName?.trim()) return;
    setCreateNeighborhoodSheet(false);
    setIsLoading(true);
    try {
      const result = await api.createCommunity({ name: neighborhoodName.trim() });
      setJoinedCommunity({ id: result.id, name: neighborhoodName.trim() });
      setStep(3);
    } catch (error) {
      setGenericErrorSheet({ visible: true, title: 'Error', message: error.message || 'Failed to create neighborhood.' });
    } finally {
      setIsLoading(false);
    }
  };

  // Search for friends
  useEffect(() => {
    if (step !== 3 || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await api.searchUsers(searchQuery);
        setSearchResults(results);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchQuery, step]);

  const handleAddFriend = async (user) => {
    try {
      await api.addFriend(user.id);
      setAddedFriends(prev => [...prev, user.id]);
      setSearchResults(prev =>
        prev.map(u => u.id === user.id ? { ...u, requestPending: true } : u)
      );
    } catch (error) {
      setGenericErrorSheet({ visible: true, title: 'Error', message: 'Failed to send friend request.' });
    }
  };

  const handleFinish = async () => {
    haptics.success();
    if (onComplete) {
      onComplete();
    }
  };

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="location" size={48} color={COLORS.primary} />
      </View>
      <Text style={styles.title}>Where are you located?</Text>
      <Text style={styles.subtitle}>
        We'll show you items and neighbors in your area
      </Text>

      <HapticPressable
        style={styles.locationButton}
        onPress={handleGetLocation}
        disabled={isGettingLocation}
        haptic="medium"
      >
        {isGettingLocation ? (
          <ActivityIndicator color={COLORS.primary} />
        ) : (
          <>
            <Ionicons name="navigate" size={20} color={COLORS.primary} />
            <Text style={styles.locationButtonText}>Use My Location</Text>
          </>
        )}
      </HapticPressable>

      <Text style={styles.orText}>or enter manually</Text>

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, styles.inputCity]}
          placeholder="City"
          placeholderTextColor={COLORS.textMuted}
          value={city}
          onChangeText={setCity}
        />
        <TextInput
          style={[styles.input, styles.inputState]}
          placeholder="State"
          placeholderTextColor={COLORS.textMuted}
          value={state}
          onChangeText={setState}
          maxLength={2}
          autoCapitalize="characters"
        />
      </View>

      <HapticPressable
        style={[styles.primaryButton, (!city || !state) && styles.buttonDisabled]}
        onPress={handleSaveLocation}
        disabled={!city || !state || isLoading}
        haptic="medium"
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Continue</Text>
        )}
      </HapticPressable>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="home" size={48} color={COLORS.primary} />
      </View>
      <Text style={styles.title}>Join a Neighborhood</Text>
      <Text style={styles.subtitle}>
        Connect with neighbors in {city} to share and borrow items
      </Text>

      {isLoadingNeighborhoods ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
      ) : neighborhoods.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No neighborhoods in {city} yet.</Text>
          <Text style={styles.emptySubtext}>Be the first to create one!</Text>
          <HapticPressable style={styles.createButton} onPress={handleCreateNeighborhood} haptic="medium">
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.createButtonText}>Create Neighborhood</Text>
          </HapticPressable>
        </View>
      ) : (
        <FlatList
          data={neighborhoods}
          keyExtractor={(item) => item.id}
          style={styles.list}
          renderItem={({ item }) => (
            <BlurCard style={styles.neighborhoodCard}>
              <View style={styles.neighborhoodRow}>
                <View style={styles.neighborhoodInfo}>
                  <Text style={styles.neighborhoodName}>{item.name}</Text>
                  <Text style={styles.neighborhoodStats}>
                    {item.memberCount} members · {item.listingCount} items
                  </Text>
                </View>
                {item.isMember ? (
                  <View style={styles.joinedBadge}>
                    <Ionicons name="checkmark" size={16} color={COLORS.primary} />
                    <Text style={styles.joinedText}>Joined</Text>
                  </View>
                ) : (
                  <HapticPressable
                    style={styles.joinButton}
                    onPress={() => handleJoinNeighborhood(item)}
                    disabled={isLoading}
                    haptic="medium"
                  >
                    <Text style={styles.joinButtonText}>Join</Text>
                  </HapticPressable>
                )}
              </View>
            </BlurCard>
          )}
          ListFooterComponent={
            <HapticPressable style={styles.createLinkButton} onPress={handleCreateNeighborhood} haptic="light">
              <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
              <Text style={styles.createLinkText}>Create a new neighborhood</Text>
            </HapticPressable>
          }
        />
      )}

      <HapticPressable
        style={styles.primaryButton}
        onPress={() => setStep(3)}
        haptic="medium"
      >
        <Text style={styles.primaryButtonText}>
          {joinedCommunity || neighborhoods.some(n => n.isMember) ? 'Continue' : 'Skip for now'}
        </Text>
      </HapticPressable>
    </View>
  );

  const renderStep3 = () => (
    <KeyboardAvoidingView
      style={styles.stepContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.iconContainer}>
        <Ionicons name="people" size={48} color={COLORS.primary} />
      </View>
      <Text style={styles.title}>Find Friends</Text>
      <Text style={styles.subtitle}>
        Add friends to share items just with people you know
      </Text>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name..."
          placeholderTextColor={COLORS.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {isSearching ? (
        <ActivityIndicator color={COLORS.primary} style={styles.loader} />
      ) : searchQuery.length >= 2 ? (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          style={styles.list}
          renderItem={({ item }) => (
            <BlurCard style={styles.friendCard}>
              <View style={styles.friendRow}>
                <Image
                  source={{ uri: item.profilePhotoUrl || 'https://via.placeholder.com/44' }}
                  style={styles.friendAvatar}
                />
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>{item.firstName} {item.lastName}</Text>
                  {item.city && <Text style={styles.friendLocation}>{item.city}, {item.state}</Text>}
                </View>
                {item.isFriend || addedFriends.includes(item.id) || item.requestPending ? (
                  <View style={styles.requestedBadge}>
                    <Text style={styles.requestedText}>
                      {item.isFriend ? 'Friends' : 'Requested'}
                    </Text>
                  </View>
                ) : (
                  <HapticPressable
                    style={styles.addButton}
                    onPress={() => handleAddFriend(item)}
                    haptic="light"
                  >
                    <Ionicons name="person-add" size={18} color="#fff" />
                  </HapticPressable>
                )}
              </View>
            </BlurCard>
          )}
          ListEmptyComponent={
            <Text style={styles.noResults}>No users found</Text>
          }
        />
      ) : (
        <View style={styles.searchPrompt}>
          <Ionicons name="search-outline" size={40} color={COLORS.gray[600]} />
          <Text style={styles.searchPromptText}>
            Enter at least 2 characters to search
          </Text>
        </View>
      )}

      <HapticPressable
        style={styles.primaryButton}
        onPress={handleFinish}
        haptic="medium"
      >
        <Text style={styles.primaryButtonText}>
          {addedFriends.length > 0 ? "Let's Go!" : 'Skip for now'}
        </Text>
      </HapticPressable>
    </KeyboardAvoidingView>
  );

  return (
    <View style={styles.container}>
      {/* Progress indicator */}
      <View style={styles.progress}>
        {[1, 2, 3].map((s) => (
          <View
            key={s}
            style={[
              styles.progressDot,
              s === step && styles.progressDotActive,
              s < step && styles.progressDotComplete,
            ]}
          />
        ))}
      </View>

      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}

      <ActionSheet
        isVisible={locationErrorSheet.visible}
        onClose={() => setLocationErrorSheet({ visible: false, title: '', message: '' })}
        title={locationErrorSheet.title}
        message={locationErrorSheet.message}
        actions={[
          { label: 'OK', onPress: () => {} },
        ]}
        cancelLabel="Dismiss"
      />

      <ActionSheet
        isVisible={genericErrorSheet.visible}
        onClose={() => setGenericErrorSheet({ visible: false, title: '', message: '' })}
        title={genericErrorSheet.title}
        message={genericErrorSheet.message}
        actions={[
          { label: 'OK', onPress: () => {} },
        ]}
        cancelLabel="Dismiss"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  progress: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingTop: 60,
    paddingBottom: SPACING.xl - SPACING.xs,
  },
  progressDot: {
    width: SPACING.sm,
    height: SPACING.sm,
    borderRadius: SPACING.xs,
    backgroundColor: COLORS.gray[700],
  },
  progressDotActive: {
    width: SPACING.xl,
    backgroundColor: COLORS.primary,
  },
  progressDotComplete: {
    backgroundColor: COLORS.primary,
  },
  stepContainer: {
    flex: 1,
    padding: SPACING.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: SPACING.xl,
  },
  title: {
    ...TYPOGRAPHY.h1,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xxl,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary + '15',
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.lg,
  },
  locationButtonText: {
    ...TYPOGRAPHY.button,
    fontSize: 16,
    color: COLORS.primary,
  },
  orText: {
    textAlign: 'center',
    color: COLORS.textMuted,
    ...TYPOGRAPHY.footnote,
    marginBottom: SPACING.lg,
  },
  inputRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  input: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    fontSize: 16,
    color: COLORS.text,
  },
  inputCity: {
    flex: 2,
  },
  inputState: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    padding: 18,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginTop: 'auto',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    ...TYPOGRAPHY.headline,
    fontSize: 18,
    color: '#fff',
  },
  loader: {
    marginTop: SPACING.xxl,
  },
  list: {
    flex: 1,
    marginBottom: SPACING.lg,
  },
  neighborhoodCard: {
    marginBottom: SPACING.sm,
    padding: SPACING.lg,
  },
  neighborhoodRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  neighborhoodInfo: {
    flex: 1,
  },
  neighborhoodName: {
    ...TYPOGRAPHY.button,
    fontSize: 16,
    color: COLORS.text,
  },
  neighborhoodStats: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  joinButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl - SPACING.xs,
    borderRadius: RADIUS.xl,
  },
  joinButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  joinedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  joinedText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    marginTop: SPACING.lg,
  },
  createButtonText: {
    color: '#fff',
    ...TYPOGRAPHY.button,
    fontSize: 16,
  },
  createLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    padding: SPACING.lg,
  },
  createLinkText: {
    color: COLORS.primary,
    ...TYPOGRAPHY.subheadline,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  emptySubtext: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  searchInput: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
  },
  friendCard: {
    marginBottom: SPACING.sm,
    padding: SPACING.md,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gray[700],
  },
  friendInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  friendName: {
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
    color: COLORS.text,
  },
  friendLocation: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestedBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceElevated,
  },
  requestedText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  searchPrompt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  searchPromptText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textMuted,
  },
  noResults: {
    textAlign: 'center',
    color: COLORS.textMuted,
    ...TYPOGRAPHY.footnote,
    marginTop: SPACING.xl,
  },
});
