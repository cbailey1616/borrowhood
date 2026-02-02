import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS } from '../utils/config';

export default function FriendsScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('friends'); // 'friends', 'contacts', or 'search'
  const [friends, setFriends] = useState([]);
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
  const [contactsPermission, setContactsPermission] = useState(null);

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

  const fetchContactMatches = useCallback(async () => {
    setIsLoadingContacts(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      setContactsPermission(status);

      if (status !== 'granted') {
        setIsLoadingContacts(false);
        return;
      }

      // Get contacts with phone numbers
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });

      if (data.length === 0) {
        setIsLoadingContacts(false);
        return;
      }

      // Extract all phone numbers
      const phoneNumbers = [];
      const contactMap = new Map(); // Map phone -> contact info

      data.forEach(contact => {
        if (contact.phoneNumbers) {
          contact.phoneNumbers.forEach(phone => {
            const normalized = phone.number.replace(/\D/g, '').slice(-10);
            if (normalized.length === 10) {
              phoneNumbers.push(phone.number);
              contactMap.set(normalized, {
                name: contact.name || 'Unknown',
                phone: phone.number,
              });
            }
          });
        }
      });

      // Find matches on server
      const matches = await api.matchContacts(phoneNumbers);

      // Add contact name to matches
      const matchesWithNames = matches.map(m => ({
        ...m,
        contactName: contactMap.get(m.matchedPhone)?.name,
      }));

      setContactMatches(matchesWithNames);

      // Store some non-user contacts for invite feature (limit to 50)
      const matchedPhones = new Set(matches.map(m => m.matchedPhone));
      const nonUsers = [];
      contactMap.forEach((contact, phone) => {
        if (!matchedPhones.has(phone) && nonUsers.length < 50) {
          nonUsers.push(contact);
        }
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
  }, [fetchFriends]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchFriends();
      // Don't refetch contacts on every focus - it causes flashing
    });
    return unsubscribe;
  }, [navigation, fetchFriends]);

  // Fetch contacts when switching to contacts tab (only once)
  useEffect(() => {
    if (activeTab === 'contacts' && !contactsFetched && !isLoadingContacts) {
      fetchContactMatches();
    }
  }, [activeTab, contactsFetched, isLoadingContacts, fetchContactMatches]);

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
    if (activeTab === 'contacts') {
      setContactsFetched(false); // Allow refetch on manual pull-to-refresh
      fetchContactMatches();
    }
  };

  // Memoize combined contacts list to prevent re-renders
  const contactsData = useMemo(() => {
    // Add stable keys to non-user contacts
    const inviteContacts = nonUserContacts.slice(0, 10).map((contact, idx) => ({
      ...contact,
      _inviteKey: `invite-${contact.phone?.replace(/\D/g, '').slice(-10) || idx}`,
    }));
    return [...contactMatches, ...inviteContacts];
  }, [contactMatches, nonUserContacts]);

  const handleAddFriend = async (user) => {
    setAddingId(user.id);
    try {
      await api.addFriend(user.id);
      // Update lists to show as friend
      setSearchResults(prev =>
        prev.map(u => u.id === user.id ? { ...u, isFriend: true } : u)
      );
      setContactMatches(prev =>
        prev.map(u => u.id === user.id ? { ...u, isFriend: true } : u)
      );
      fetchFriends();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to add friend');
    } finally {
      setAddingId(null);
    }
  };

  const handleRemoveFriend = (friend) => {
    Alert.alert(
      'Remove Friend',
      `Remove ${friend.firstName} from your close friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.removeFriend(friend.id);
              setFriends(prev => prev.filter(f => f.id !== friend.id));
            } catch (error) {
              Alert.alert('Error', 'Failed to remove friend');
            }
          },
        },
      ]
    );
  };

  const handleInvite = async (contact) => {
    const isAvailable = await SMS.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('SMS not available', 'SMS is not available on this device');
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
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('UserProfile', { id: item.id })}
      activeOpacity={0.7}
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
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => handleRemoveFriend(item)}
      >
        <Ionicons name="close" size={20} color={COLORS.textMuted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderContactItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('UserProfile', { id: item.id })}
      activeOpacity={0.7}
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
      ) : (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => handleAddFriend(item)}
          disabled={addingId === item.id}
        >
          {addingId === item.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="person-add" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const renderSearchItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('UserProfile', { id: item.id })}
      activeOpacity={0.7}
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
      ) : (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => handleAddFriend(item)}
          disabled={addingId === item.id}
        >
          {addingId === item.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="person-add" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
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
      <TouchableOpacity
        style={styles.inviteButton}
        onPress={() => handleInvite(item)}
      >
        <Text style={styles.inviteButtonText}>Invite</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'friends' && styles.tabActive]}
          onPress={() => setActiveTab('friends')}
        >
          <Text style={[styles.tabText, activeTab === 'friends' && styles.tabTextActive]}>
            Friends
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'contacts' && styles.tabActive]}
          onPress={() => setActiveTab('contacts')}
        >
          <Text style={[styles.tabText, activeTab === 'contacts' && styles.tabTextActive]}>
            Contacts
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'search' && styles.tabActive]}
          onPress={() => setActiveTab('search')}
        >
          <Text style={[styles.tabText, activeTab === 'search' && styles.tabTextActive]}>
            Search
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search bar for friends and search tabs */}
      {(activeTab === 'friends' || activeTab === 'search') && (
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={18} color={COLORS.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder={activeTab === 'friends' ? "Search friends..." : "Search by name..."}
              placeholderTextColor={COLORS.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
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
          ListEmptyComponent={
            !isLoading && (
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={64} color={COLORS.gray[700]} />
                <Text style={styles.emptyTitle}>No close friends yet</Text>
                <Text style={styles.emptySubtitle}>
                  Check your Contacts or Search to find friends
                </Text>
              </View>
            )
          }
        />
      )}

      {activeTab === 'contacts' && (
        <>
          {contactsPermission === 'denied' ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="lock-closed-outline" size={64} color={COLORS.gray[700]} />
              <Text style={styles.emptyTitle}>Contacts Access Needed</Text>
              <Text style={styles.emptySubtitle}>
                Allow access to find friends from your contacts
              </Text>
              <TouchableOpacity style={styles.settingsButton} onPress={openSettings}>
                <Text style={styles.settingsButtonText}>Open Settings</Text>
              </TouchableOpacity>
            </View>
          ) : isLoadingContacts ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.emptySubtitle}>Checking your contacts...</Text>
            </View>
          ) : (
            <FlatList
              data={contactsData}
              renderItem={({ item }) =>
                item.id ? renderContactItem({ item }) : renderInviteItem({ item })
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
                  <Text style={styles.sectionHeader}>From Your Contacts</Text>
                ) : null
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="people-outline" size={64} color={COLORS.gray[700]} />
                  <Text style={styles.emptyTitle}>No matches found</Text>
                  <Text style={styles.emptySubtitle}>
                    None of your contacts are on Borrowhood yet. Invite them!
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
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: '#fff',
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
    flexGrow: 1,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 12,
    marginTop: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
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
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.gray[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: COLORS.primary + '20',
  },
  inviteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  settingsButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 20,
  },
  settingsButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
