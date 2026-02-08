import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import { Ionicons } from '../../components/Icon';
import HapticPressable from '../../components/HapticPressable';
import BlurCard from '../../components/BlurCard';
import SearchBar from '../../components/SearchBar';
import OnboardingProgress from '../../components/OnboardingProgress';
import ActionSheet from '../../components/ActionSheet';
import api from '../../services/api';
import { haptics } from '../../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../utils/config';

export default function OnboardingFriendsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const joinedCommunityId = route.params?.joinedCommunityId;

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addedFriends, setAddedFriends] = useState([]);

  // Suggested neighbors
  const [suggestedUsers, setSuggestedUsers] = useState([]);
  const [isLoadingSuggested, setIsLoadingSuggested] = useState(false);

  // Contact matching
  const [contactMatches, setContactMatches] = useState([]);
  const [phoneContacts, setPhoneContacts] = useState([]);
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);

  const [errorSheet, setErrorSheet] = useState({ visible: false, title: '', message: '' });

  useEffect(() => {
    if (joinedCommunityId) {
      fetchSuggestedUsers();
    }
  }, [joinedCommunityId]);

  const fetchSuggestedUsers = async () => {
    setIsLoadingSuggested(true);
    try {
      const data = await api.getSuggestedUsers(joinedCommunityId);
      setSuggestedUsers(data);
    } catch (error) {
      console.warn('Failed to fetch suggested users:', error);
    } finally {
      setIsLoadingSuggested(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) {
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
  }, [searchQuery]);

  const handleSyncContacts = async () => {
    setIsSyncingContacts(true);
    try {
      const { status, canAskAgain } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setErrorSheet({
          visible: true,
          title: 'Permission Required',
          message: canAskAgain
            ? 'Contact access is needed to find friends who are already on BorrowHood.'
            : 'Contact access was denied. Please enable it in Settings to find friends.',
        });
        if (!canAskAgain) {
          Linking.openSettings();
        }
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.FirstName, Contacts.Fields.LastName],
        sort: Contacts.SortTypes.FirstName,
      });

      // Build list of contacts with phone numbers
      const contactsWithPhone = data
        .filter(c => c.phoneNumbers && c.phoneNumbers.length > 0 && (c.firstName || c.lastName))
        .map(c => ({
          id: c.id,
          name: [c.firstName, c.lastName].filter(Boolean).join(' '),
          phone: c.phoneNumbers[0].number,
        }));

      setPhoneContacts(contactsWithPhone);

      const phoneNumbers = contactsWithPhone.map(c => c.phone);

      if (phoneNumbers.length === 0) {
        setErrorSheet({
          visible: true,
          title: 'No Contacts',
          message: 'No phone numbers found in your contacts.',
        });
        return;
      }

      const matches = await api.matchContacts(phoneNumbers);
      setContactMatches(matches);
    } catch (error) {
      console.error('Contact sync error:', error);
      setErrorSheet({ visible: true, title: 'Error', message: 'Failed to sync contacts.' });
    } finally {
      setIsSyncingContacts(false);
    }
  };

  const handleInviteFriends = async () => {
    try {
      await Share.share({
        message: 'Join me on BorrowHood! Borrow anything from your neighbors. Download it here: https://apps.apple.com/app/borrowhood/id6741188498',
      });
    } catch (error) {
      // User cancelled share
    }
  };

  const handleInviteContact = async (contact) => {
    try {
      await Share.share({
        message: `Hey ${contact.name.split(' ')[0]}! Join me on BorrowHood — borrow anything from your neighbors. Download it here: https://apps.apple.com/app/borrowhood/id6741188498`,
      });
    } catch (error) {
      // User cancelled share
    }
  };

  const handleAddFriend = async (user) => {
    try {
      await api.addFriend(user.id);
      setAddedFriends(prev => [...prev, user.id]);
      haptics.light();
    } catch (error) {
      setErrorSheet({ visible: true, title: 'Error', message: 'Failed to send friend request.' });
    }
  };

  const handleContinue = async () => {
    haptics.medium();
    try {
      await api.updateOnboardingStep(3);
    } catch (e) {}
    navigation.navigate('OnboardingPlan');
  };

  const isFriendOrAdded = (userId) =>
    addedFriends.includes(userId);

  const renderUserRow = (item) => (
    <BlurCard style={styles.friendCard} key={item.id}>
      <View style={styles.friendRow}>
        <Image
          source={{ uri: item.profilePhotoUrl || 'https://via.placeholder.com/44' }}
          style={styles.friendAvatar}
        />
        <View style={styles.friendInfo}>
          <Text style={styles.friendName}>{item.firstName} {item.lastName}</Text>
          {item.city && <Text style={styles.friendLocation}>{item.city}, {item.state}</Text>}
        </View>
        {item.isFriend || isFriendOrAdded(item.id) ? (
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
  );

  const renderContactRow = (contact) => (
    <View style={styles.contactRow} key={contact.id}>
      <View style={styles.contactAvatar}>
        <Text style={styles.contactInitial}>{contact.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.friendInfo}>
        <Text style={styles.friendName}>{contact.name}</Text>
      </View>
      <HapticPressable
        style={styles.inviteButton}
        onPress={() => handleInviteContact(contact)}
        haptic="light"
      >
        <Text style={styles.inviteButtonText}>Invite</Text>
      </HapticPressable>
    </View>
  );

  const showSearch = searchQuery.length >= 2;
  const showSuggested = !showSearch && suggestedUsers.length > 0;
  const showContactMatches = !showSearch && contactMatches.length > 0;
  const showPhoneContacts = !showSearch && phoneContacts.length > 0 && contactMatches.length === 0;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + SPACING.xl }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <OnboardingProgress currentStep={3} />

      <HapticPressable
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        haptic="light"
      >
        <Ionicons name="chevron-back" size={24} color={COLORS.text} />
      </HapticPressable>

      <View style={styles.stepContainer}>
        <View style={styles.iconContainer}>
          <Ionicons name="people" size={48} color={COLORS.primary} />
        </View>
        <Text style={styles.title}>Find Friends</Text>
        <Text style={styles.subtitle}>
          Add friends to share items just with people you know
        </Text>

        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name..."
          testID="Onboarding.Friends.searchBar"
        />

        {/* Action buttons */}
        {!showSearch && (
          <View style={styles.actionRow}>
            <HapticPressable
              style={styles.actionButton}
              onPress={handleSyncContacts}
              disabled={isSyncingContacts}
              haptic="medium"
              testID="Onboarding.Friends.syncContacts"
            >
              {isSyncingContacts ? (
                <ActivityIndicator color={COLORS.primary} size="small" />
              ) : (
                <Ionicons name="call-outline" size={20} color={COLORS.primary} />
              )}
              <Text style={styles.actionButtonText}>Sync Contacts</Text>
            </HapticPressable>

            <HapticPressable
              style={styles.actionButton}
              onPress={handleInviteFriends}
              haptic="light"
              testID="Onboarding.Friends.invite"
            >
              <Ionicons name="share-outline" size={20} color={COLORS.primary} />
              <Text style={styles.actionButtonText}>Invite Friends</Text>
            </HapticPressable>
          </View>
        )}

        {/* Search results */}
        {isSearching ? (
          <ActivityIndicator color={COLORS.primary} style={styles.loader} />
        ) : showSearch ? (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            style={styles.list}
            renderItem={({ item }) => renderUserRow(item)}
            ListEmptyComponent={
              <Text style={styles.noResults}>No users found</Text>
            }
          />
        ) : (
          <FlatList
            data={[
              ...(showContactMatches ? [{ type: 'header', key: 'contacts-header', title: 'From Your Contacts' }] : []),
              ...contactMatches.map(u => ({ ...u, type: 'user', key: `contact-${u.id}` })),
              ...(showSuggested ? [{ type: 'header', key: 'suggested-header', title: 'Your Neighbors' }] : []),
              ...suggestedUsers.map(u => ({ ...u, type: 'user', key: `suggested-${u.id}` })),
              ...(showPhoneContacts ? [{ type: 'header', key: 'invite-header', title: 'Invite to BorrowHood' }] : []),
              ...(!showSearch && contactMatches.length === 0 ? phoneContacts.slice(0, 50).map(c => ({ ...c, type: 'contact', key: `phone-${c.id}` })) : []),
            ]}
            keyExtractor={(item) => item.key || item.id}
            style={styles.list}
            renderItem={({ item }) => {
              if (item.type === 'header') {
                return (
                  <Text style={styles.sectionHeader}>{item.title}</Text>
                );
              }
              if (item.type === 'contact') {
                return renderContactRow(item);
              }
              return renderUserRow(item);
            }}
            ListEmptyComponent={
              isLoadingSuggested ? (
                <ActivityIndicator color={COLORS.primary} style={styles.loader} />
              ) : (
                <View style={styles.emptyPrompt}>
                  <Ionicons name="people-outline" size={40} color={COLORS.gray[600]} />
                  <Text style={styles.emptyText}>
                    Search for friends or sync your contacts to find them
                  </Text>
                </View>
              )
            }
          />
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.lg }]}>
        <HapticPressable
          style={styles.primaryButton}
          onPress={handleContinue}
          haptic="medium"
          testID="Onboarding.Friends.continue"
        >
          <Text style={styles.primaryButtonText}>
            {addedFriends.length > 0 ? 'Continue' : 'Skip for now'}
          </Text>
        </HapticPressable>
      </View>

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
    marginBottom: SPACING.xl,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary + '15',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  actionButtonText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: COLORS.primary,
  },
  sectionHeader: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  loader: {
    marginTop: SPACING.xxl,
  },
  list: {
    flex: 1,
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
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.gray[700],
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInitial: {
    ...TYPOGRAPHY.headline,
    color: COLORS.textSecondary,
  },
  inviteButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary + '20',
  },
  inviteButtonText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: COLORS.primary,
  },
  emptyPrompt: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl * 2,
    gap: SPACING.md,
  },
  emptyText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  noResults: {
    textAlign: 'center',
    color: COLORS.textMuted,
    ...TYPOGRAPHY.footnote,
    marginTop: SPACING.xl,
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
});
