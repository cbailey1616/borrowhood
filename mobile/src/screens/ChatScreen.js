import ConversationsScreen from './ConversationsScreen';
import MessageComposer from '../components/MessageComposer';
import ComposerKeyboardView from '../components/ComposerKeyboardView';
import ActionButton from '../components/ActionButton';
import { privateMessagePrefix, messagePresentation } from '../utils/conversationContext';
import { mergeMessages } from '../utils/chatMessages';
import ConversationHeader from '../components/ConversationHeader';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Keyboard,
  ActivityIndicator,
  Modal,
  Pressable,
  useWindowDimensions,

} from 'react-native';
import Animated, {
  FadeInUp,
} from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import useFormDraft from '../hooks/useFormDraft';
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

export default function ChatScreen(props) {
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 900 && fontScale < 1.5;
  return <View style={{ flex: 1, flexDirection: 'row', backgroundColor: COLORS.background }}>
    {wide && <View style={{ width: 300, borderRightWidth: 1, borderRightColor: COLORS.separator }}>
      <Text accessibilityRole="header" style={{ ...TYPOGRAPHY.title2, color: COLORS.primary, padding: SPACING.lg }}>Messages</Text>
      <ConversationsScreen navigation={props.navigation} selectedId={props.route.params?.conversationId}
        onSelect={id => { if (id !== props.route.params?.conversationId) props.navigation.replace('Chat', { conversationId: id }); }} />
    </View>}
    <ChatConversation {...props} />
  </View>;
}

function ChatConversation({ route, navigation }) {
  const { conversationId, recipientId, recipient, threadContext, listingId, listing: passedListing } = route.params || {};
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible?.() ?? false);
  const nearBottom = useRef(true);
  const sending = useRef(false);
  const [chatError, setChatError] = useState('');
  const { user } = useAuth();
  const [conversation, setConversation] = useState(null);
  const otherUser = conversation?.otherUser || recipient || passedListing?.owner;
  const profileId = recipientId || otherUser?.id;
  const profileName = [otherUser?.firstName, otherUser?.lastName].filter(Boolean).join(' ') || 'neighbor';
  const [messagesBlocked, setMessagesBlocked] = useState(false);
  const [messages, setMessages] = useState([]);
  const contextId = threadContext?.id || listingId;
  const contextTitle = passedListing?.title || (listingId && conversation?.listing?.id === listingId ? conversation.listing.title : null);
  const routeContext = threadContext || (listingId && contextTitle ? { id: listingId, type: 'listing', title: contextTitle } : null);
  const contextKey = routeContext ? JSON.stringify([profileId, routeContext.type, routeContext.id, routeContext.title, routeContext.replyText]) : null;
  const [usedContextKey, setUsedContextKey] = useState(null);
  const activeContext = contextKey !== usedContextKey ? routeContext : null;
  const contextPrefix = privateMessagePrefix(activeContext);
  // A fresh visit from a post can introduce that subject again. Sending or
  // removing it consumes only this reference, never the whole conversation.
  useEffect(() => { setUsedContextKey(null); }, [threadContext, listingId, passedListing]);
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
      } else if (recipientId) {
        let current = true;
        api.getUser(recipientId).then(person => {
          if (current && person) setConversation({ otherUser: person });
        }).catch(() => {});
        return () => { current = false; };
      }
    }
  }, [conversationId, recipientId, isFocused]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: profileName === 'neighbor' ? 'Messages' : profileName,
      header: () => <ConversationHeader navigation={navigation} person={otherUser} userId={profileId} />,
    });
  }, [otherUser, profileId, profileName, navigation]);

  // Recheck when returning from a profile, where blocking is managed.
  useEffect(() => {
    if (!isFocused || !profileId) return;
    let current = true;
    api.getUserSafety(profileId).then(result => {
      if (current) setMessagesBlocked(result.blocked === true);
    }).catch(() => {});
    return () => { current = false; };
  }, [isFocused, profileId]);

  const openProfile = () => {
    if (profileId) navigation.navigate('UserProfile', { id: profileId });
  };

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
    if (sending.current || !draft.ready || messagesBlocked) return;
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
      if (pending.contextKey) setUsedContextKey(pending.contextKey);
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
    if ((!newMessage.trim() && !attachment) || sending.current || preparingPhoto.current || isUploading || composer.pending || !draft.ready || messagesBlocked) return;
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
      await deliver({ retryable: safeRetries, composerText: text, attachmentUri: selected?.uri, contextKey: activeContext ? contextKey : null, payload: {
        recipientId: recipient, ...(text || contextPrefix ? { content: (contextPrefix + text).trim() } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(activeContext?.type === 'listing' ? { listingId: activeContext.id } : {}),
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
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
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
    if (!message.isOwnMessage && profileId) {
      actions.push({
        label: 'View profile',
        icon: <Ionicons name="person-outline" size={20} color={COLORS.primary} />,
        onPress: () => navigation.navigate('UserProfile', { id: profileId }),
      });
    }
    return actions;
  }, [handleCopyMessage, handleDeleteMessage, profileId, navigation]);

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
    const next = messages[index + 1];
    const continuesGroup = next && !next.isDeleted && !item.isDeleted && next.isOwnMessage === item.isOwnMessage &&
      new Date(next.createdAt) - new Date(item.createdAt) < 5 * 60000 && formatDate(next.createdAt) === formatDate(item.createdAt);
    const { text, context } = messagePresentation(item.content);

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
            {!item.isOwnMessage && (continuesGroup ? <View style={styles.avatarSlot} /> :
              <HapticPressable onPress={openProfile} disabled={!profileId} style={styles.avatarSlot}
                accessibilityLabel={`View ${profileName}’s profile`} testID={`Chat.avatar.${item.id}`}>
                <ShimmerImage source={{ uri: otherUser?.profilePhotoUrl || null }} placeholderIcon="person" style={styles.messageAvatar} />
              </HapticPressable>)}
            {item.isDeleted ? (
              <View style={[styles.messageBubble, styles.deletedMessage]}>
                <Text style={styles.deletedMessageText}>This message was deleted</Text>
              </View>
            ) : (
              <HapticPressable
                onLongPress={() => handleMessageLongPress(item)}
                haptic="medium"
                accessible={false}
                accessibilityRole={undefined}
                style={[styles.messageBubble, item.isOwnMessage ? styles.ownMessage : styles.otherMessage, item.imageUrl && styles.imageBubble]}
              >
                {context && <View style={styles.messageContext}>
                  <View style={styles.messageContextTitle}>
                    <Ionicons name={context.type === 'request' ? 'chatbubble' : 'basket'} size={15} color={COLORS.primary} illustrated />
                    <Text style={styles.messageContextText}>{context.title}</Text>
                  </View>
                  {!!context.replyText && <Text style={styles.messageQuote}>“{context.replyText}”</Text>}
                </View>}
                {item.imageUrl && (
                  <HapticPressable onPress={() => setFullscreenImage(item.imageUrl)} haptic="light">
                    <ShimmerImage source={{ uri: item.imageUrl }} style={styles.messageImage} accessibilityLabel="Chat photo" />
                  </HapticPressable>
                )}
                {text ? (
                  <Text style={[styles.messageText, item.isOwnMessage ? styles.ownMessageText : styles.otherMessageText, item.imageUrl && styles.imageCaption]}>
                    {text}
                  </Text>
                ) : null}
                <View style={styles.ownMessageMeta}>
                  <Text style={[styles.messageTime, styles.ownMessageTime]}>
                    {formatTime(item.createdAt)}
                  </Text>
                </View>
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
        <ActivityIndicator size="large" color={COLORS.spinner} />
      </View>
    );
  }

  return (
    <ComposerKeyboardView
      testID="Chat.keyboardLayout"
      style={styles.container}
      onKeyboardVisibilityChange={setKeyboardVisible}
    >
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

      {messagesBlocked && <View style={styles.blockedNotice}>
        <Text style={styles.blockedText}>Messaging is blocked.</Text>
        <HapticPressable onPress={openProfile} style={styles.profileLink}><Text style={styles.profileLinkText}>View profile</Text></HapticPressable>
      </View>}
      {showNewMessages && <HapticPressable accessibilityRole="button" onPress={() => { nearBottom.current = true; setShowNewMessages(false); flatListRef.current?.scrollToEnd({ animated: true }); }} style={{ alignSelf: 'center', padding: 14, minHeight: 44, backgroundColor: COLORS.primaryMuted, borderRadius: 22, margin: 8 }}><Text style={{ color: COLORS.primary, fontWeight: '400' }}>New messages ↓</Text></HapticPressable>}
      {!!chatError && <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: COLORS.warningMuted }}>
        <Text accessibilityRole="alert" style={{ color: COLORS.text, fontSize: 14, lineHeight: 20 }}>{chatError}</Text>
        {!!conversationId && <ActionButton onPress={fetchMessages} label="Refresh conversation" style={{ marginTop: 8 }} />}
      </View>}
      {!!composer.pending && !isSending && <View style={{ paddingHorizontal: 16, backgroundColor: COLORS.warningMuted }}>
        <Text accessibilityRole="alert" style={{ color: COLORS.text, fontSize: 13, paddingTop: 8 }}>Unconfirmed {composer.pending.payload.imageUrl ? 'photo' : 'message'}{composer.pending.payload.content ? `: ${composer.pending.payload.content.slice(0, 90)}` : ''}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 }}>
          {composer.pending.retryable && safeRetries && !messagesBlocked && <ActionButton onPress={() => deliver(composer.pending)} label="Retry send" />}
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
        {!!contextPrefix && !composer.pending && <View testID="Chat.postReference" style={styles.postReference}>
          <HapticPressable style={styles.postReferenceLink} accessibilityLabel={`View ${activeContext.title}`}
            onPress={() => navigation.navigate(activeContext.type === 'request' ? 'RequestDetail' : 'ListingDetail', { id: activeContext.id })}>
            <Ionicons name={activeContext.type === 'request' ? 'chatbubble' : 'basket'} size={18} color={COLORS.primary} illustrated />
            <View style={{ flex: 1 }}>
              <Text style={styles.postReferenceText}>About: {activeContext.title}</Text>
              {!!activeContext.replyText && <Text style={styles.postReferenceQuote} numberOfLines={2}>“{activeContext.replyText}”</Text>}
            </View>
          </HapticPressable>
          <HapticPressable style={styles.removeReference} accessibilityLabel="Remove post reference"
            disabled={isSending || isUploading || !draft.ready} onPress={() => setUsedContextKey(contextKey)}>
            <Ionicons name="close" size={18} color={COLORS.primary} />
          </HapticPressable>
        </View>}
        <MessageComposer
          testID="Chat.composer"
          value={newMessage}
          onChangeText={setNewMessage}
          onSend={handleSend}
          placeholder="Message…"
          inputTestID="Chat.input.message"
          maxLength={2000 - contextPrefix.length}
          loading={isSending || isUploading}
          editable={!messagesBlocked}
          disabled={(!newMessage.trim() && !attachment) || !!composer.pending || !draft.ready || messagesBlocked}
          leadingAction={
            <HapticPressable accessibilityLabel="Attach a photo" accessibilityRole="button" style={styles.attachPhotoButton} onPress={() => setPhotoMenuVisible(true)} disabled={isUploading || isSending || !!composer.pending || !draft.ready || messagesBlocked}>
              {isUploading ? <ActivityIndicator color={COLORS.spinner} /> : <Ionicons name="add" size={26} color={COLORS.primary} />}
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
    </ComposerKeyboardView>
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
  messagesContent: {
    padding: SPACING.lg,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  dateHeader: {
    alignItems: 'center',
    marginVertical: SPACING.md,
  },
  datePill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceElevated,
  },
  dateText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '400',
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
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryMuted,
  },
  avatarSlot: { width: 44, minHeight: 44, alignItems: 'flex-start', justifyContent: 'flex-end', paddingBottom: 2, opacity: 1 },
  messageBubble: {
    maxWidth: '82%',
    flexShrink: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.lg,
  },
  ownMessage: {
    backgroundColor: COLORS.chatOwn,
    borderBottomRightRadius: SPACING.sm,
  },
  otherMessage: {
    backgroundColor: COLORS.surface,
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
    ...TYPOGRAPHY.body,
    lineHeight: 23,
  },
  messageContext: { borderLeftWidth: 2, borderLeftColor: COLORS.primary, paddingLeft: SPACING.sm, marginBottom: SPACING.sm, marginTop: 2 },
  messageContextTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  messageContextText: { ...TYPOGRAPHY.caption1, color: COLORS.primary, flexShrink: 1 },
  messageQuote: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary, marginTop: SPACING.xs },
  imageCaption: { paddingHorizontal: SPACING.sm },
  ownMessageText: {
    color: COLORS.chatOwnText,
  },
  otherMessageText: {
    color: COLORS.text,
  },
  messageTime: {
    ...TYPOGRAPHY.caption1,
    fontSize: 11,
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
  postReference: { flexDirection: 'row', alignItems: 'center', paddingLeft: SPACING.md, paddingRight: SPACING.xs, marginBottom: SPACING.xs, backgroundColor: COLORS.surface, borderRadius: RADIUS.md },
  postReferenceLink: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm },
  postReferenceText: { ...TYPOGRAPHY.footnote, color: COLORS.primary },
  postReferenceQuote: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary, marginTop: 2 },
  removeReference: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  attachPhotoButton: {
    width: 44,
    height: 44,
    marginBottom: 2,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageContainer: {
  },
  blockedNotice: { paddingHorizontal: SPACING.lg, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm },
  blockedText: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  profileLink: { minHeight: 44, justifyContent: 'center' },
  profileLinkText: { ...TYPOGRAPHY.footnote, color: COLORS.primary, textDecorationLine: 'underline' },
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
