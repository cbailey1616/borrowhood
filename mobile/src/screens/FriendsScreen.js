import TextInput from '../components/AppTextInput';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
  ActivityIndicator,
  Linking,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import { inviteToAlpha } from '../utils/alphaInvite';
import { useError } from '../context/ErrorContext';
import { Ionicons } from '../components/Icon';
import HeroIcon from '../components/HeroIcon';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import SegmentedControl from '../components/SegmentedControl';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function FriendsScreen({ navigation, route }) {
  const { showError } = useError();
  const [activeTab, setActiveTab] = useState(route.params?.initialTab || 'friends'); // 'friends', 'requests', 'contacts', or 'search'
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [contactMatches, setContactMatches] = useState([]);
  const [nonUserContacts, setNonUserContacts] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [contactsFetched, setContactsFetched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [addingId, setAddingId] = useState(null);
  const [respondingId, setRespondingId] = useState(null);
  const [contactsPermission, setContactsPermission] = useState(null);
  const [removeFriendSheetVisible, setRemoveFriendSheetVisible] = useState(false);
  const [addFriendsVisible, setAddFriendsVisible] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const searchInputRef = useRef(null);
  const switchTab = tab => { setSearch(''); setActiveTab(tab); };
  const findingFriends = activeTab === 'contacts' || activeTab === 'search';

  const fetchFriends = useCallback(async () => {
    try {
      const data = await api.getFriends();
      setFriends(data);
    } catch (error) {
      console.error('Failed to fetch friends:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const fetchFriendRequests = useCallback(async () => {
    try {
      const data = await api.getFriendRequests();
      setFriendRequests(data);
    } catch (error) {
      console.error('Failed to fetch friend requests:', error);
    }
  }, []);

  const fetchContactMatches = useCallback(async () => {
    setIsLoadingContacts(true);
    try {
      // Check current permission without prompting
      let { status } = await Contacts.getPermissionsAsync();

      // If undetermined, show the system prompt
      if (status === 'undetermined') {
        const result = await Contacts.requestPermissionsAsync();
        status = result.status;
      }

      setContactsPermission(status);

      if (status !== 'granted') {
        setIsLoadingContacts(false);
        setContactsFetched(true);
        return;
      }

      // Get contacts with phone numbers
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });

      if (data.length === 0) {
        setIsLoadingContacts(false);
        setContactsFetched(true);
        return;
      }

      // Extract all phone numbers
      const phoneNumbers = [];
      const contactMap = new Map(); // Map phone -> contact info
      const allContacts = []; // All contacts with a phone for invite

      data.forEach(contact => {
        if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
          const firstPhone = contact.phoneNumbers[0].number;
          const contactInfo = {
            name: contact.name || 'Unknown',
            phone: firstPhone,
          };

          contact.phoneNumbers.forEach(phone => {
            const digits = phone.number.replace(/\D/g, '');
            const normalized = digits.slice(-10);
            if (normalized.length >= 7) {
              phoneNumbers.push(phone.number);
              contactMap.set(normalized, contactInfo);
            }
          });

          // Always include contacts with any phone number for inviting
          allContacts.push(contactInfo);
        }
      });

      // Show all phone contacts immediately as invite-able
      setNonUserContacts(allContacts);

      // Then try to find matches on server
      let matches = [];
      try {
        if (phoneNumbers.length > 0) {
          matches = await api.matchContacts(phoneNumbers);
        }
      } catch (err) {
        console.error('Server contact match failed:', err);
        // Phone contacts still show even if server match fails
      }

      // Add contact name to matches
      const matchesWithNames = matches.map(m => ({
        ...m,
        contactName: contactMap.get(m.matchedPhone)?.name,
      }));

      setContactMatches(matchesWithNames);

      // Update non-user contacts by removing matched Borrowhood users
      if (matches.length > 0) {
        const matchedPhones = new Set(matches.map(m => m.matchedPhone));
        const nonUsers = allContacts.filter(contact => {
          const digits = contact.phone.replace(/\D/g, '').slice(-10);
          return !matchedPhones.has(digits);
        });
        setNonUserContacts(nonUsers);
      }

    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    } finally {
      setIsLoadingContacts(false);
      setContactsFetched(true);
    }
  }, []);

  useEffect(() => {
    fetchFriends();
    fetchFriendRequests();
  }, [fetchFriends, fetchFriendRequests]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchFriends();
      fetchFriendRequests();
      // Re-check contacts permission when returning from Settings
      if (activeTab === 'contacts') {
        setContactsFetched(false);
        fetchContactMatches();
      }
    });
    return unsubscribe;
  }, [navigation, fetchFriends, fetchFriendRequests, activeTab, fetchContactMatches]);

  // Fetch contacts when switching to contacts tab — always re-check permission
  useEffect(() => {
    if (activeTab === 'contacts') {
      setContactsFetched(false);
      fetchContactMatches();
    }
  }, [activeTab]);

  // Auto-focus search input when switching to search tab
  useEffect(() => {
    if (activeTab === 'search') {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [activeTab]);

  // Search for users
  useEffect(() => {
    if (activeTab !== 'search' || search.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    const timeoutId = setTimeout(async () => {
      try {
        const results = await api.searchUsers(search);
        if (!cancelled) setSearchResults(results);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 300);

    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [search, activeTab]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchFriends();
    fetchFriendRequests();
    if (activeTab === 'contacts') {
      setContactsFetched(false); // Allow refetch on manual pull-to-refresh
      fetchContactMatches();
    }
  };

  const handleAcceptRequest = async (request) => {
    setRespondingId(request.requestId);
    try {
      await api.acceptFriendRequest(request.requestId);
      setFriendRequests(prev => prev.filter(r => r.requestId !== request.requestId));
      fetchFriends(); // Refresh friends list
      haptics.success();
    } catch (error) {
      haptics.error();
    } finally {
      setRespondingId(null);
    }
  };

  const handleDeclineRequest = async (request) => {
    setRespondingId(request.requestId);
    try {
      await api.declineFriendRequest(request.requestId);
      setFriendRequests(prev => prev.filter(r => r.requestId !== request.requestId));
    } catch (error) {
      haptics.error();
    } finally {
      setRespondingId(null);
    }
  };

  // Memoize combined contacts list to prevent re-renders
  const contactsData = useMemo(() => {
    // Add stable keys to non-user contacts
    const inviteContacts = nonUserContacts.map((contact, idx) => ({
      ...contact,
      _inviteKey: `invite-${contact.phone?.replace(/\D/g, '').slice(-10) || idx}`,
    }));
    // Add a separator header between matched and invite sections
    const sections = [...contactMatches];
    if (contactMatches.length > 0 && inviteContacts.length > 0) {
      sections.push({ _sectionHeader: 'Invite Your Contacts', _inviteKey: '_section-header' });
    }
    sections.push(...inviteContacts);
    return sections;
  }, [contactMatches, nonUserContacts]);

  const handleAddFriend = async (user) => {
    setAddingId(user.id);
    try {
      const result = await api.addFriend(user.id);
      if (result.status === 'accepted') {
        // They had already requested us, so we're now friends
        setSearchResults(prev =>
          prev.map(u => u.id === user.id ? { ...u, isFriend: true, requestPending: false } : u)
        );
        setContactMatches(prev =>
          prev.map(u => u.id === user.id ? { ...u, isFriend: true, requestPending: false } : u)
        );
        fetchFriends();
        fetchFriendRequests();
        haptics.success();
      } else {
        // Request sent, waiting for them to accept
        setSearchResults(prev =>
          prev.map(u => u.id === user.id ? { ...u, requestPending: true } : u)
        );
        setContactMatches(prev =>
          prev.map(u => u.id === user.id ? { ...u, requestPending: true } : u)
        );
        haptics.success();
      }
    } catch (error) {
      haptics.error();
    } finally {
      setAddingId(null);
    }
  };

  const handleRemoveFriend = async () => {
    if (!selectedFriend) return;
    try {
      await api.removeFriend(selectedFriend.id);
      setFriends(prev => prev.filter(f => f.id !== selectedFriend.id));
    } catch (error) {
      haptics.error();
    }
  };

  const handleInvite = async (contact) => {
    try {
      await inviteToAlpha(contact?.phone);
    } catch {
      showError('Could not open invitation', 'Please try again.');
    }
  };

  const openSettings = () => {
    Linking.openSettings();
  };

  const filteredFriends = friends.filter(friend =>
    `${friend.firstName} ${friend.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  const renderFriendItem = ({ item }) => (
    <HapticPressable
      haptic="light"
      style={styles.card}
      onPress={() => navigation.navigate('UserProfile', { id: item.id })}
    >
      <FriendAvatar uri={item.profilePhotoUrl} />
      <View style={styles.info}>
        <Text style={styles.name}>{item.firstName} {item.lastName}</Text>
        {item.totalTransactions > 0 && (
          <Text style={styles.subtitle}>{item.totalTransactions} completed exchanges</Text>
        )}
      </View>
      <HapticPressable
        haptic="light"
        style={styles.removeButton}
        accessibilityRole="button" accessibilityLabel={`Manage friendship with ${item.firstName}`}
        onPress={() => {
          setSelectedFriend(item);
          setRemoveFriendSheetVisible(true);
        }}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.primary} />
      </HapticPressable>
    </HapticPressable>
  );

  const renderContactItem = ({ item }) => (
    <HapticPressable
      haptic="light"
      style={styles.card}
      onPress={() => navigation.navigate('UserProfile', { id: item.id })}
    >
      <FriendAvatar uri={item.profilePhotoUrl} />
      <View style={styles.info}>
        <Text style={styles.name}>{item.firstName} {item.lastName}</Text>
        {item.contactName && (
          <Text style={styles.subtitle}>In your contacts as "{item.contactName}"</Text>
        )}
      </View>
      {item.isFriend ? (
        <View style={styles.friendBadge}>
          <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
        </View>
      ) : item.requestPending ? (
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingText}>Requested</Text>
        </View>
      ) : (
        <HapticPressable
          haptic="medium"
          style={styles.addButton}
          accessibilityRole="button" accessibilityLabel={`Add ${item.firstName} as a friend`}
          onPress={() => handleAddFriend(item)}
          disabled={addingId === item.id}
        >
          {addingId === item.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="person-add" size={18} color="#fff" />
          )}
        </HapticPressable>
      )}
    </HapticPressable>
  );

  const renderSearchItem = ({ item }) => (
    <HapticPressable
      haptic="light"
      style={styles.card}
      onPress={() => navigation.navigate('UserProfile', { id: item.id })}
    >
      <FriendAvatar uri={item.profilePhotoUrl} />
      <View style={styles.info}>
        <Text style={styles.name}>{item.firstName} {item.lastName}</Text>
        {item.city && item.state && (
          <Text style={styles.subtitle}>{item.city}, {item.state}</Text>
        )}
      </View>
      {item.isFriend ? (
        <View style={styles.friendBadge}>
          <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
        </View>
      ) : item.requestPending ? (
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingText}>Requested</Text>
        </View>
      ) : (
        <HapticPressable
          haptic="medium"
          style={styles.addButton}
          accessibilityRole="button" accessibilityLabel={`Add ${item.firstName} as a friend`}
          onPress={() => handleAddFriend(item)}
          disabled={addingId === item.id}
        >
          {addingId === item.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="person-add" size={18} color="#fff" />
          )}
        </HapticPressable>
      )}
    </HapticPressable>
  );

  const renderInviteItem = ({ item }) => (
    <View style={styles.card}>
      <View style={[styles.avatar, styles.avatarPlaceholder]}>
        <Ionicons name="person" size={24} color={COLORS.primary} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.subtitle}>Not on Borrowhood yet</Text>
      </View>
      <HapticPressable
        haptic="light"
        style={styles.inviteButton}
        onPress={() => handleInvite(item)}
      >
        <Text style={styles.inviteButtonText}>Invite</Text>
      </HapticPressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.navigationArea}>
        {findingFriends ? (
          <View style={styles.findHeader}>
            <HapticPressable accessibilityRole="button" accessibilityLabel="Back to friends" onPress={() => switchTab('friends')} style={styles.backToFriends}>
              <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
              <Text style={styles.backText}>Friends</Text>
            </HapticPressable>
            <Text accessibilityRole="header" style={styles.findTitle}>{activeTab === 'contacts' ? 'From contacts' : 'Find people'}</Text>
          </View>
        ) : (
          <>
            <SegmentedControl segments={['Friends', friendRequests.length ? `Requests (${friendRequests.length})` : 'Requests']}
              selectedIndex={activeTab === 'requests' ? 1 : 0} onIndexChange={index => switchTab(index === 0 ? 'friends' : 'requests')} testID="Friends.tabs" />
            <HapticPressable accessibilityRole="button" accessibilityLabel="Add friends" onPress={() => setAddFriendsVisible(true)} style={styles.addFriendsButton}>
              <Ionicons name="person-add" size={24} color={COLORS.background} />
              <Text style={styles.addFriendsText}>Add friends</Text>
            </HapticPressable>
          </>
        )}
      </View>

      {/* Search bar for friends and search tabs */}
      {((activeTab === 'friends' && friends.length > 0) || activeTab === 'search') && (
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={18} color={COLORS.textMuted} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder={activeTab === 'friends' ? "Search friends..." : "Search by name..."}
              placeholderTextColor={COLORS.textMuted}
              testID="Friends.search.input"
              value={search}
              onChangeText={setSearch}
              autoFocus={activeTab === 'search'}
            />
            {search.length > 0 && (
              <HapticPressable haptic="light" onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
              </HapticPressable>
            )}
          </View>
        </View>
      )}

      {activeTab === 'friends' && (
        <FlatList keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
          data={filteredFriends}
          renderItem={renderFriendItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          ListHeaderComponent={filteredFriends.length > 0 ? <Text style={styles.sectionHeader}>{friends.length} friend{friends.length === 1 ? '' : 's'}</Text> : null}
          ListEmptyComponent={
            !isLoading && (
              <View style={styles.emptyContainer}>
                <HeroIcon icon="people-outline" size={80} />
                <Text style={styles.emptyTitle}>{search ? 'No matching friends' : 'Good neighbors start with a hello'}</Text>
                <Text style={styles.emptySubtitle}>
                  {search ? 'Try another name.' : 'Add people you know to start sharing together.'}
                </Text>
              </View>
            )
          }
        />
      )}

      {activeTab === 'requests' && (
        <FlatList keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
          data={friendRequests}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <HapticPressable
                haptic="light"
                style={styles.cardContent}
                onPress={() => navigation.navigate('UserProfile', { id: item.id })}
              >
                <FriendAvatar uri={item.profilePhotoUrl} />
                <View style={styles.info}>
                  <Text style={styles.name}>{item.firstName} {item.lastName}</Text>
                  <Text style={styles.subtitle}>Wants to be your friend</Text>
                </View>
              </HapticPressable>
              <View style={styles.requestActions}>
                <HapticPressable
                  haptic="medium"
                  style={styles.acceptButton}
                  accessibilityRole="button" accessibilityLabel={`Accept request from ${item.firstName}`}
                  onPress={() => handleAcceptRequest(item)}
                  disabled={respondingId === item.requestId}
                >
                  {respondingId === item.requestId ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  )}
                </HapticPressable>
                <HapticPressable
                  haptic="light"
                  style={styles.declineButton}
                  accessibilityRole="button" accessibilityLabel={`Decline request from ${item.firstName}`}
                  onPress={() => handleDeclineRequest(item)}
                  disabled={respondingId === item.requestId}
                >
                  <Ionicons name="close" size={20} color={COLORS.textMuted} />
                </HapticPressable>
              </View>
            </View>
          )}
          keyExtractor={(item) => item.requestId}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <HeroIcon icon="mail-outline" size={80} />
              <Text style={styles.emptyTitle}>No pending requests</Text>
              <Text style={styles.emptySubtitle}>
                When someone sends you a friend request, it will appear here
              </Text>
            </View>
          }
        />
      )}

      {activeTab === 'contacts' && (
        <>
          {contactsPermission !== null && contactsPermission !== 'granted' ? (
            <View style={styles.emptyContainer}>
              <HeroIcon icon="lock-closed-outline" size={80} />
              <Text style={styles.emptyTitle}>Contacts Access Needed</Text>
              <Text style={styles.emptySubtitle}>
                Allow access to your contacts to find friends on Borrowhood and invite others
              </Text>
              <HapticPressable haptic="medium" style={styles.settingsButton} onPress={openSettings}>
                <Text style={styles.settingsButtonText}>Open Settings</Text>
              </HapticPressable>
            </View>
          ) : isLoadingContacts || (!contactsFetched && contactsPermission === null) ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.emptySubtitle}>Checking your contacts...</Text>
            </View>
          ) : (
            <FlatList keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
              data={contactsData}
              renderItem={({ item }) =>
                item._sectionHeader ? (
                  <Text style={styles.sectionHeader}>{item._sectionHeader}</Text>
                ) : item.id ? renderContactItem({ item }) : renderInviteItem({ item })
              }
              keyExtractor={(item) => item.id || item._inviteKey}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={onRefresh}
                  tintColor={COLORS.primary}
                />
              }
              ListHeaderComponent={
                contactMatches.length > 0 ? (
                  <Text style={styles.sectionHeader}>On Borrowhood</Text>
                ) : nonUserContacts.length > 0 ? (
                  <Text style={styles.sectionHeader}>Invite Your Contacts</Text>
                ) : null
              }
              ListFooterComponent={
                <HapticPressable haptic="light" style={styles.updateAccessButton} onPress={openSettings}>
                  <Ionicons name="settings-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.updateAccessText}>Not seeing all your contacts? Update access in Settings</Text>
                </HapticPressable>
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <HeroIcon icon="people-outline" size={80} />
                  <Text style={styles.emptyTitle}>No contacts found</Text>
                  <Text style={styles.emptySubtitle}>
                    We couldn't find any contacts with phone numbers. You may need to grant full contacts access in Settings.
                  </Text>
                  <HapticPressable haptic="medium" style={styles.settingsButton} onPress={openSettings}>
                    <Text style={styles.settingsButtonText}>Open Settings</Text>
                  </HapticPressable>
                </View>
              }
            />
          )}
        </>
      )}

      {activeTab === 'search' && (
        <FlatList keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
          data={searchResults}
          renderItem={renderSearchItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              {isSearching ? (
                <ActivityIndicator size="large" color={COLORS.primary} />
              ) : search.length < 2 ? (
                <>
                  <HeroIcon icon="search-outline" size={80} />
                  <Text style={styles.emptyTitle}>Search for people</Text>
                  <Text style={styles.emptySubtitle}>
                    Enter at least 2 characters to search
                  </Text>
                </>
              ) : (
                <>
                  <HeroIcon icon="person-outline" size={80} />
                  <Text style={styles.emptyTitle}>No results found</Text>
                  <Text style={styles.emptySubtitle}>
                    Try a different search term
                  </Text>
                </>
              )}
            </View>
          }
        />
      )}

      <ActionSheet
        isVisible={addFriendsVisible}
        onClose={() => setAddFriendsVisible(false)}
        title="Add friends"
        actions={[
          { label: 'From contacts', icon: <Ionicons name="people" size={30} color={COLORS.primary} />, onPress: () => switchTab('contacts') },
          { label: 'Search people', icon: <Ionicons name="search" size={30} color={COLORS.primary} />, onPress: () => switchTab('search') },
          { label: 'Invite by text', icon: <Ionicons name="paper-plane" size={30} color={COLORS.primary} />, onPress: () => handleInvite() },
        ]}
      />

      <ActionSheet
        isVisible={removeFriendSheetVisible}
        onClose={() => setRemoveFriendSheetVisible(false)}
        title="Remove Friend"
        message={`Remove ${selectedFriend?.firstName} from your friends?`}
        actions={[
          {
            label: 'Remove',
            destructive: true,
            onPress: handleRemoveFriend,
          },
        ]}
      />
    </View>
  );
}

function FriendAvatar({ uri }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  return uri && !failed ? <Image source={{ uri }} style={styles.avatar} onError={() => setFailed(true)} /> : (
    <View style={[styles.avatar, styles.avatarPlaceholder]}>
      <Ionicons name="person" size={28} color={COLORS.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  navigationArea: { padding: SPACING.lg, gap: SPACING.md },
  addFriendsButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: RADIUS.md },
  addFriendsText: { ...TYPOGRAPHY.headline, color: COLORS.background },
  findHeader: { gap: SPACING.md },
  backToFriends: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, minHeight: 44, alignSelf: 'flex-start' },
  backText: { ...TYPOGRAPHY.subheadline, color: COLORS.primary },
  findTitle: { ...TYPOGRAPHY.h2, color: COLORS.text },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  searchContainer: {
    padding: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.separator,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: 16,
    color: COLORS.text,
  },
  listContent: {
    padding: SPACING.lg,
    paddingTop: SPACING.sm,
    flexGrow: 1,
  },
  sectionHeader: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    marginTop: SPACING.xs,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: COLORS.primaryMuted,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
  name: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
  },
  subtitle: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  removeButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.separator,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendBadge: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.separator,
  },
  pendingText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.md,
  },
  requestActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  acceptButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.separator,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary + '20',
  },
  inviteButtonText: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.primary,
  },
  updateAccessButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    marginTop: SPACING.md,
  },
  updateAccessText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.primary,
  },
  settingsButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.sm + 2,
    marginTop: SPACING.xl,
  },
  settingsButtonText: {
    ...TYPOGRAPHY.button,
    color: '#fff',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    textAlign: 'center',
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
    paddingHorizontal: SPACING.xxl,
  },
});
