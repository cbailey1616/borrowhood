import { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS } from '../utils/config';

export default function FriendsScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('friends'); // 'friends' or 'search'
  const [friends, setFriends] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [addingId, setAddingId] = useState(null);

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

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchFriends();
    });
    return unsubscribe;
  }, [navigation, fetchFriends]);

  // Search for users when in search tab
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
  };

  const handleAddFriend = async (user) => {
    setAddingId(user.id);
    try {
      await api.addFriend(user.id);
      // Update search results to show as friend
      setSearchResults(prev =>
        prev.map(u => u.id === user.id ? { ...u, isFriend: true } : u)
      );
      // Refresh friends list
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

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'friends' && styles.tabActive]}
          onPress={() => setActiveTab('friends')}
        >
          <Text style={[styles.tabText, activeTab === 'friends' && styles.tabTextActive]}>
            My Friends
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'search' && styles.tabActive]}
          onPress={() => setActiveTab('search')}
        >
          <Text style={[styles.tabText, activeTab === 'search' && styles.tabTextActive]}>
            Find Friends
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
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

      {activeTab === 'friends' ? (
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
                  Tap "Find Friends" to search and add friends
                </Text>
              </View>
            )
          }
        />
      ) : (
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
    fontSize: 15,
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
