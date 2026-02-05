import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { COLORS } from '../utils/config';

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

  const handleGetLocation = async () => {
    setIsGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please enter your location manually.');
        setIsGettingLocation(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const [address] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (address) {
        setCity(address.city || address.subregion || '');
        setState(address.region || '');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not get your location. Please enter manually.');
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleSaveLocation = async () => {
    if (!city.trim() || !state.trim()) {
      Alert.alert('Required', 'Please enter your city and state.');
      return;
    }

    setIsLoading(true);
    try {
      await api.updateProfile({ city: city.trim(), state: state.trim() });
      await refreshUser();
      setStep(2);
      fetchNeighborhoods();
    } catch (error) {
      Alert.alert('Error', 'Failed to save location.');
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
      Alert.alert('Error', 'Failed to join neighborhood.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNeighborhood = async () => {
    Alert.prompt(
      'Create Neighborhood',
      'Enter a name for your neighborhood:',
      async (name) => {
        if (!name?.trim()) return;
        setIsLoading(true);
        try {
          const result = await api.createCommunity({ name: name.trim() });
          setJoinedCommunity({ id: result.id, name: name.trim() });
          setStep(3);
        } catch (error) {
          Alert.alert('Error', error.message || 'Failed to create neighborhood.');
        } finally {
          setIsLoading(false);
        }
      },
      'plain-text'
    );
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
      Alert.alert('Error', 'Failed to send friend request.');
    }
  };

  const handleFinish = async () => {
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

      <TouchableOpacity
        style={styles.locationButton}
        onPress={handleGetLocation}
        disabled={isGettingLocation}
      >
        {isGettingLocation ? (
          <ActivityIndicator color={COLORS.primary} />
        ) : (
          <>
            <Ionicons name="navigate" size={20} color={COLORS.primary} />
            <Text style={styles.locationButtonText}>Use My Location</Text>
          </>
        )}
      </TouchableOpacity>

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

      <TouchableOpacity
        style={[styles.primaryButton, (!city || !state) && styles.buttonDisabled]}
        onPress={handleSaveLocation}
        disabled={!city || !state || isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Continue</Text>
        )}
      </TouchableOpacity>
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
          <TouchableOpacity style={styles.createButton} onPress={handleCreateNeighborhood}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.createButtonText}>Create Neighborhood</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={neighborhoods}
          keyExtractor={(item) => item.id}
          style={styles.list}
          renderItem={({ item }) => (
            <View style={styles.neighborhoodCard}>
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
                <TouchableOpacity
                  style={styles.joinButton}
                  onPress={() => handleJoinNeighborhood(item)}
                  disabled={isLoading}
                >
                  <Text style={styles.joinButtonText}>Join</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          ListFooterComponent={
            <TouchableOpacity style={styles.createLinkButton} onPress={handleCreateNeighborhood}>
              <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
              <Text style={styles.createLinkText}>Create a new neighborhood</Text>
            </TouchableOpacity>
          }
        />
      )}

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => setStep(3)}
      >
        <Text style={styles.primaryButtonText}>
          {joinedCommunity || neighborhoods.some(n => n.isMember) ? 'Continue' : 'Skip for now'}
        </Text>
      </TouchableOpacity>
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
            <View style={styles.friendCard}>
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
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => handleAddFriend(item)}
                >
                  <Ionicons name="person-add" size={18} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
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

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleFinish}
      >
        <Text style={styles.primaryButtonText}>
          {addedFriends.length > 0 ? "Let's Go!" : 'Skip for now'}
        </Text>
      </TouchableOpacity>
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
    gap: 8,
    paddingTop: 60,
    paddingBottom: 20,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.gray[700],
  },
  progressDotActive: {
    width: 24,
    backgroundColor: COLORS.primary,
  },
  progressDotComplete: {
    backgroundColor: COLORS.primary,
  },
  stepContainer: {
    flex: 1,
    padding: 24,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary + '15',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  locationButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  orText: {
    textAlign: 'center',
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.gray[700],
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
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 'auto',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  loader: {
    marginTop: 32,
  },
  list: {
    flex: 1,
    marginBottom: 16,
  },
  neighborhoodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  neighborhoodInfo: {
    flex: 1,
  },
  neighborhoodName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  neighborhoodStats: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  joinButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  joinButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  joinedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  joinedText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  createLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  createLinkText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.gray[700],
  },
  searchInput: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gray[700],
  },
  friendInfo: {
    flex: 1,
    marginLeft: 12,
  },
  friendName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  friendLocation: {
    fontSize: 13,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: COLORS.gray[800],
  },
  requestedText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  searchPrompt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  searchPromptText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  noResults: {
    textAlign: 'center',
    color: COLORS.textMuted,
    marginTop: 24,
  },
});
