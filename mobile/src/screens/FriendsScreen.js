import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
  TextInput,
  ActivityIndicator,
  Linking,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function FriendsScreen({ navigation, route }) {
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
  const [selectedFriend, setSelectedFriend] = useState(null);
  const searchInputRef = useRef(null);

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
      const { status } = await Contacts.requestPermissionsAsync();
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

      // Find matches on server
      let matches = [];
      if (phoneNumbers.length > 0) {
        matches = await api.matchContacts(phoneNumbers);
      }

      // Add contact name to matches
      const matchesWithNames = matches.map(m => ({
        ...m,
        contactName: contactMap.get(m.matchedPhone)?.name,
      }));

      setContactMatches(matchesWithNames);

      // Store non-user contacts for invite feature
      const matchedPhones = new Set(matches.map(m => m.matchedPhone));
      const nonUsers = allContacts.filter(contact => {
        const digits = contact.phone.replace(/\D/g, '').slice(-10);
        return !matchedPhones.has(digits);
      });
      setNonUserContacts(nonUsers);

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
      // Don't refetch contacts on every focus - it causes flashing
    });
    return unsubscribe;
  }, [navigation, fetchFriends, fetchFriendRequests]);

  // Fetch contacts when switching to contacts tab
  useEffect(() => {
    if (activeTab === 'contacts' && !isLoadingContacts) {
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
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await api.searchUsers(search);
        setSearchResults(results);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
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
    const isAvailable = await SMS.isAvailableAsync();
    if (!isAvailable) {
      return;
    }

    await SMS.sendSMSAsync(
      [contact.phone],
      `Hey! I'm using Borrowhood to share and borrow items with neighbors. Join me! https://borrowhood.com/download`
    );
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
      <Image
        source={{ uri: item.profilePhotoUrl || 'https://via.placeholder.com/50' }}
        style={styles.avatar}
      />
      <View style={styles.info}>
        <Text style={styles.name}>{item.firstName} {item.lastName}</Text>
        {item.totalTransactions > 0 && (
          <Text style={styles.subtitle}>{item.totalTransactions} transactions</Text>
        )}
      </View>
      <HapticPressable
        haptic="light"
        style={styles.removeButton}
        onPress={() => {
          setSelectedFriend(item);
          setRemoveFriendSheetVisible(true);
        }}
      >
        <Ionicons name="close" size={20} color={COLORS.textMuted} />
      </HapticPressable>
    </HapticPressable>
  );

  const renderContactItem = ({ item }) => (
    <HapticPressable
      haptic="light"
      style={styles.card}
      onPress={() => navigation.navigate('UserProfile', { id: item.id })}
    >
      <Image
        source={{ uri: item.profilePhotoUrl || 'https://via.placeholder.com/50' }}
        style={styles.avatar}
      />
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
      <Image
        source={{ uri: item.profilePhotoUrl || 'https://via.placeholder.com/50' }}
        style={styles.avatar}
      />
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
        <Ionicons name="person" size={24} color={COLORS.gray[500]} />
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
      {/* Tabs */}
      <View style={styles.tabContainer}>
        <HapticPressable
          haptic="light"
          style={[styles.tab, activeTab === 'friends' && styles.tabActive]}
          onPress={() => setActiveTab('friends')}
        >
          <Text style={[styles.tabText, activeTab === 'friends' && styles.tabTextActive]}>
            Friends
          </Text>
        </HapticPressable>
        <HapticPressable
          haptic="light"
          style={[styles.tab, activeTab === 'requests' && styles.tabActive]}
          onPress={() => setActiveTab('requests')}
        >
          <View style={styles.tabWithBadge}>
            <Text style={[styles.tabText, activeTab === 'requests' && styles.tabTextActive]}>
              Requests
            </Text>
            {friendRequests.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{friendRequests.length}</Text>
              </View>
            )}
          </View>
        </HapticPressable>
        <HapticPressable
          haptic="light"
          style={[styles.tab, activeTab === 'contacts' && styles.tabActive]}
          onPress={() => setActiveTab('contacts')}
        >
          <Text style={[styles.tabText, activeTab === 'contacts' && styles.tabTextActive]}>
            Contacts
          </Text>
        </HapticPressable>
        <HapticPressable
          haptic="light"
          style={[styles.tab, activeTab === 'search' && styles.tabActive]}
          onPress={() => setActiveTab('search')}
        >
          <Text style={[styles.tabText, activeTab === 'search' && styles.tabTextActive]}>
            Search
          </Text>
        </HapticPressable>
      </View>

      {/* Search bar for friends and search tabs */}
      {(activeTab === 'friends' || activeTab === 'search') && (
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={18} color={COLORS.textMuted} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder={activeTab === 'friends' ? "Search friends..." : "Search by name..."}
              placeholderTextColor={COLORS.textMuted}
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
        <FlatList
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
          ListHeaderComponent={
            <View style={styles.friendsHeader}>
              {/* Pending requests banner */}
              {friendRequests.length > 0 && (
                <HapticPressable
                  haptic="light"
                  style={styles.requestsBanner}
                  onPress={() => setActiveTab('requests')}
                >
                  <View style={styles.requestsBannerIcon}>
                    <Ionicons name="person-add" size={20} color={COLORS.primary} />
                  </View>
                  <View style={styles.requestsBannerInfo}>
                    <Text style={styles.requestsBannerTitle}>
                      {friendRequests.length} friend request{friendRequests.length > 1 ? 's' : ''}
                    </Text>
                    <Text style={styles.requestsBannerSubtitle}>Tap to accept or decline</Text>
                  </View>
                  <View style={styles.requestsBannerBadge}>
                    <Text style={styles.requestsBannerBadgeText}>{friendRequests.length}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                </HapticPressable>
              )}

              {/* Quick actions */}
              <View style={styles.quickActions}>
                <HapticPressable
                  haptic="light"
                  style={styles.quickAction}
                  onPress={() => {
                    setContactsFetched(false);
                    setActiveTab('contacts');
                  }}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: COLORS.primaryMuted }]}>
                    <Ionicons name="people" size={20} color={COLORS.primary} />
                  </View>
                  <Text style={styles.quickActionText}>From Contacts</Text>
                </HapticPressable>
                <HapticPressable
                  haptic="light"
                  style={styles.quickAction}
                  onPress={() => setActiveTab('search')}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: COLORS.secondaryMuted }]}>
                    <Ionicons name="search" size={20} color={COLORS.secondary} />
                  </View>
                  <Text style={styles.quickActionText}>Search Users</Text>
                </HapticPressable>
                <HapticPressable
                  haptic="light"
                  style={styles.quickAction}
                  onPress={async () => {
                    const isAvailable = await SMS.isAvailableAsync();
                    if (isAvailable) {
                      await SMS.sendSMSAsync(
                        [],
                        `Hey! I'm using Borrowhood to share and borrow items with neighbors. Join me! https://borrowhood.com/download`
                      );
                    }
                  }}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: COLORS.warningMuted }]}>
                    <Ionicons name="paper-plane" size={20} color={COLORS.warning} />
                  </View>
                  <Text style={styles.quickActionText}>Invite via SMS</Text>
                </HapticPressable>
              </View>

              {filteredFriends.length > 0 && (
                <Text style={styles.sectionHeader}>My Friends</Text>
              )}
            </View>
          }
          ListEmptyComponent={
            !isLoading && (
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={64} color={COLORS.gray[700]} />
                <Text style={styles.emptyTitle}>No close friends yet</Text>
                <Text style={styles.emptySubtitle}>
                  Use the options above to find and invite friends
                </Text>
              </View>
            )
          }
        />
      )}

      {activeTab === 'requests' && (
        <FlatList
          data={friendRequests}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <HapticPressable
                haptic="light"
                style={styles.cardContent}
                onPress={() => navigation.navigate('UserProfile', { id: item.id })}
              >
                <Image
                  source={{ uri: item.profilePhotoUrl || 'https://via.placeholder.com/50' }}
                  style={styles.avatar}
                />
                <View style={styles.info}>
                  <Text style={styles.name}>{item.firstName} {item.lastName}</Text>
                  <Text style={styles.subtitle}>Wants to be your friend</Text>
                </View>
              </HapticPressable>
              <View style={styles.requestActions}>
                <HapticPressable
                  haptic="medium"
                  style={styles.acceptButton}
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
              <Ionicons name="mail-outline" size={64} color={COLORS.gray[700]} />
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
              <Ionicons name="lock-closed-outline" size={64} color={COLORS.gray[700]} />
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
            <FlatList
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
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="people-outline" size={64} color={COLORS.gray[700]} />
                  <Text style={styles.emptyTitle}>No contacts found</Text>
                  <Text style={styles.emptySubtitle}>
                    We couldn't find any contacts with phone numbers. Try searching for friends by name instead.
                  </Text>
                </View>
              }
            />
          )}
        </>
      )}

      {activeTab === 'search' && (
        <FlatList
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
                  <Ionicons name="search-outline" size={64} color={COLORS.gray[700]} />
                  <Text style={styles.emptyTitle}>Search for people</Text>
                  <Text style={styles.emptySubtitle}>
                    Enter at least 2 characters to search
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="person-outline" size={64} color={COLORS.gray[700]} />
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
        isVisible={removeFriendSheetVisible}
        onClose={() => setRemoveFriendSheetVisible(false)}
        title="Remove Friend"
        message={`Remove ${selectedFriend?.firstName} from your close friends?`}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.sm + 2,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: '#fff',
  },
  tabWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
  },
  badge: {
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.sm + 2,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs + 2,
  },
  badgeText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '700',
    color: '#fff',
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
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.gray[700],
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
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.separator,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendBadge: {
    width: 36,
    height: 36,
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
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButton: {
    width: 40,
    height: 40,
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
  friendsHeader: {
    marginBottom: SPACING.sm,
  },
  requestsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryMuted,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  requestsBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsBannerInfo: {
    flex: 1,
  },
  requestsBannerTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  requestsBannerSubtitle: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  requestsBannerBadge: {
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.full,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
  requestsBannerBadgeText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '700',
    color: '#fff',
  },
  quickActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.separator,
  },
  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: COLORS.text,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
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
