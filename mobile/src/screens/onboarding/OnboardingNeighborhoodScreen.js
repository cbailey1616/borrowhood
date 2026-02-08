import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '../../components/Icon';
import HapticPressable from '../../components/HapticPressable';
import BlurCard from '../../components/BlurCard';
import ActionSheet from '../../components/ActionSheet';
import OnboardingProgress from '../../components/OnboardingProgress';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { haptics } from '../../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../utils/config';

export default function OnboardingNeighborhoodScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { refreshUser } = useAuth();

  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);
  const [coordinates, setCoordinates] = useState(null);

  const [neighborhoods, setNeighborhoods] = useState([]);
  const [isLoadingNeighborhoods, setIsLoadingNeighborhoods] = useState(false);
  const [joinedCommunity, setJoinedCommunity] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [locationSaved, setLocationSaved] = useState(false);

  // Create neighborhood sheet
  const [createSheet, setCreateSheet] = useState(false);
  const [neighborhoodName, setNeighborhoodName] = useState('');
  const [neighborhoodDesc, setNeighborhoodDesc] = useState('');
  const [neighborhoodRadius, setNeighborhoodRadius] = useState(1);

  // Error/overlap sheets
  const [errorSheet, setErrorSheet] = useState({ visible: false, title: '', message: '' });
  const [overlapSheet, setOverlapSheet] = useState({ visible: false, names: [] });

  useEffect(() => {
    requestLocation();
  }, []);

  const requestLocation = async () => {
    setIsGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationGranted(true);
        const location = await Location.getCurrentPositionAsync({});
        const coords = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
        setCoordinates(coords);

        const [address] = await Location.reverseGeocodeAsync(coords);
        if (address) {
          const detectedCity = address.city || address.subregion || '';
          const detectedState = address.region || '';
          setCity(detectedCity);
          setState(detectedState);

          // Auto-save location and fetch neighborhoods
          if (detectedCity && detectedState) {
            await api.updateProfile({
              city: detectedCity,
              state: detectedState,
              latitude: coords.latitude,
              longitude: coords.longitude,
            });
            await refreshUser();
            setLocationSaved(true);
            fetchNeighborhoods(coords);
          }
        }
      }
    } catch (error) {
      console.warn('Location error:', error);
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleSaveManualLocation = async () => {
    if (!city.trim() || !state.trim()) {
      setErrorSheet({ visible: true, title: 'Required', message: 'Please enter your city and state.' });
      return;
    }
    setIsLoading(true);
    try {
      await api.updateProfile({ city: city.trim(), state: state.trim() });
      await refreshUser();
      setLocationSaved(true);
      fetchNeighborhoods(null);
    } catch (error) {
      setErrorSheet({ visible: true, title: 'Error', message: 'Failed to save location.' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNeighborhoods = async (coords) => {
    setIsLoadingNeighborhoods(true);
    try {
      let data;
      if (coords) {
        data = await api.getNearbyNeighborhoods(coords.latitude, coords.longitude);
      } else {
        data = await api.getCommunities();
      }
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
      haptics.success();
    } catch (error) {
      setErrorSheet({ visible: true, title: 'Error', message: 'Failed to join neighborhood.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeaveNeighborhood = async (community) => {
    setIsLoading(true);
    try {
      await api.leaveCommunity(community.id);
      if (joinedCommunity?.id === community.id) setJoinedCommunity(null);
      setNeighborhoods(prev =>
        prev.map(n => n.id === community.id ? { ...n, isMember: false } : n)
      );
      haptics.light();
    } catch (error) {
      setErrorSheet({ visible: true, title: 'Error', message: 'Failed to leave neighborhood.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNeighborhood = () => {
    setNeighborhoodName('');
    setNeighborhoodDesc('');
    setNeighborhoodRadius(1);
    setCreateSheet(true);
  };

  const handleConfirmCreate = async () => {
    if (!neighborhoodName?.trim()) return;
    setCreateSheet(false);
    setIsLoading(true);
    try {
      const createData = {
        name: neighborhoodName.trim(),
        description: neighborhoodDesc.trim() || undefined,
      };
      if (coordinates) {
        createData.latitude = coordinates.latitude;
        createData.longitude = coordinates.longitude;
        createData.radius = neighborhoodRadius;
      }
      const result = await api.createCommunity(createData);
      setJoinedCommunity({ id: result.id, name: neighborhoodName.trim() });
      haptics.success();
      await refreshUser(); // Picks up isFounder
    } catch (error) {
      if (error.code === 'OVERLAP' || error.message?.includes('already exists')) {
        // Show overlap suggestion
        try {
          const parsed = JSON.parse(error.message);
          setOverlapSheet({ visible: true, names: parsed.overlapping || [] });
        } catch {
          setOverlapSheet({ visible: true, names: [] });
        }
      } else {
        setErrorSheet({ visible: true, title: 'Error', message: error.message || 'Failed to create neighborhood.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinue = async () => {
    haptics.medium();
    try {
      await api.updateOnboardingStep(2);
    } catch (e) {}
    navigation.navigate('OnboardingFriends', {
      joinedCommunityId: joinedCommunity?.id || null,
    });
  };

  const showLocationForm = !locationSaved && !isGettingLocation;
  const showNeighborhoods = locationSaved;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + SPACING.xl }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <OnboardingProgress currentStep={2} />

      <HapticPressable
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        haptic="light"
      >
        <Ionicons name="chevron-back" size={24} color={COLORS.text} />
      </HapticPressable>

      <View style={styles.stepContainer}>
        <View style={styles.iconContainer}>
          <Ionicons name="home" size={48} color={COLORS.primary} />
        </View>
        <Text style={styles.title}>Join a Neighborhood</Text>
        <Text style={styles.subtitle}>
          {showNeighborhoods
            ? `Connect with neighbors in ${city} to share and borrow items`
            : 'We\'ll find neighborhoods near you'}
        </Text>

        {isGettingLocation && (
          <View style={styles.detectingContainer}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.detectingText}>Detecting your location...</Text>
          </View>
        )}

        {showLocationForm && (
          <>
            <HapticPressable
              style={styles.locationButton}
              onPress={requestLocation}
              haptic="medium"
              testID="Onboarding.Neighborhood.useLocation"
            >
              <Ionicons name="navigate" size={20} color={COLORS.primary} />
              <Text style={styles.locationButtonText}>Use My Location</Text>
            </HapticPressable>

            <Text style={styles.orText}>or enter manually</Text>

            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, styles.inputCity]}
                placeholder="City"
                placeholderTextColor={COLORS.textMuted}
                value={city}
                onChangeText={setCity}
                testID="Onboarding.Neighborhood.cityInput"
              />
              <TextInput
                style={[styles.input, styles.inputState]}
                placeholder="State"
                placeholderTextColor={COLORS.textMuted}
                value={state}
                onChangeText={setState}
                maxLength={2}
                autoCapitalize="characters"
                testID="Onboarding.Neighborhood.stateInput"
              />
            </View>

            <HapticPressable
              style={[styles.saveLocationButton, (!city || !state) && styles.buttonDisabled]}
              onPress={handleSaveManualLocation}
              disabled={!city || !state || isLoading}
              haptic="medium"
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveLocationText}>Find Neighborhoods</Text>
              )}
            </HapticPressable>
          </>
        )}

        {showNeighborhoods && (
          <>
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
                          {item.distanceMiles > 0 ? ` · ${item.distanceMiles.toFixed(1)} mi` : ''}
                        </Text>
                      </View>
                      {item.isMember ? (
                        <HapticPressable
                          style={styles.joinedBadge}
                          onPress={() => handleLeaveNeighborhood(item)}
                          disabled={isLoading}
                          haptic="light"
                        >
                          <Ionicons name="checkmark" size={16} color={COLORS.primary} />
                          <Text style={styles.joinedText}>Joined</Text>
                        </HapticPressable>
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
          </>
        )}
      </View>

      {showNeighborhoods && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.lg }]}>
          <HapticPressable
            style={styles.primaryButton}
            onPress={handleContinue}
            haptic="medium"
            testID="Onboarding.Neighborhood.continue"
          >
            <Text style={styles.primaryButtonText}>
              {joinedCommunity || neighborhoods.some(n => n.isMember) ? 'Continue' : 'Skip for now'}
            </Text>
          </HapticPressable>
        </View>
      )}

      {/* Create Neighborhood Modal */}
      <Modal
        visible={createSheet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCreateSheet(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <HapticPressable onPress={() => setCreateSheet(false)} haptic="light">
              <Text style={styles.modalCancel}>Cancel</Text>
            </HapticPressable>
            <Text style={styles.modalTitle}>Create Neighborhood</Text>
            <View style={{ width: 60 }} />
          </View>
          <View style={styles.sheetContent}>
            <TextInput
              style={styles.sheetInput}
              placeholder="Neighborhood name"
              placeholderTextColor={COLORS.textMuted}
              value={neighborhoodName}
              onChangeText={setNeighborhoodName}
              autoFocus
            />
            <TextInput
              style={[styles.sheetInput, { height: 72, textAlignVertical: 'top' }]}
              placeholder="Description (optional)"
              placeholderTextColor={COLORS.textMuted}
              value={neighborhoodDesc}
              onChangeText={setNeighborhoodDesc}
              multiline
            />
            {coordinates && (
              <View style={styles.radiusRow}>
                <Text style={styles.radiusLabel}>Radius: {neighborhoodRadius} mi</Text>
                <View style={styles.radiusButtons}>
                  {[0.25, 0.5, 1, 2].map(r => (
                    <HapticPressable
                      key={r}
                      style={[styles.radiusChip, neighborhoodRadius === r && styles.radiusChipActive]}
                      onPress={() => setNeighborhoodRadius(r)}
                      haptic="light"
                    >
                      <Text style={[styles.radiusChipText, neighborhoodRadius === r && styles.radiusChipTextActive]}>
                        {r} mi
                      </Text>
                    </HapticPressable>
                  ))}
                </View>
              </View>
            )}
            <HapticPressable
              style={[styles.primaryButton, !neighborhoodName?.trim() && styles.buttonDisabled]}
              onPress={handleConfirmCreate}
              disabled={!neighborhoodName?.trim()}
              haptic="medium"
            >
              <Text style={styles.primaryButtonText}>Create</Text>
            </HapticPressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Overlap Sheet */}
      <ActionSheet
        isVisible={overlapSheet.visible}
        onClose={() => setOverlapSheet({ visible: false, names: [] })}
        title="Neighborhood Already Exists"
        message={`A neighborhood already exists in this area${overlapSheet.names.length > 0 ? `: ${overlapSheet.names.join(', ')}` : ''}. Would you like to join it instead?`}
        actions={[
          { label: 'Join Existing', onPress: () => {
            // Refresh the list so user can join existing
            if (coordinates) fetchNeighborhoods(coordinates);
            else fetchNeighborhoods(null);
          }},
          { label: 'Try Different Name', onPress: () => setCreateSheet(true) },
        ]}
        cancelLabel="Cancel"
      />

      {/* Error Sheet */}
      <ActionSheet
        isVisible={errorSheet.visible}
        onClose={() => setErrorSheet({ visible: false, title: '', message: '' })}
        title={errorSheet.title}
        message={errorSheet.message}
        actions={[{ label: 'OK', onPress: () => {} }]}
        cancelLabel="Dismiss"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backButton: {
    position: 'absolute',
    top: 56,
    left: SPACING.lg,
    zIndex: 10,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
  detectingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.xl,
  },
  detectingText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
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
  inputCity: { flex: 2 },
  inputState: { flex: 1 },
  saveLocationButton: {
    backgroundColor: COLORS.primary,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  saveLocationText: {
    ...TYPOGRAPHY.button,
    color: '#fff',
  },
  buttonDisabled: { opacity: 0.5 },
  loader: { marginTop: SPACING.xxl },
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
  neighborhoodInfo: { flex: 1 },
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
  footer: {
    paddingHorizontal: SPACING.xl,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    padding: 18,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    ...TYPOGRAPHY.headline,
    fontSize: 18,
    color: '#fff',
  },
  // Modal content
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
  },
  modalCancel: {
    ...TYPOGRAPHY.body,
    color: COLORS.primary,
  },
  modalTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  sheetContent: {
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  sheetInput: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    fontSize: 16,
    color: COLORS.text,
  },
  radiusRow: {
    gap: SPACING.sm,
  },
  radiusLabel: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  radiusButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  radiusChip: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceElevated,
  },
  radiusChipActive: {
    backgroundColor: COLORS.primary,
  },
  radiusChipText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  radiusChipTextActive: {
    color: '#fff',
  },
});
