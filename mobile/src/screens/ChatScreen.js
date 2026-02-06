import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import { useAuth } from '../context/AuthContext';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../utils/config';

function SendButton({ onPress, disabled }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    haptics.light();
    scale.value = withSequence(
      withSpring(0.85, ANIMATION.spring.stiff),
      withSpring(1, ANIMATION.spring.bouncy)
    );
    onPress();
  }, [onPress]);

  return (
    <HapticPressable
      style={[styles.sendButton, disabled && styles.sendButtonDisabled]}
      onPress={handlePress}
      disabled={disabled}
      haptic={null}
    >
      <Animated.View style={animStyle}>
        <Ionicons name="send" size={20} color="#fff" />
      </Animated.View>
    </HapticPressable>
  );
}

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
      haptics.error();
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
            <BlurCard style={styles.datePill} intensity={60}>
              <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
            </BlurCard>
          </View>
        )}
        <Animated.View
          entering={FadeInUp.delay(50).duration(200)}
          style={[
            styles.messageRow,
            item.isOwnMessage ? styles.ownMessageRow : styles.otherMessageRow
          ]}
        >
          {!item.isOwnMessage && (
            <Image
              source={{ uri: otherUser?.profilePhotoUrl || 'https://via.placeholder.com/32' }}
              style={styles.messageAvatar}
            />
          )}
          {item.isOwnMessage ? (
            <View style={[styles.messageBubble, styles.ownMessage]}>
              <Text style={[styles.messageText, styles.ownMessageText]}>
                {item.content}
              </Text>
              <Text style={[styles.messageTime, styles.ownMessageTime]}>
                {formatTime(item.createdAt)}
              </Text>
            </View>
          ) : (
            <BlurCard style={[styles.messageBubble, styles.otherMessage]} intensity={40}>
              <Text style={[styles.messageText, styles.otherMessageText]}>
                {item.content}
              </Text>
              <Text style={[styles.messageTime, styles.otherMessageTime]}>
                {formatTime(item.createdAt)}
              </Text>
            </BlurCard>
          )}
        </Animated.View>
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
        <HapticPressable
          style={styles.listingHeader}
          onPress={() => navigation.navigate('ListingDetail', { id: conversation.listing.id })}
          haptic="light"
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
        </HapticPressable>
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

      {/* Input Bar with Blur Background */}
      {Platform.OS === 'ios' ? (
        <BlurView intensity={80} tint="dark" style={styles.inputBlur}>
          <View style={styles.inputInner}>
            <TextInput
              style={styles.input}
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="Type a message..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={2000}
            />
            <SendButton
              onPress={handleSend}
              disabled={!newMessage.trim() || isSending}
            />
          </View>
        </BlurView>
      ) : (
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
          <SendButton
            onPress={handleSend}
            disabled={!newMessage.trim() || isSending}
          />
        </View>
      )}
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
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
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listingTitle: {
    ...TYPOGRAPHY.subheadline,
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
  datePill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  dateText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: COLORS.textSecondary,
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
  },
  otherMessage: {
    borderBottomLeftRadius: SPACING.xs,
  },
  messageText: {
    ...TYPOGRAPHY.subheadline,
    lineHeight: 21,
  },
  ownMessageText: {
    color: '#fff',
  },
  otherMessageText: {
    color: COLORS.text,
  },
  messageTime: {
    ...TYPOGRAPHY.caption1,
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
    ...TYPOGRAPHY.subheadline,
    color: COLORS.textSecondary,
    marginTop: SPACING.lg,
  },
  inputBlur: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
  },
  inputInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
    gap: SPACING.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
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
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.gray[700],
  },
});
