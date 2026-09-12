import MessageComposer from '../components/MessageComposer';
import ActionButton from '../components/ActionButton';
import { requestPresentation } from '../utils/requestPresentation';
import { privateMessagePrefix } from '../utils/conversationContext';
import { mergeMessages } from '../utils/chatMessages';
import UserSafetyActions from '../components/UserSafetyActions';
import { useIsFocused } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Pressable,

} from 'react-native';
import Animated, {
  FadeInUp,
} from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import useFormDraft from '../hooks/useFormDraft';
import ChatExchangeCard from '../components/ChatExchangeCard';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '../components/Icon';
import HeroIcon from '../components/HeroIcon';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import ShimmerImage from '../components/ShimmerImage';
import { ThemedAlert as Alert } from '../components/ThemedAlert';
import EmojiReactionPicker from '../components/EmojiReactionPicker';
import { useAuth } from '../context/AuthContext';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function ChatScreen({ route, navigation }) {
  const { conversationId, recipientId, recipient, threadContext, listingId, listing: passedListing } = route.params || {};
  const isFocused = useIsFocused();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible?.() ?? false);
  const nearBottom = useRef(true);
  const sending = useRef(false);
  const [chatError, setChatError] = useState('');
  const { user } = useAuth();
  const [conversation, setConversation] = useState(null);
  const [hasExchange, setHasExchange] = useState(false);
  const [messages, setMessages] = useState([]);
  const contextId = threadContext?.id || listingId;
  const activeContext = threadContext || (listingId && (passedListing?.title || conversation?.listing?.title) ? { id: listingId, type: 'listing', title: passedListing?.title || conversation.listing.title } : null);
  const contextPrefix = privateMessagePrefix(activeContext);
  const draftTarget = recipientId || conversation?.otherUser?.id;
  const [composer, setComposer, draft] = useFormDraft(user?.id && draftTarget ? `${user.id}.chat.${draftTarget}${contextId ? `.${threadContext?.type || 'listing'}.${contextId}` : ''}` : null, { text: '', pending: null });
  const newMessage = composer.text;
  const setNewMessage = text => setComposer(current => ({ ...current, text }));
  const [safeRetries, setSafeRetries] = useState(false);
  useEffect(() => {
    let active = true;
    api.getMessageCapabilities().then(data => { if (active) setSafeRetries(data.idempotentMessages === true); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [photoMenuVisible, setPhotoMenuVisible] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const preparingPhoto = useRef(false);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [emojiPickerMessage, setEmojiPickerMessage] = useState(null);
  const [emojiPickerPos, setEmojiPickerPos] = useState(null);
  const flatListRef = useRef(null);
  const messageRefs = useRef({});
  const knownMessageIds = useRef(new Set());
  const [showNewMessages, setShowNewMessages] = useState(false);
  useEffect(() => { knownMessageIds.current = new Set(messages.map(message => message.id)); }, [messages]);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    if (conversationId) {
      fetchMessages();
      // Poll for new messages every 5 seconds
      const interval = setInterval(() => {
        if (conversationId) {
          api.getConversation(conversationId).then(data => {
            if (!nearBottom.current && (data.messages || []).some(message => !knownMessageIds.current.has(message.id))) setShowNewMessages(true);
            setMessages(prev => mergeMessages(prev, data.messages || []));
          }).catch(() => {});
        }
      }, 5000);
      return () => clearInterval(interval);
    } else {
      // New conversation - set up initial state
      setIsLoading(false);
      if (recipient) {
        setConversation({ otherUser: recipient });
      } else if (passedListing) {
        setConversation({
          listing: passedListing,
          otherUser: passedListing.owner,
        });
      }
    }
  }, [conversationId, recipientId, isFocused]);

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
      setMessages(prev => mergeMessages(prev, data.messages || []));
      setChatError('');
    } catch (error) {
      setChatError('Couldn’t refresh messages. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const deliver = async pending => {
    if (sending.current || !draft.ready) return;
    sending.current = true;
    setChatError('');
    setIsSending(true);
    let acknowledged = false;
    try {
      setComposer(current => ({ ...current, pending }));
      // Persist the immutable attempt before sending; retries keep the same ID.
      if (!(await draft.retry())) throw new Error('draft-storage');
      const result = await api.sendMessage(pending.payload);
      acknowledged = true;
      let remainingText;
      setComposer(current => {
        remainingText = pending.payload.content && current.text.trim() === (pending.composerText ?? pending.payload.content) ? '' : current.text;
        return { ...current, pending: null, text: remainingText };
      });
      if (!conversationId && result.conversationId) navigation.setParams({ conversationId: result.conversationId });
      nearBottom.current = true;
      // Add message to list
      const newMsg = {
        id: result.id,
        senderId: user.id,
        content: pending.payload.content || null,
        // Upload references point into the private bucket. Display the signed
        // URL returned by the API immediately, without waiting for the next poll.
        imageUrl: result.imageUrl || pending.payload.imageUrl,
        isOwnMessage: true,
        isRead: false,
        createdAt: result.createdAt || new Date().toISOString(),
      };
      setMessages(prev => mergeMessages(prev, [newMsg]));
      if (pending.attachmentUri) setAttachment(current => current?.uri === pending.attachmentUri ? null : current);

      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      // Local cleanup follows the server acknowledgement. Its failure must not
      // label a delivered message as unsent or offer a second send.
      if (remainingText.trim()) await draft.retry();
      else await draft.clear();
    } catch (error) {
      if (acknowledged) return;
      setChatError(error.message === 'draft-storage' ? 'Couldn’t save this send attempt on your device. Nothing was sent.' : 'Send not confirmed. Your message is kept here until you check or retry.');
      haptics.error();
    } finally {
      sending.current = false;
      setIsSending(false);
    }
  };

  const handleSend = async () => {
    if ((!newMessage.trim() && !attachment) || sending.current || preparingPhoto.current || isUploading || composer.pending || !draft.ready) return;
    const recipient = recipientId || conversation?.otherUser?.id;
    if (!recipient) return setChatError('Couldn’t identify the recipient. Reopen this conversation.');
    const text = newMessage.trim();
    const selected = attachment;
    preparingPhoto.current = true;
    try {
      let imageUrl = selected?.imageUrl;
      if (selected && !imageUrl) {
        setIsUploading(true);
        imageUrl = await api.uploadImage(selected.uri, 'messages');
        setAttachment(current => current?.uri === selected.uri ? { ...current, imageUrl } : current);
      }
      await deliver({ retryable: safeRetries, composerText: text, attachmentUri: selected?.uri, payload: {
        recipientId: recipient, ...(text || contextPrefix ? { content: (contextPrefix + text).trim() } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(activeContext?.type === 'request' ? {} : { listingId: listingId || conversation?.listing?.id }),
        ...(safeRetries ? { clientRequestId: Crypto.randomUUID() } : {}),
      } });
    } catch {
      setChatError('Couldn’t upload the photo. It’s still here—tap send to try again.');
      haptics.error();
    } finally {
      preparingPhoto.current = false;
      setIsUploading(false);
    }
  };

  const dismissPending = () => Alert.alert('Stop tracking this send?', 'This does not unsend anything. Check the conversation first: the message may already have arrived.', [
    { text: 'Keep it here', style: 'cancel' },
    { text: 'I checked — clear it', onPress: () => setComposer(current => ({ ...current, pending: null })) },
  ]);

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

  const handlePickImage = async (camera = false) => {
    if (preparingPhoto.current || sending.current || composer.pending || !draft.ready) return;
    preparingPhoto.current = true;
    setChatError('');
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== 'granted') {
          setChatError('Allow camera access in Settings to take a photo, or choose one from your library.');
          return;
        }
      }
      const pick = camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
      const result = await pick({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true });
      if (!result.canceled && result.assets?.[0]?.uri) setAttachment({ uri: result.assets[0].uri });
    } catch (error) {
      setChatError('Couldn’t open the photo picker. Please try again.');
      haptics.error();
    } finally {
      preparingPhoto.current = false;
    }
  };

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
            {!item.isOwnMessage && (otherUser?.profilePhotoUrl ? <Image source={{ uri: otherUser.profilePhotoUrl }} style={styles.messageAvatar} /> : <View style={[styles.messageAvatar, { backgroundColor: COLORS.surfaceElevated, alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="person-outline" size={16} color={COLORS.textSecondary} /></View>)}
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
                    <ShimmerImage source={{ uri: item.imageUrl }} style={styles.messageImage} accessibilityLabel="Chat photo" />
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
                    color={item.isRead ? COLORS.primary : COLORS.textMuted}
                    style={styles.readReceipt}
                  />
                </View>
              </HapticPressable>
            ) : (
              <HapticPressable
                onLongPress={() => handleMessageLongPress(item)}
                haptic="medium"
                style={[styles.messageBubble, styles.otherMessage, item.imageUrl && styles.imageBubble]}
              >
                  {item.imageUrl && (
                    <HapticPressable onPress={() => setFullscreenImage(item.imageUrl)} haptic="light">
                      <ShimmerImage source={{ uri: item.imageUrl }} style={styles.messageImage} accessibilityLabel="Chat photo" />
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
      testID="Chat.keyboardLayout"
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      {/* Listing Context Header */}
      <UserSafetyActions userId={recipientId || conversation?.otherUser?.id} />
      {threadContext?.id && <HapticPressable style={styles.listingHeader} accessibilityRole="button"
        accessibilityLabel={`View ${threadContext.title || 'original thread'}`}
        onPress={() => navigation.navigate(threadContext.type === 'request' ? 'RequestDetail' : 'ListingDetail', { id: threadContext.id })}>
        <Ionicons name={threadContext.type === 'request' ? requestPresentation(threadContext.requestType).icon : 'chatbubble'} size={28} color={COLORS.primary} illustrated />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: COLORS.text, fontWeight: '600' }}>{threadContext.title || 'From the thread'}</Text>
          {!!threadContext.replyText && <Text style={{ color: COLORS.textSecondary, fontSize: 12 }} numberOfLines={2}>Replying to: “{threadContext.replyText}”</Text>}
          <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>{threadContext.type === 'request' ? requestPresentation(threadContext.requestType).label : 'About this item'}</Text>
        </View>
      </HapticPressable>}
      {!threadContext && conversation?.listing && !hasExchange && (
        <HapticPressable
          style={styles.listingHeader}
          onPress={() => navigation.navigate('ListingDetail', { id: conversation.listing.id })}
          haptic="light"
        >
          {(conversation.listing.photoUrl || conversation.listing.photos?.[0]) ? <Image source={{ uri: conversation.listing.photoUrl || conversation.listing.photos[0] }} style={styles.listingImage} /> : <View style={[styles.listingImage, { backgroundColor: COLORS.surfaceElevated, alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="cube-outline" size={20} color={COLORS.primary} /></View>}
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
      {threadContext?.requestType !== 'service' && <ChatExchangeCard userId={user.id} otherId={recipientId || conversation?.otherUser?.id} listingId={listingId || conversation?.listing?.id} navigation={navigation} focused={isFocused} onActiveChange={setHasExchange} />}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => { setEmojiPickerMessage(null); setEmojiPickerPos(null); }}
        onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => { nearBottom.current = contentSize.height - layoutMeasurement.height - contentOffset.y < 100; }}
        scrollEventThrottle={100}
        onContentSizeChange={() => { if (nearBottom.current) flatListRef.current?.scrollToEnd({ animated: false }); }}
        ListEmptyComponent={
          <View style={styles.emptyMessages}>
            <HeroIcon icon="chatbubble-outline" size={80} />
<Text style={styles.emptyText}>Say hello and arrange the details here.</Text>
          </View>
        }
      />

      {showNewMessages && <HapticPressable accessibilityRole="button" onPress={() => { nearBottom.current = true; setShowNewMessages(false); flatListRef.current?.scrollToEnd({ animated: true }); }} style={{ alignSelf: 'center', padding: 14, minHeight: 44, backgroundColor: COLORS.primaryMuted, borderRadius: 22, margin: 8 }}><Text style={{ color: COLORS.primary, fontWeight: '600' }}>New messages ↓</Text></HapticPressable>}
      {!!chatError && <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: COLORS.warningMuted }}>
        <Text accessibilityRole="alert" style={{ color: COLORS.text, fontSize: 14, lineHeight: 20 }}>{chatError}</Text>
        {!!conversationId && <ActionButton onPress={fetchMessages} label="Refresh conversation" style={{ marginTop: 8 }} />}
      </View>}
      {!!composer.pending && !isSending && <View style={{ paddingHorizontal: 16, backgroundColor: COLORS.warningMuted }}>
        <Text accessibilityRole="alert" style={{ color: COLORS.text, fontSize: 13, paddingTop: 8 }}>Unconfirmed {composer.pending.payload.imageUrl ? 'photo' : 'message'}{composer.pending.payload.content ? `: ${composer.pending.payload.content.slice(0, 90)}` : ''}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 }}>
          {composer.pending.retryable && safeRetries && <ActionButton onPress={() => deliver(composer.pending)} label="Retry send" />}
          <ActionButton onPress={dismissPending} label="Clear after checking" />
        </View>
        {!composer.pending.retryable && <Text style={{ color: COLORS.textSecondary, fontSize: 12, paddingBottom: 8 }}>Check the conversation before sending again. Safe retries need the updated server.</Text>}
      </View>}
      {draft.error && !!newMessage.trim() && <Text accessibilityRole="alert" style={{ color: COLORS.danger, paddingHorizontal: 16, paddingVertical: 8, fontSize: 13 }}>Couldn’t save your unsent message. Keep this conversation open.</Text>}
      {!!attachment && <View style={styles.attachmentPreview}>
        <Image source={{ uri: attachment.uri }} style={styles.attachmentThumbnail} accessibilityLabel="Photo ready to send" />
        <Text style={styles.attachmentLabel}>{isUploading ? 'Sending photo…' : 'Photo ready to send'}</Text>
        <HapticPressable accessibilityRole="button" accessibilityLabel="Remove attached photo" disabled={isUploading || isSending || !!composer.pending} onPress={() => setAttachment(null)} style={styles.removeAttachment}>
          <Ionicons name="close" size={22} color={COLORS.primary} />
        </HapticPressable>
      </View>}
      <View testID="Chat.composerDock" style={[styles.inputContainer, { paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 12) }]}>
        <MessageComposer
          testID="Chat.composer"
          value={newMessage}
          onChangeText={setNewMessage}
          onSend={handleSend}
          placeholder="Private message…"
          inputTestID="Chat.input.message"
          maxLength={2000 - contextPrefix.length}
          loading={isSending || isUploading}
          disabled={(!newMessage.trim() && !attachment) || !!composer.pending || !draft.ready}
          leadingAction={
            <HapticPressable accessibilityLabel="Attach a photo" accessibilityRole="button" style={styles.attachPhotoButton} onPress={() => setPhotoMenuVisible(true)} disabled={isUploading || isSending || !!composer.pending || !draft.ready}>
              {isUploading ? <ActivityIndicator color={COLORS.primary} /> : <Ionicons name="add" size={26} color={COLORS.primary} />}
            </HapticPressable>
          }
        />
      </View>
      <ActionSheet isVisible={photoMenuVisible} onClose={() => setPhotoMenuVisible(false)} title="Add a photo" actions={[
        { label: 'Take a photo', icon: <Ionicons name="camera-outline" size={24} color={COLORS.primary} />, onPress: () => handlePickImage(true) },
        { label: 'Choose from library', icon: <Ionicons name="images-outline" size={24} color={COLORS.primary} />, onPress: () => handlePickImage(false) },
      ]} />
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
  attachmentPreview: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: COLORS.surface },
  attachmentThumbnail: { width: 72, height: 72, borderRadius: RADIUS.md },
  attachmentLabel: { flex: 1, color: COLORS.primary, fontSize: 14 },
  removeAttachment: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
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
    backgroundColor: COLORS.surface,
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
    backgroundColor: 'transparent',
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
    borderRadius: 10,
    marginRight: SPACING.sm,
    backgroundColor: COLORS.gray[700],
  },
  messageBubble: {
    maxWidth: '84%',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.xl,
  },
  ownMessage: {
    backgroundColor: COLORS.chatOwn,
    borderBottomRightRadius: SPACING.sm,
  },
  otherMessage: {
    backgroundColor: COLORS.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.borderBrown,
    borderBottomLeftRadius: SPACING.sm,
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
    lineHeight: 23,
  },
  ownMessageText: {
    color: COLORS.chatOwnText,
  },
  otherMessageText: {
    color: COLORS.text,
  },
  messageTime: {
    ...TYPOGRAPHY.caption1,
    fontSize: 11,
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
    color: COLORS.textSecondary,
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
  inputContainer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  attachPhotoButton: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderWidth: 1,
    borderColor: COLORS.borderLight,
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
