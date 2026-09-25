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
import { inviteMessage, inviteToBorrowhood } from '../utils/invites';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import { Ionicons } from '../components/Icon';
import HeroIcon from '../components/HeroIcon';
import HapticPressable from '../components/HapticPressable';
import ActionButton from '../components/ActionButton';
import ActionSheet from '../components/ActionSheet';
import SegmentedControl from '../components/SegmentedControl';
import LayeredCard from '../components/LayeredCard';
import MemberSummary from '../components/MemberSummary';
import VerifiedBadge from '../components/VerifiedBadge';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function FriendsScreen({ navigation, route }) {
  const { user } = useAuth();
  const { showError } = useError();
  const [activeTab, setActiveTab] = useState(route?.params?.initialTab || 'friends'); // 'friends', 'requests', 'contacts', or 'search'
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [contactMatches, setContactMatches] = useState([]);
  const [nonUserContacts, setNonUserContacts] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [friendsError, setFriendsError] = useState(false);
  const [requestsError, setRequestsError] = useState(false);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [contactsFetched, setContactsFetched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [addingId, setAddingId] = useState(null);
  const [responding, setResponding] = useState(null);
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
      setFriendsError(false);
    } catch (error) {
      setFriendsError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchFriendRequests = useCallback(async () => {
    try {
      const data = await api.getFriendRequests();
      setFriendRequests(data);
      setRequestsError(false);
    } catch (error) {
      setRequestsError(true);
    } finally {
      setIsLoadingRequests(false);
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
      const timer = setTimeout(() => searchInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
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

  const onRefresh = async () => {
    setIsRefreshing(true);
    const refreshes = [fetchFriends(), fetchFriendRequests()];
    if (activeTab === 'contacts') {
      setContactsFetched(false); // Allow refetch on manual pull-to-refresh
      refreshes.push(fetchContactMatches());
    }
    await Promise.allSettled(refreshes);
    setIsRefreshing(false);
  };

  const handleAcceptRequest = async (request) => {
    setResponding({ id: request.requestId, action: 'accept' });
    try {
      await api.acceptFriendRequest(request.requestId);
      setFriendRequests(prev => prev.filter(r => r.requestId !== request.requestId));
      fetchFriends(); // Refresh friends list
      haptics.success();
    } catch (error) {
      haptics.error();
      showError('Could not accept request', 'Please try again.');
    } finally {
      setResponding(null);
    }
  };

  const handleDeclineRequest = async (request) => {
    setResponding({ id: request.requestId, action: 'decline' });
    try {
      await api.declineFriendRequest(request.requestId);
      setFriendRequests(prev => prev.filter(r => r.requestId !== request.requestId));
    } catch (error) {
      haptics.error();
      showError('Could not decline request', 'Please try again.');
    } finally {
      setResponding(null);
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
      showError('Could not add friend', 'Please try again.');
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
      showError('Could not remove friend', 'Please try again.');
    }
  };

  const handleInvite = async (contact) => {
    try {
      await inviteToBorrowhood(contact?.phone, inviteMessage(user?.id));
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
    <LayeredCard style={styles.card}>
      <HapticPressable style={styles.cardContent}
        onPress={() => navigation.navigate('UserProfile', { id: item.id })}>
        <FriendAvatar uri={item.profilePhotoUrl} />
        <FriendIdentity user={item} />
      </HapticPressable>
      <HapticPressable style={styles.removeButton}
        accessibilityLabel={`Manage friendship with ${item.firstName}`}
        onPress={() => { setSelectedFriend(item); setRemoveFriendSheetVisible(true); }}>
        <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.primary} />
      </HapticPressable>
    </LayeredCard>
  );

  const renderPersonItem = (item, subtitle) => (
    <LayeredCard style={styles.card}>
      <HapticPressable style={styles.cardContent}
        onPress={() => navigation.navigate('UserProfile', { id: item.id })}>
        <FriendAvatar uri={item.profilePhotoUrl} />
        <FriendIdentity user={item} subtitle={subtitle} />
      </HapticPressable>
      {item.isFriend ? (
        <View style={styles.friendBadge} accessible accessibilityLabel="Already friends">
          <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
        </View>
      ) : item.requestPending ? (
        <View style={styles.pendingBadge}><Text style={styles.pendingText}>Requested</Text></View>
      ) : (
        <HapticPressable haptic="medium" style={styles.addButton}
          accessibilityLabel={`Add ${item.firstName} as a friend`}
          onPress={() => handleAddFriend(item)} disabled={!!addingId}>
          {addingId === item.id ? <ActivityIndicator size="small" color={COLORS.surface} />
            : <Ionicons name="add" size={22} color={COLORS.surface} />}
        </HapticPressable>
      )}
    </LayeredCard>
  );
  const renderContactItem = ({ item }) => renderPersonItem(item, item.contactName ? `In your contacts as “${item.contactName}”` : null);
  const renderSearchItem = ({ item }) => renderPersonItem(item, [item.city, item.state].filter(Boolean).join(', '));

  const renderInviteItem = ({ item }) => (
    <LayeredCard style={styles.card}>
      <FriendAvatar />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.subtitle}>Not on Borrowhood yet</Text>
      </View>
      <HapticPressable style={styles.inviteButton} onPress={() => handleInvite(item)}
        accessibilityLabel={`Invite ${item.name}`}>
        <Text style={styles.inviteButtonText}>Invite</Text>
      </HapticPressable>
    </LayeredCard>
  );

  const renderRequestItem = ({ item }) => (
    <LayeredCard style={styles.requestCard}>
      <HapticPressable style={[styles.cardContent, styles.requestPerson]}
        onPress={() => navigation.navigate('UserProfile', { id: item.id })}>
        <FriendAvatar uri={item.profilePhotoUrl} />
        <FriendIdentity user={item} subtitle="Wants to be your friend" />
        <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
      </HapticPressable>
      <View style={styles.requestActions}>
        <HapticPressable haptic="medium" style={styles.acceptButton}
          accessibilityLabel={`Accept request from ${item.firstName}`}
          onPress={() => handleAcceptRequest(item)} disabled={!!responding}>
          {responding?.id === item.requestId && responding.action === 'accept'
            ? <ActivityIndicator size="small" color={COLORS.surface} />
            : <Ionicons name="checkmark" size={18} color={COLORS.surface} />}
          <Text style={styles.requestActionText}>Accept</Text>
        </HapticPressable>
        <HapticPressable style={styles.declineButton}
          accessibilityLabel={`Decline request from ${item.firstName}`}
          onPress={() => handleDeclineRequest(item)} disabled={!!responding}>
          {responding?.id === item.requestId && responding.action === 'decline'
            ? <ActivityIndicator size="small" color={COLORS.surface} />
            : <Ionicons name="close" size={18} color={COLORS.surface} />}
          <Text style={styles.requestActionText}>Decline</Text>
        </HapticPressable>
      </View>
    </LayeredCard>
  );

  const searchField = (
    <View style={styles.searchInputContainer}>
      <Ionicons name="search" size={18} color={COLORS.textMuted} />
      <TextInput ref={searchInputRef} style={styles.searchInput}
        placeholder={activeTab === 'friends' ? 'Search friends...' : 'Search by name...'}
        placeholderTextColor={COLORS.textMuted} testID="Friends.search.input"
        accessibilityLabel={activeTab === 'friends' ? 'Search friends' : 'Search people by name'}
        value={search} onChangeText={setSearch} autoFocus={activeTab === 'search'}
        autoCapitalize="none" autoCorrect={false} />
      {!!search && <HapticPressable style={styles.clearSearch} onPress={() => setSearch('')} accessibilityLabel="Clear search">
        <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
      </HapticPressable>}
    </View>
  );
  const loadError = activeTab === 'friends' ? friendsError : activeTab === 'requests' ? requestsError : false;

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
            <SegmentedControl variant="underline" segments={['Friends', friendRequests.length ? `Requests (${friendRequests.length})` : 'Requests']}
              selectedIndex={activeTab === 'requests' ? 1 : 0} onIndexChange={index => switchTab(index === 0 ? 'friends' : 'requests')} testID="Friends.tabs" />
            <View style={styles.toolbar}>
              {activeTab === 'friends' ? searchField : <Text style={styles.requestCount}>
                {isLoadingRequests ? 'Loading requests…' : `${friendRequests.length} friend request${friendRequests.length === 1 ? '' : 's'}`}
              </Text>}
              <HapticPressable accessibilityLabel="Add friends" onPress={() => setAddFriendsVisible(true)} style={styles.addFriendsButton}>
                <Ionicons name="add" size={22} color={COLORS.surface} />
                <Text style={styles.addFriendsText}>Add</Text>
              </HapticPressable>
            </View>
          </>
        )}
      </View>

      {activeTab === 'search' && <View style={styles.searchContainer}>{searchField}</View>}
      {loadError && <View style={styles.errorRow}>
        <Text style={styles.errorText} accessibilityRole="alert">Couldn't load {activeTab === 'friends' ? 'friends' : 'friend requests'}. Please try again.</Text>
        <ActionButton label="Retry" onPress={onRefresh} loading={isRefreshing} accessibilityLabel="Retry friends" />
      </View>}

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
              tintColor={COLORS.spinner}
              colors={[COLORS.spinner]}
            />
          }

          ListEmptyComponent={
            isLoading ? <View style={styles.emptyContainer}><ActivityIndicator size="large" color={COLORS.spinner} /></View> : !friendsError && (
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
          renderItem={renderRequestItem}
          keyExtractor={(item) => item.requestId}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.spinner}
              colors={[COLORS.spinner]}
            />
          }
          ListEmptyComponent={isLoadingRequests ? <View style={styles.emptyContainer}><ActivityIndicator size="large" color={COLORS.spinner} /></View> : !requestsError ? (
            <View style={styles.emptyContainer}>
              <HeroIcon icon="mail-outline" size={80} />
              <Text style={styles.emptyTitle}>No pending requests</Text>
              <Text style={styles.emptySubtitle}>New friend requests will appear here.</Text>
            </View>
          ) : null}
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
              <ActivityIndicator size="large" color={COLORS.spinner} />
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
                  tintColor={COLORS.spinner}
                  colors={[COLORS.spinner]}
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
                <ActivityIndicator size="large" color={COLORS.spinner} />
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
        variant="options"
        actions={[
          { label: 'My QR code', icon: <Ionicons name="qr-code" size={30} color={COLORS.primary} />, onPress: () => navigation.navigate('MyQRCode') },
          { label: 'From contacts', icon: <Ionicons name="people" size={30} color={COLORS.primary} />, onPress: () => switchTab('contacts') },
          { label: 'Search people', icon: <Ionicons name="search" size={30} color={COLORS.primary} />, onPress: () => switchTab('search') },
          { label: 'Invite by text', icon: <Ionicons name="paper-plane" size={30} color={COLORS.primary} />, onPress: () => handleInvite() },
        ]}
      />

      <ActionSheet
        isVisible={removeFriendSheetVisible}
        onClose={() => setRemoveFriendSheetVisible(false)}
        title="Remove friend?"
        variant="confirmation"
        message={`Remove ${selectedFriend?.firstName} from your friends?`}
        actions={[
          { label: 'Keep friend', onPress: () => setRemoveFriendSheetVisible(false) },
          {
            label: 'Remove friend',
            destructive: true,
            onPress: handleRemoveFriend,
          },
        ]}
      />
    </View>
  );
}

function FriendIdentity({ user, subtitle }) {
  return <View style={styles.info}>
    <MemberSummary user={user} showExchangeCount={false} compact>
      <Text style={styles.name} numberOfLines={2}>{[user.firstName, user.lastName].filter(Boolean).join(' ')}</Text>
      {user.isVerified && <VerifiedBadge size={16} />}
    </MemberSummary>
    {!!subtitle && <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>}
  </View>;
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
  navigationArea: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, gap: SPACING.md, maxWidth: 760, width: '100%', alignSelf: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  requestCount: { ...TYPOGRAPHY.subheadline, color: COLORS.textSecondary, flex: 1 },
  addFriendsButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: RADIUS.full },
  addFriendsText: { ...TYPOGRAPHY.subheadline, color: COLORS.surface },
  findHeader: { gap: SPACING.md },
  backToFriends: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, minHeight: 44, alignSelf: 'flex-start' },
  backText: { ...TYPOGRAPHY.subheadline, color: COLORS.primary },
  findTitle: { ...TYPOGRAPHY.h2, color: COLORS.text },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  searchContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
    flexDirection: 'row',
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingLeft: SPACING.md,
    paddingRight: SPACING.xs,
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: SPACING.sm,
    ...TYPOGRAPHY.subheadline,
    color: COLORS.text,
  },
  listContent: {
    padding: SPACING.lg,
    paddingTop: SPACING.sm,
    flexGrow: 1,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  sectionHeader: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '400',
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    marginTop: SPACING.xs,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryMuted,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
    flexShrink: 1,
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
    backgroundColor: COLORS.surfaceElevated,
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
    fontWeight: '400',
    color: COLORS.textSecondary,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.md,
    minHeight: 52,
    minWidth: 0,
  },
  requestCard: { padding: SPACING.lg, marginBottom: SPACING.md, gap: SPACING.lg },
  requestPerson: { flex: 0 },
  requestActionText: { ...TYPOGRAPHY.button, color: COLORS.surface, flexShrink: 1, textAlign: 'center' },
  requestActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  acceptButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    padding: SPACING.md,
    flexDirection: 'row',
    gap: SPACING.xs,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    padding: SPACING.md,
    flexDirection: 'row',
    gap: SPACING.xs,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primaryMuted,
  },
  inviteButtonText: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '400',
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
    flexShrink: 1,
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
  clearSearch: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, maxWidth: 760, width: '100%', alignSelf: 'center' },
  errorText: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, flex: 1 },
  retryButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.md },
});
