import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../utils/config';

export default function ChatScreen({ route, navigation }) {
  const { conversationId, recipientId, listingId, listing: passedListing } = route.params;
  const { user } = useAuth();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const flatListRef = useRef(null);

  useEffect(() => {
    if (conversationId) {
      fetchMessages();
    } else {
      // New conversation - set up initial state
      setIsLoading(false);
      if (passedListing) {
        setConversation({
          listing: passedListing,
          otherUser: passedListing.owner,
        });
      }
    }
  }, [conversationId]);

  useEffect(() => {
    // Update header with other user's name
    if (conversation?.otherUser) {
      navigation.setOptions({
        title: `${conversation.otherUser.firstName} ${conversation.otherUser.lastName}`,
      });
    }
  }, [conversation, navigation]);

  const fetchMessages = async () => {
    try {
      const data = await api.getConversation(conversationId);
      setConversation(data.conversation);
      setMessages(data.messages);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || isSending) return;

    const messageContent = newMessage.trim();
    setNewMessage('');
    setIsSending(true);

    // Determine recipient
    const recipient = recipientId || conversation?.otherUser?.id;
    if (!recipient) {
      console.error('No recipient specified');
      setIsSending(false);
      return;
    }

    try {
      const result = await api.sendMessage({
        recipientId: recipient,
        content: messageContent,
        listingId: listingId || conversation?.listing?.id,
      });

      // Add message to list
      const newMsg = {
        id: result.id,
        senderId: user.id,
        content: messageContent,
        isOwnMessage: true,
        createdAt: result.createdAt,
      };
      setMessages(prev => [...prev, newMsg]);

      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Restore message on error
      setNewMessage(messageContent);
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date) => {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString();
  };

  const renderMessage = ({ item, index }) => {
    const showDate = index === 0 ||
      formatDate(messages[index - 1].createdAt) !== formatDate(item.createdAt);
    const otherUser = conversation?.otherUser;

    return (
      <View>
        {showDate && (
          <View style={styles.dateHeader}>
            <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
          </View>
        )}
        <View style={[
          styles.messageRow,
          item.isOwnMessage ? styles.ownMessageRow : styles.otherMessageRow
        ]}>
          {!item.isOwnMessage && (
            <Image
              source={{ uri: otherUser?.profilePhotoUrl || 'https://via.placeholder.com/32' }}
              style={styles.messageAvatar}
            />
          )}
          <View style={[
            styles.messageBubble,
            item.isOwnMessage ? styles.ownMessage : styles.otherMessage
          ]}>
            <Text style={[
              styles.messageText,
              item.isOwnMessage ? styles.ownMessageText : styles.otherMessageText
            ]}>
              {item.content}
            </Text>
            <Text style={[
              styles.messageTime,
              item.isOwnMessage ? styles.ownMessageTime : styles.otherMessageTime
            ]}>
              {formatTime(item.createdAt)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Listing Context Header */}
      {conversation?.listing && (
        <TouchableOpacity
          style={styles.listingHeader}
          onPress={() => navigation.navigate('ListingDetail', { id: conversation.listing.id })}
        >
          <Image
            source={{ uri: conversation.listing.photoUrl || 'https://via.placeholder.com/40' }}
            style={styles.listingImage}
          />
          <View style={styles.listingInfo}>
            <Text style={styles.listingLabel}>Chatting about</Text>
            <Text style={styles.listingTitle} numberOfLines={1}>
              {conversation.listing.title}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray[600]} />
        </TouchableOpacity>
      )}

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyMessages}>
            <Ionicons name="chatbubble-outline" size={48} color={COLORS.gray[700]} />
            <Text style={styles.emptyText}>
              Start the conversation!
            </Text>
          </View>
        }
      />

      {/* Input Bar */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={newMessage}
          onChangeText={setNewMessage}
          placeholder="Type a message..."
          placeholderTextColor={COLORS.textMuted}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!newMessage.trim() || isSending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!newMessage.trim() || isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
  listingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    padding: SPACING.md,
    gap: SPACING.md,
    ...SHADOWS.sm,
  },
  listingImage: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.gray[700],
  },
  listingInfo: {
    flex: 1,
  },
  listingLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 2,
  },
  messagesContent: {
    padding: SPACING.lg,
    flexGrow: 1,
  },
  dateHeader: {
    alignItems: 'center',
    marginVertical: SPACING.xl,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textMuted,
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: SPACING.sm,
  },
  ownMessageRow: {
    justifyContent: 'flex-end',
  },
  otherMessageRow: {
    justifyContent: 'flex-start',
  },
  messageAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: SPACING.sm,
    backgroundColor: COLORS.gray[700],
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.xl,
  },
  ownMessage: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: SPACING.xs,
    ...SHADOWS.sm,
  },
  otherMessage: {
    backgroundColor: COLORS.surfaceElevated,
    borderBottomLeftRadius: SPACING.xs,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  ownMessageText: {
    color: '#fff',
  },
  otherMessageText: {
    color: COLORS.text,
  },
  messageTime: {
    fontSize: 10,
    marginTop: SPACING.xs,
  },
  ownMessageTime: {
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'right',
  },
  otherMessageTime: {
    color: COLORS.textMuted,
  },
  emptyMessages: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginTop: SPACING.lg,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[800],
    gap: SPACING.md,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: 16,
    color: COLORS.text,
    maxHeight: 120,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.gray[700],
    ...SHADOWS.sm,
  },
});
