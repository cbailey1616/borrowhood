import * as Clipboard from 'expo-clipboard';
import MessageReactionMenu from './MessageReactionMenu';
import MessageBubble, { ChatDateDivider } from './MessageBubble';
import { chatMessageMeta } from '../utils/chatPresentation';
import { communityMessageContent, communityPhotoContent, PHOTO_CAPTION_LIMIT } from '../utils/communityChatPhoto';
import NeighborhoodChatHeader from './NeighborhoodChatHeader';
import QuietChatPrompt from './QuietChatPrompt';
import ShimmerImage from './ShimmerImage';
import * as ImagePicker from 'expo-image-picker';
import ContentSafetyActions from './ContentSafetyActions';
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, AppState, Keyboard, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import HapticPressable from './HapticPressable';
import MessageComposer from './MessageComposer';
import ComposerKeyboardView from './ComposerKeyboardView';
import ActionSheet from './ActionSheet';
import { ThemedAlert as Alert } from './ThemedAlert';
import { Ionicons } from './Icon';
import useReduceMotion from '../hooks/useReduceMotion';

// The neighborhood page and Inbox both mount this same channel by community ID.
export default function CommunityChat({ community, navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [messages, setMessages] = useState([]);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible?.() ?? false);
  const [text, setText] = useState('');
  const [group, setGroup] = useState(community);
  const [attachment, setAttachment] = useState(null);
  const [photoPreparing, setPhotoPreparing] = useState(false);
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null);
  const input = useRef(null);
  const pickingPhoto = useRef(false);
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [nextBefore, setNextBefore] = useState(null);
  const [muted, setMuted] = useState(false);
  const [role, setRole] = useState(community.role);
  const [reactionTarget, setReactionTarget] = useState(null);
  const reacting = useRef(false);
  const [menu, setMenu] = useState(null);
  const [safetyTarget, setSafetyTarget] = useState(null);
  const alive = useRef(false);
  const generation = useRef(0);
  const sendLock = useRef(false);
  const retry = useRef(null);
  const list = useRef(null);
  const nearBottom = useRef(true);
  const requestNumber = useRef(0);
  const draft = useRef(new Map());
  const id = community.id;
  // The server state stays newest-first; the visible chat reads top-to-bottom.
  const chronologicalMessages = [...messages].reverse();
  const lastDate = new Date(chronologicalMessages.at(-1)?.createdAt).getTime();
  const quiet = !thread && !keyboardVisible && !loading && !error && chronologicalMessages.length > 0
    && chronologicalMessages.length <= 3 && lastDate < Date.now() - 24 * 60 * 60 * 1000;

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      try { const details = await api.getCommunity(id); if (active && details) setGroup(details); }
      catch { /* Keep the route identity available while chat retries normally. */ }
    })();
    return () => { active = false; };
  }, [id, user?.id]));

  const refresh = useCallback(async (before) => {
    const token = generation.current;
    const request = ++requestNumber.current;
    try {
      const result = await api.getCommunityChat(id, { ...(thread ? { parentId: thread.id } : {}), ...(before ? { before } : {}) });
      if (!alive.current || token !== generation.current || request !== requestNumber.current) return;
      if (thread && result.parent) setThread(previous => previous?.id === result.parent.id ? { ...previous, ...result.parent } : previous);
      setMessages(old => {
        const merged = new Map((before ? old : []).map(m => [m.id, m]));
        result.messages.filter(m => !thread || m.id !== thread.id).forEach(m => merged.set(m.id, m));
        return [...merged.values()].sort((a, b) => Number(b.sequence) - Number(a.sequence));
      });
      setNextBefore(result.nextBefore); setMuted(result.muted); setRole(result.role); setError('');
      if (!before && nearBottom.current) await api.markCommunityChatRead(id, result.readSequence);
    } catch (err) {
      if (alive.current && token === generation.current) {
        setError(err.message || 'Could not load chat. Tap to retry.');
        if (err.status === 403) setMessages([]);
      }
    } finally { if (alive.current && token === generation.current) setLoading(false); }
  }, [id, thread?.id]);

  useFocusEffect(useCallback(() => {
    alive.current = true; generation.current += 1;
    setMessages([]); setLoading(true); nearBottom.current = true;
    refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && nearBottom.current) refresh();
    }, 8000);
    return () => { alive.current = false; generation.current += 1; clearInterval(timer); };
  }, [refresh, user?.id]));

  const changeThread = next => {
    draft.current.set(thread?.id || 'main', { text, attachment });
    const saved = draft.current.get(next?.id || 'main');
    setText(saved?.text || ''); setAttachment(saved?.attachment || null);
    setThread(next); retry.current = null;
  };
  const pickPhoto = async (camera = false) => {
    if (pickingPhoto.current || sending || loading) return;
    pickingPhoto.current = true; setPhotoPreparing(true); setError('');
    const token = generation.current;
    try {
      if (camera && (await ImagePicker.requestCameraPermissionsAsync()).status !== 'granted') {
        if (alive.current && token === generation.current) setError('Allow camera access in Settings, or choose a photo from your library.');
        return;
      }
      const picker = camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
      const result = await picker({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true });
      if (alive.current && token === generation.current && !result.canceled && result.assets?.[0]?.uri) {
        setAttachment({ uri: result.assets[0].uri }); input.current?.focus();
      }
    } catch { if (alive.current && token === generation.current) setError('We couldn’t open your photos. Choose a photo again to continue.'); }
    finally { pickingPhoto.current = false; if (alive.current) setPhotoPreparing(false); }
  };
  const send = async () => {
    if ((!text.trim() && !attachment) || sendLock.current || photoPreparing) return;
    sendLock.current = true; setSending(true);
    const caption = text.trim();
    const selected = attachment;
    const key = `${id}:${thread?.id || ''}:${caption}:${selected?.uri || ''}`;
    const token = generation.current;
    if (retry.current?.key !== key) retry.current = { key, clientRequestId: Crypto.randomUUID() };
    const pending = retry.current;
    try {
      if (selected && !pending.photoUrl) {
        pending.photoUrl = selected.photoUrl || await api.uploadImage(selected.uri, 'messages');
        if (!alive.current || token !== generation.current) return;
        setAttachment(current => current?.uri === selected.uri ? { ...current, photoUrl: pending.photoUrl } : current);
      }
      const content = selected ? communityPhotoContent(pending.photoUrl, caption) : caption;
      if (content.length > 2000) throw new Error('Shorten your photo caption to send this message.');
      await api.sendCommunityMessage(id, { content, parentId: thread?.id || null, clientRequestId: pending.clientRequestId });
      if (!alive.current || token !== generation.current) return;
      setText(''); setAttachment(null); retry.current = null; nearBottom.current = true;
      await refresh(); list.current?.scrollToEnd({ animated: !reduceMotion });
    } catch (err) { if (alive.current && token === generation.current) setError(err.message || 'Message not sent. Try again.'); }
    finally { sendLock.current = false; if (alive.current) setSending(false); }
  };
  const remove = message => Alert.alert('Remove message?', '', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => {
      try { await api.deleteCommunityMessage(id, message.id); await refresh(); }
      catch (err) { setError(err.message || 'Could not remove message.'); }
    } },
  ]);
  const toggleMute = async () => {
    try { const result = await api.setCommunityChatMuted(id, !muted); setMuted(result.muted); }
    catch (err) { setError(err.message || 'Could not update mute setting.'); }
  };
  const openReactions = (message,event) => {
    if (message.deleted) return;
    setReactionTarget({ message, position: event?.nativeEvent?.pageY ? { y: event.nativeEvent.pageY } : undefined });
  };
  const react = async (message,emoji) => {
    if (reacting.current) return;
    reacting.current = true; setReactionTarget(null);
    const token = generation.current;
    const removing = (message.reactions || []).some(r => r.userId === user.id && r.emoji === emoji);
    try {
      await (removing ? api.removeCommunityReaction(id,message.id) : api.reactToCommunityMessage(id,message.id,emoji));
      if (!alive.current || token !== generation.current) return;
      const update = m => !m || m.id !== message.id ? m : {...m,reactions:[...(m.reactions || []).filter(r => r.userId !== user.id),...(removing?[]:[{userId:user.id,emoji}])]};
      setMessages(old => old.map(update));setThread(update);
    } catch { if (alive.current && token === generation.current) setError('Couldn’t update reaction. Try again.'); }
    finally { reacting.current = false; }
  };
  const options = menu === 'attachments' ? [
    { label: 'Choose a photo', icon: <Ionicons name="image-outline" size={22} />, onPress: () => pickPhoto() },
    { label: 'Take a photo', icon: <Ionicons name="camera-outline" size={22} />, onPress: () => pickPhoto(true) },
  ] : menu === 'channel' ? [
    { label: muted ? 'Unmute chat' : 'Mute chat', onPress: toggleMute, haptic: 'selection' },
    { label: 'Neighborhood settings', onPress: () => navigation.navigate('CommunitySettings', { id }) },
  ] : menu ? [
    ...(!menu.deleted && communityMessageContent(menu.content).photoUrl ? [{ label: 'View photo', onPress: () => setFullscreenPhoto(communityMessageContent(menu.content).photoUrl) }] : []),
    ...(!menu.deleted && menu.sender.id !== user?.id ? [{ label: 'Report or block', onPress: () => setSafetyTarget(menu.id) }] : []),
    ...(!menu.deleted ? [{ label: 'Add reaction', onPress: () => openReactions(menu) }, { label: 'Reply in thread', onPress: () => changeThread(menu.parentId ? thread : menu) }, { label: 'Copy text', onPress: () => Clipboard.setStringAsync(menu.content) }] : []),
    ...(role === 'organizer' || menu.sender.id === user?.id ? [{ label: 'Remove message', destructive: true, onPress: () => remove(menu) }] : []),
  ] : [];

  const renderMessage = ({ item, index, isRoot = false }) => {
    const previous = isRoot ? null : chronologicalMessages[index - 1] || thread;
    const meta = chatMessageMeta(item, previous, undefined, { groupAcrossPauses: true });
    const own = item.sender.id === user?.id;
    const content = item.deleted ? { text: 'Message removed' } : communityMessageContent(item.content);
    return <View>
      {!isRoot && meta.showDate && <ChatDateDivider label={meta.day} quiet />}
      <MessageBubble testID={`CommunityChat.message.${item.id}`} own={own} startsGroup={meta.startsGroup} quiet
        senderName={item.sender.name} showSender avatarUrl={item.sender.photoUrl}
        onProfile={() => navigation.navigate('UserProfile', { id: item.sender.id })}
        profileAccessibilityLabel={`View ${item.sender.name}'s profile`}
        time={isRoot ? `${meta.day} · ${meta.time}` : meta.time} deleted={item.deleted}
        accessibilityLabel={`${item.sender.name}: ${content.photoUrl ? 'Photo. ' : ''}${content.text}`}
        onLongPress={() => setMenu(item)}
        reactions={item.reactions} userId={user.id} onToggleReaction={emoji => react(item, emoji)}
        onReply={!thread && item.replyCount > 0 ? () => changeThread(item) : undefined}
        replyLabel={item.replyCount ? `${item.replyCount} ${item.replyCount === 1 ? 'reply' : 'replies'}` : 'Reply'}
        replyAccessibilityLabel={`Reply to ${item.sender.name}`}>
        {!!content.photoUrl && <HapticPressable haptic={null} scaleDown={1} onPress={() => setFullscreenPhoto(content.photoUrl)} onLongPress={() => setMenu(item)} longPressHaptic="selection" accessibilityLabel="View chat photo">
          <ShimmerImage source={{ uri: content.photoUrl }} style={styles.messagePhoto} accessibilityLabel="Chat photo" />
        </HapticPressable>}
        {!!content.text && <Text style={[styles.body, item.deleted && styles.deleted, content.photoUrl && styles.photoCaption]}>{content.text}</Text>}
      </MessageBubble>
    </View>;
  };

  return <ComposerKeyboardView style={styles.container} testID="CommunityChat.keyboardLayout" onKeyboardVisibilityChange={setKeyboardVisible}>
    <NeighborhoodChatHeader name={group.name || community.name} memberCount={group.memberCount} muted={muted} thread={!!thread}
      onBack={() => thread ? changeThread(null) : navigation.canGoBack?.() ? navigation.goBack() : navigation.navigate('Main', { screen: 'Inbox' })}
      onOptions={() => setMenu('channel')} />
    {!!error && <HapticPressable haptic={null} scaleDown={1} onPress={() => refresh()} style={styles.error}><Text style={styles.errorText}>{error}</Text></HapticPressable>}
    {loading ? <ActivityIndicator style={styles.conversation} color={COLORS.spinner} /> : <FlatList
      ref={list} style={styles.conversation} data={chronologicalMessages} keyExtractor={item => item.id}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
      contentContainerStyle={[styles.messages, !chronologicalMessages.length && styles.emptyMessages, { paddingLeft: Math.max(insets.left, SPACING.lg), paddingRight: Math.max(insets.right, SPACING.lg) }]}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
        nearBottom.current = contentSize.height - layoutMeasurement.height - contentOffset.y < 80;
      }} scrollEventThrottle={100}
      onContentSizeChange={() => { if (nearBottom.current) list.current?.scrollToEnd({ animated: false }); }}
      onLayout={() => { if (nearBottom.current) list.current?.scrollToEnd({ animated: false }); }}
      ListHeaderComponent={<>
        {nextBefore && <HapticPressable haptic={null} scaleDown={1} onPress={() => { nearBottom.current = false; refresh(nextBefore); }} style={styles.more}><Text maxFontSizeMultiplier={1.4} style={styles.link}>Earlier messages</Text></HapticPressable>}
        {thread && <View style={styles.threadParent}>
          {renderMessage({ item: thread, index: 0, isRoot: true })}
          <View style={styles.replyDivider}><Text maxFontSizeMultiplier={1.4} style={styles.replyDividerText}>Replies</Text><View style={styles.replyDividerLine} /></View>
        </View>}
      </>}
      ListEmptyComponent={!error && (thread ? <Text style={styles.empty}>No replies yet.</Text> : <QuietChatPrompt onChoose={message => { setText(message); input.current?.focus(); }} />)}
      ListFooterComponent={quiet ? <QuietChatPrompt onChoose={message => { setText(message); input.current?.focus(); }} /> : null}
      ListFooterComponentStyle={quiet ? styles.quietFooter : undefined}
      renderItem={renderMessage}
    />}
    <View testID="CommunityChat.composerDock" style={[styles.dock, { paddingBottom: keyboardVisible ? SPACING.sm : Math.max(insets.bottom, SPACING.lg), paddingLeft: Math.max(insets.left, SPACING.lg), paddingRight: Math.max(insets.right, SPACING.lg) }]}>
      {!!attachment && <View style={styles.attachment}>
        <ShimmerImage source={{ uri: attachment.uri }} style={styles.attachmentPhoto} accessibilityLabel="Selected chat photo" />
        <Text style={styles.attachmentLabel}>Photo selected</Text>
        <HapticPressable haptic={null} scaleDown={1} accessibilityLabel="Remove attachment" disabled={sending} onPress={() => setAttachment(null)} style={styles.attachmentRemove}>
          <Ionicons name="close" size={20} color={COLORS.primary} illustrated={false} />
        </HapticPressable>
      </View>}
      <MessageComposer ref={input} value={text} onChangeText={setText} onSend={send} softSend
        maxLength={attachment ? PHOTO_CAPTION_LIMIT : 2000}
        leadingAction={<HapticPressable haptic={null} scaleDown={1} onPress={() => setMenu('attachments')} disabled={sending || loading || photoPreparing}
          style={styles.attachmentRemove} accessibilityLabel="Add attachment"><Ionicons name="add" size={24} color={COLORS.primary} illustrated={false} /></HapticPressable>}
        placeholder={attachment ? 'Add a caption…' : thread ? 'Write a reply…' : 'Message your neighbors…'} disabled={(!text.trim() && !attachment) || loading || photoPreparing} editable={!sending} loading={sending} />
    </View>
    {!!safetyTarget && <ContentSafetyActions key={safetyTarget} type="community_message" id={safetyTarget} open
      onClose={() => setSafetyTarget(null)} onBlocked={() => { setMessages([]); changeThread(null); refresh(); }} />}
    <MessageReactionMenu visible={!!reactionTarget} position={reactionTarget?.position} onClose={() => setReactionTarget(null)}
      onSelect={emoji => react(reactionTarget.message,emoji)} onMore={() => {setMenu(reactionTarget.message);setReactionTarget(null);}} />
    <ActionSheet variant="item" title={menu === 'channel' ? 'Chat options' : menu === 'attachments' ? 'Add to chat' : 'Message'} isVisible={!!menu} onClose={() => setMenu(null)} actions={options} />
    <Modal visible={!!fullscreenPhoto} animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setFullscreenPhoto(null)}>
      <View style={[styles.photoViewer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <HapticPressable haptic={null} scaleDown={1} accessibilityLabel="Close photo" onPress={() => setFullscreenPhoto(null)} style={styles.photoClose}><Ionicons name="close" size={22} color={COLORS.primary} illustrated={false} /></HapticPressable>
        {fullscreenPhoto && <ShimmerImage source={{ uri: fullscreenPhoto }} contentFit="contain" style={styles.fullscreenPhoto} accessibilityLabel="Chat photo" />}
      </View>
    </Modal>
  </ComposerKeyboardView>;
}
const styles = StyleSheet.create({
  emptyMessages: { justifyContent: 'center' }, quietFooter: { flexGrow: 1, justifyContent: 'center' },
  messagePhoto: { width: 220, maxWidth: '100%', aspectRatio: 1, borderRadius: RADIUS.md }, photoCaption: { marginTop: SPACING.sm },
  attachment: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.sm, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  attachmentPhoto: { width: 48, height: 48, borderRadius: RADIUS.sm }, attachmentLabel: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, flex: 1 },
  attachmentRemove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.full, marginBottom: 2 },
  photoViewer: { flex: 1, backgroundColor: COLORS.background }, photoClose: { minHeight: 44, width: 44, alignSelf: 'flex-end', justifyContent: 'center', alignItems: 'center', marginRight: SPACING.lg }, fullscreenPhoto: { flex: 1, width: '100%' },
  threadParent: { marginBottom: SPACING.sm },
  replyDivider: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm },
  replyDividerText: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  replyDividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: COLORS.separator },
  container: { flex: 1, backgroundColor: COLORS.background },
  more: { padding: 12, alignItems: 'center' }, messages: { flexGrow: 1, justifyContent: 'flex-start', paddingVertical: SPACING.sm },
  conversation: { flex: 1 },
  body: { ...TYPOGRAPHY.chatBody, color: COLORS.text }, deleted: { color: COLORS.textSecondary, fontStyle: 'italic' },
  link: { ...TYPOGRAPHY.buttonCaption, color: COLORS.primary },
  dock: { paddingTop: SPACING.sm, backgroundColor: COLORS.background, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.separator }, empty: { ...TYPOGRAPHY.body, textAlign: 'center', color: COLORS.text },
  error: { padding: 12 }, errorText: { ...TYPOGRAPHY.footnote, color: COLORS.danger },
});
