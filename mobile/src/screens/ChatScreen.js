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
  Modal,
  Pressable,
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
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import ActionSheet from '../components/ActionSheet';
import EmojiReactionPicker from '../components/EmojiReactionPicker';
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
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [emojiPickerMessage, setEmojiPickerMessage] = useState(null);
  const [emojiPickerPos, setEmojiPickerPos] = useState(null);
  const flatListRef = useRef(null);
  const messageRefs = useRef({});

  useEffect(() => {
    if (conversationId) {
      fetchMessages();
      // Poll for new messages every 5 seconds
      const interval = setInterval(() => {
        if (conversationId) {
          api.getConversation(conversationId).then(data => {
            setMessages(data.messages);
          }).catch(() => {});
        }
      }, 5000);
      return () => clearInterval(interval);
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
        title: `${conversation.otherUser.firstName || ''} ${conversation.otherUser.lastName || ''}`.trim() || 'Chat',
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
        isRead: false,
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

  const handleMessageLongPress = useCallback((message) => {
    if (message.isDeleted) return;
    const ref = messageRefs.current[message.id];
    if (ref) {
      ref.measureInWindow((x, y, width, height) => {
        setEmojiPickerPos({
          top: y - 52,
          isOwnMessage: message.isOwnMessage,
        });
        setEmojiPickerMessage(message);
      });
    } else {
      setEmojiPickerMessage(message);
    }
  }, []);

  const handleDeleteMessage = useCallback(async (messageId) => {
    try {
      await api.deleteMessage(messageId);
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, isDeleted: true, content: null } : m
      ));
    } catch (error) {
      console.error('Failed to delete message:', error);
      haptics.error();
    }
  }, []);

  const handleCopyMessage = useCallback(async (content) => {
    await Clipboard.setStringAsync(content);
    haptics.light();
  }, []);

  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
    });

    if (result.canceled) return;

    const uri = result.assets[0].uri;
    const recipient = recipientId || conversation?.otherUser?.id;
    if (!recipient) return;

    setIsUploading(true);
    try {
      const imageUrl = await api.uploadImage(uri, 'messages');
      const apiResult = await api.sendMessage({
        recipientId: recipient,
        imageUrl,
        listingId: listingId || conversation?.listing?.id,
      });

      const newMsg = {
        id: apiResult.id,
        senderId: user.id,
        content: null,
        imageUrl,
        isOwnMessage: true,
        isRead: false,
        createdAt: apiResult.createdAt,
      };
      setMessages(prev => [...prev, newMsg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      console.error('Failed to send image:', error);
      haptics.error();
    } finally {
      setIsUploading(false);
    }
  }, [recipientId, conversation, listingId, user.id]);

  const handleEmojiSelect = useCallback(async (emoji) => {
    const message = emojiPickerMessage;
    if (!message) return;
    setEmojiPickerMessage(null);
    setEmojiPickerPos(null);

    // Check if user already has this emoji on this message
    const existingReaction = (message.reactions || []).find(
      r => r.userId === user.id && r.emoji === emoji
    );

    try {
      if (existingReaction) {
        await api.removeReaction(message.id);
        setMessages(prev => prev.map(m =>
          m.id === message.id
            ? { ...m, reactions: (m.reactions || []).filter(r => r.userId !== user.id) }
            : m
        ));
      } else {
        await api.reactToMessage(message.id, emoji);
        setMessages(prev => prev.map(m => {
          if (m.id !== message.id) return m;
          const reactions = (m.reactions || []).filter(r => r.userId !== user.id);
          return { ...m, reactions: [...reactions, { userId: user.id, emoji }] };
        }));
      }
    } catch (error) {
      console.error('Failed to react:', error);
      haptics.error();
    }
  }, [emojiPickerMessage, user.id]);

  const handleToggleReaction = useCallback(async (message, emoji) => {
    const existingReaction = (message.reactions || []).find(
      r => r.userId === user.id && r.emoji === emoji
    );

    try {
      if (existingReaction) {
        await api.removeReaction(message.id);
        setMessages(prev => prev.map(m =>
          m.id === message.id
            ? { ...m, reactions: (m.reactions || []).filter(r => r.userId !== user.id) }
            : m
        ));
      } else {
        await api.reactToMessage(message.id, emoji);
        setMessages(prev => prev.map(m => {
          if (m.id !== message.id) return m;
          const reactions = (m.reactions || []).filter(r => r.userId !== user.id);
          return { ...m, reactions: [...reactions, { userId: user.id, emoji }] };
        }));
      }
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
      haptics.error();
    }
  }, [user.id]);

  const handleEmojiMore = useCallback(() => {
    const message = emojiPickerMessage;
    setEmojiPickerMessage(null);
    setEmojiPickerPos(null);
    if (message) {
      setSelectedMessage(message);
      setActionSheetVisible(true);
    }
  }, [emojiPickerMessage]);

  const getMessageActions = useCallback((message) => {
    const actions = [];
    if (message.content && !message.isDeleted) {
      actions.push({
        label: 'Copy Text',
        icon: <Ionicons name="copy-outline" size={20} color={COLORS.text} />,
        onPress: () => handleCopyMessage(message.content),
      });
    }
    if (message.isOwnMessage && !message.isDeleted) {
      actions.push({
        label: 'Delete Message',
        icon: <Ionicons name="trash-outline" size={20} color={COLORS.danger} />,
        destructive: true,
        onPress: () => handleDeleteMessage(message.id),
      });
    }
    if (!message.isOwnMessage) {
      actions.push({
        label: 'Report',
        icon: <Ionicons name="flag-outline" size={20} color={COLORS.danger} />,
        destructive: true,
        onPress: () => {},
      });
    }
    return actions;
  }, [handleCopyMessage, handleDeleteMessage]);

  const renderReactionPills = (item) => {
    const reactions = item.reactions || [];
    if (reactions.length === 0) return null;

    // Group reactions by emoji
    const grouped = {};
    for (const r of reactions) {
      if (!grouped[r.emoji]) grouped[r.emoji] = [];
      grouped[r.emoji].push(r.userId);
    }

    return (
      <View style={[styles.reactionPillsRow, item.isOwnMessage ? styles.ownReactionPills : styles.otherReactionPills]}>
        {Object.entries(grouped).map(([emoji, userIds]) => {
          const isOwn = userIds.includes(user.id);
          return (
            <HapticPressable
              key={emoji}
              onPress={() => handleToggleReaction(item, emoji)}
              haptic="light"
              style={[styles.reactionPill, isOwn && styles.reactionPillOwn]}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
              {userIds.length > 1 && (
                <Text style={styles.reactionCount}>{userIds.length}</Text>
              )}
            </HapticPressable>
          );
        })}
      </View>
    );
  };

  const renderMessage = ({ item, index }) => {
    const showDate = index === 0 ||
      formatDate(messages[index - 1].createdAt) !== formatDate(item.createdAt);
    const otherUser = conversation?.otherUser;

    return (
      <View>
        {showDate && (
          <View style={styles.dateHeader}>
            <View style={styles.datePill}>
              <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
            </View>
          </View>
        )}
        <View style={styles.messageContainer}>
          <Animated.View
            ref={ref => { if (ref) messageRefs.current[item.id] = ref; }}
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
            {item.isDeleted ? (
              <View style={[styles.messageBubble, styles.deletedMessage]}>
                <Text style={styles.deletedMessageText}>This message was deleted</Text>
              </View>
            ) : item.isOwnMessage ? (
              <HapticPressable
                onLongPress={() => handleMessageLongPress(item)}
                haptic="medium"
                style={[styles.messageBubble, styles.ownMessage, item.imageUrl && styles.imageBubble]}
              >
                {item.imageUrl && (
                  <HapticPressable onPress={() => setFullscreenImage(item.imageUrl)} haptic="light">
                    <Image source={{ uri: item.imageUrl }} style={styles.messageImage} />
                  </HapticPressable>
                )}
                {item.content ? (
                  <Text style={[styles.messageText, styles.ownMessageText]}>
                    {item.content}
                  </Text>
                ) : null}
                <View style={styles.ownMessageMeta}>
                  <Text style={[styles.messageTime, styles.ownMessageTime]}>
                    {formatTime(item.createdAt)}
                  </Text>
                  <Ionicons
                    name={item.isRead ? 'checkmark-done' : 'checkmark'}
                    size={14}
                    color={item.isRead ? '#fff' : 'rgba(255,255,255,0.6)'}
                    style={styles.readReceipt}
                  />
                </View>
              </HapticPressable>
            ) : (
              <HapticPressable
                onLongPress={() => handleMessageLongPress(item)}
                haptic="medium"
              >
                <BlurCard style={[styles.messageBubble, styles.otherMessage, item.imageUrl && styles.imageBubble]} intensity={40}>
                  {item.imageUrl && (
                    <HapticPressable onPress={() => setFullscreenImage(item.imageUrl)} haptic="light">
                      <Image source={{ uri: item.imageUrl }} style={styles.messageImage} />
                    </HapticPressable>
                  )}
                  {item.content ? (
                    <Text style={[styles.messageText, styles.otherMessageText]}>
                      {item.content}
                    </Text>
                  ) : null}
                  <Text style={[styles.messageTime, styles.otherMessageTime]}>
                    {formatTime(item.createdAt)}
                  </Text>
                </BlurCard>
              </HapticPressable>
            )}
          </Animated.View>
          {renderReactionPills(item)}
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
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
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
        onScrollBeginDrag={() => { setEmojiPickerMessage(null); setEmojiPickerPos(null); }}
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
            <HapticPressable onPress={handlePickImage} haptic="light" disabled={isUploading}>
              <Ionicons
                name={isUploading ? 'hourglass-outline' : 'image-outline'}
                size={24}
                color={isUploading ? COLORS.textMuted : COLORS.primary}
              />
            </HapticPressable>
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
          <HapticPressable onPress={handlePickImage} haptic="light" disabled={isUploading}>
            <Ionicons
              name={isUploading ? 'hourglass-outline' : 'image-outline'}
              size={24}
              color={isUploading ? COLORS.textMuted : COLORS.primary}
            />
          </HapticPressable>
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
      {/* Emoji Reaction Picker Overlay */}
      {emojiPickerMessage && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEmojiPickerMessage(null)} />
          <EmojiReactionPicker
            onSelect={handleEmojiSelect}
            onMore={handleEmojiMore}
            style={[
              styles.emojiPickerOverlay,
              emojiPickerPos && { top: emojiPickerPos.top },
              emojiPickerPos?.isOwnMessage ? styles.emojiPickerRight : styles.emojiPickerLeft,
            ]}
          />
        </View>
      )}

      {/* Fullscreen Image Modal */}
      <Modal
        visible={!!fullscreenImage}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenImage(null)}
      >
        <Pressable style={styles.fullscreenOverlay} onPress={() => setFullscreenImage(null)}>
          <Image source={{ uri: fullscreenImage }} style={styles.fullscreenImage} resizeMode="contain" />
          <View style={styles.fullscreenClose}>
            <Ionicons name="close" size={28} color="#fff" />
          </View>
        </Pressable>
      </Modal>

      {/* Message Actions */}
      <ActionSheet
        isVisible={actionSheetVisible}
        onClose={() => {
          setActionSheetVisible(false);
          setSelectedMessage(null);
        }}
        title="Message"
        actions={selectedMessage ? getMessageActions(selectedMessage) : []}
      />
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
    justifyContent: 'flex-end',
  },
  dateHeader: {
    alignItems: 'center',
    marginVertical: SPACING.xl,
  },
  datePill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceElevated,
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
  deletedMessage: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: COLORS.separator,
  },
  deletedMessageText: {
    ...TYPOGRAPHY.subheadline,
    fontStyle: 'italic',
    color: COLORS.textMuted,
  },
  imageBubble: {
    paddingHorizontal: SPACING.xs,
    paddingTop: SPACING.xs,
  },
  messageImage: {
    width: 220,
    height: 220,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.xs,
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '100%',
    height: '80%',
  },
  fullscreenClose: {
    position: 'absolute',
    top: 60,
    right: 20,
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
  ownMessageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: SPACING.xs,
  },
  ownMessageTime: {
    color: 'rgba(255,255,255,0.6)',
  },
  readReceipt: {
    marginLeft: 2,
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
  messageContainer: {
  },
  emojiPickerOverlay: {
    position: 'absolute',
    zIndex: 200,
  },
  emojiPickerRight: {
    right: SPACING.lg,
  },
  emojiPickerLeft: {
    left: 36 + SPACING.lg,
  },
  reactionPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: -4,
    marginBottom: SPACING.xs,
  },
  ownReactionPills: {
    justifyContent: 'flex-end',
    paddingRight: SPACING.sm,
  },
  otherReactionPills: {
    justifyContent: 'flex-start',
    paddingLeft: 36 + SPACING.sm,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  reactionPillOwn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    ...TYPOGRAPHY.caption1,
    fontSize: 11,
    color: COLORS.textSecondary,
  },
});
