import * as Clipboard from 'expo-clipboard';
import MessageReactionMenu from './MessageReactionMenu';
import MessageBubble, { ChatDateDivider } from './MessageBubble';
import { chatMessageMeta } from '../utils/chatPresentation';
import ContentSafetyActions from './ContentSafetyActions';
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, AppState, Keyboard } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, CARD_SURFACE } from '../utils/config';
import HapticPressable from './HapticPressable';
import MessageComposer from './MessageComposer';
import ComposerKeyboardView from './ComposerKeyboardView';
import ActionSheet from './ActionSheet';
import { ThemedAlert as Alert } from './ThemedAlert';
import { Ionicons } from './Icon';
import useReduceMotion from '../hooks/useReduceMotion';

// The neighborhood page and Inbox both mount this same channel by community ID.
export default function CommunityChat({ community, navigation, header }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [messages, setMessages] = useState([]);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible?.() ?? false);
  const [text, setText] = useState('');
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
    draft.current.set(thread?.id || 'main', text);
    setText(draft.current.get(next?.id || 'main') || '');
    setThread(next); retry.current = null;
  };
  const send = async () => {
    if (!text.trim() || sendLock.current) return;
    sendLock.current = true; setSending(true);
    const content = text.trim();
    const key = `${id}:${thread?.id || ''}:${content}`;
    const token = generation.current;
    if (retry.current?.key !== key) retry.current = { key, clientRequestId: Crypto.randomUUID() };
    try {
      await api.sendCommunityMessage(id, { content, parentId: thread?.id || null, clientRequestId: retry.current.clientRequestId });
      if (!alive.current || token !== generation.current) return;
      setText(''); retry.current = null; nearBottom.current = true;
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
  const options = menu === 'channel' ? [
    { label: muted ? 'Unmute chat' : 'Mute chat', onPress: toggleMute, haptic: 'selection' },
    { label: 'Neighborhood settings', onPress: () => navigation.navigate('CommunitySettings', { id }) },
  ] : menu ? [
    ...(!menu.deleted && menu.sender.id !== user?.id ? [{ label: 'Report or block', onPress: () => setSafetyTarget(menu.id) }] : []),
    ...(!menu.deleted ? [{ label: 'Add reaction', onPress: () => openReactions(menu) }, { label: 'Copy Text', onPress: () => Clipboard.setStringAsync(menu.content) }, { label: 'Reply in thread', onPress: () => changeThread(menu.parentId ? thread : menu) }] : []),
    ...(role === 'organizer' || menu.sender.id === user?.id ? [{ label: 'Remove message', destructive: true, onPress: () => remove(menu) }] : []),
  ] : [];

  const renderMessage = ({ item, index, isRoot = false }) => {
    const previous = isRoot ? null : chronologicalMessages[index - 1] || thread;
    const meta = chatMessageMeta(item, previous);
    const own = item.sender.id === user?.id;
    return <View>
      {!isRoot && meta.showDate && <ChatDateDivider label={meta.day} />}
      <MessageBubble testID={`CommunityChat.message.${item.id}`} own={own} startsGroup={meta.startsGroup}
        senderName={item.sender.name} showSender avatarUrl={item.sender.photoUrl}
        onProfile={() => navigation.navigate('UserProfile', { id: item.sender.id })}
        profileAccessibilityLabel={`View ${item.sender.name}'s profile`}
        time={isRoot ? `${meta.day} · ${meta.time}` : meta.time} deleted={item.deleted}
        onLongPress={event => openReactions(item, event)}
        reactions={item.reactions} userId={user.id} onToggleReaction={emoji => react(item, emoji)}
        onAddReaction={event => openReactions(item, event)} onOptions={() => setMenu(item)}
        onReply={!thread && (!item.deleted || item.replyCount > 0) ? () => changeThread(item) : undefined}
        replyLabel={item.replyCount ? `${item.replyCount} ${item.replyCount === 1 ? 'reply' : 'replies'}` : 'Reply'}
        replyAccessibilityLabel={`Reply to ${item.sender.name}`}>
        <Text style={[styles.body, item.deleted && styles.deleted]}>{item.deleted ? 'Message removed' : item.content}</Text>
      </MessageBubble>
    </View>;
  };

  return <ComposerKeyboardView style={styles.container} testID="CommunityChat.keyboardLayout" onKeyboardVisibilityChange={setKeyboardVisible}>
    {header}
    <View style={styles.chatHeading}>
      {thread ? <HapticPressable haptic={null} scaleDown={1} onPress={() => changeThread(null)} accessibilityLabel="Back to neighborhood chat" style={styles.back}>
        <Ionicons name="chevron-back" size={22} color={COLORS.primary} illustrated={false} selected={false} /><Text maxFontSizeMultiplier={1.4} style={styles.heading}>Replies</Text>
      </HapticPressable> : <Text maxFontSizeMultiplier={1.4} style={styles.heading}>Chat{muted ? ' · Muted' : ''}</Text>}
      <HapticPressable haptic={null} scaleDown={1} onPress={() => setMenu('channel')} accessibilityLabel="Chat options" style={styles.more}>
        <Ionicons name="ellipsis-horizontal" size={22} color={COLORS.primary} illustrated={false} selected={false} />
      </HapticPressable>
    </View>
    {!!error && <HapticPressable haptic={null} scaleDown={1} onPress={() => refresh()} style={styles.error}><Text style={styles.errorText}>{error}</Text></HapticPressable>}
    {loading ? <ActivityIndicator style={styles.conversation} color={COLORS.spinner} /> : <FlatList
      ref={list} style={styles.conversation} data={chronologicalMessages} keyExtractor={item => item.id}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
      contentContainerStyle={[styles.messages, { paddingLeft: Math.max(insets.left, SPACING.md), paddingRight: Math.max(insets.right, SPACING.md) }]}
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
      ListEmptyComponent={!error && <View style={styles.welcome}>
        <View style={styles.welcomeIcon}><Ionicons name="chatbubble-ellipses" size={32} illustrated color={COLORS.primary} /></View>
        <Text style={styles.empty}>{thread ? 'No replies yet.' : 'Say hello to your neighbors.'}</Text>
      </View>}
      renderItem={renderMessage}
    />}
    <View testID="CommunityChat.composerDock" style={[styles.dock, { paddingBottom: keyboardVisible ? SPACING.sm : Math.max(insets.bottom, SPACING.md), paddingLeft: Math.max(insets.left, SPACING.md), paddingRight: Math.max(insets.right, SPACING.md) }]}><MessageComposer value={text} onChangeText={setText} onSend={send}
      placeholder={thread ? 'Write a reply…' : 'Message your neighbors…'} disabled={!text.trim() || loading} editable={!sending} loading={sending} /></View>
    {!!safetyTarget && <ContentSafetyActions key={safetyTarget} type="community_message" id={safetyTarget} open
      onClose={() => setSafetyTarget(null)} onBlocked={() => { setMessages([]); changeThread(null); refresh(); }} />}
    <MessageReactionMenu visible={!!reactionTarget} position={reactionTarget?.position} onClose={() => setReactionTarget(null)}
      onSelect={emoji => react(reactionTarget.message,emoji)} onMore={() => {setMenu(reactionTarget.message);setReactionTarget(null);}} />
    <ActionSheet variant="item" title={menu === 'channel' ? 'Chat options' : 'Message'} isVisible={!!menu} onClose={() => setMenu(null)} actions={options} />
  </ComposerKeyboardView>;
}
const styles = StyleSheet.create({
  threadParent: { marginBottom: SPACING.sm },
  replyDivider: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm },
  replyDividerText: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  replyDividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: COLORS.separator },
  container: { flex: 1, backgroundColor: COLORS.background },
  chatHeading: { paddingHorizontal: SPACING.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { ...TYPOGRAPHY.headline, color: COLORS.primary }, back: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  more: { padding: 12, alignItems: 'center' }, messages: { flexGrow: 1, justifyContent: 'flex-start', paddingVertical: SPACING.sm },
  conversation: { flex: 1 },
  welcome: { ...CARD_SURFACE, alignItems: 'center', padding: SPACING.xl, gap: SPACING.md, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface },
  welcomeIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  body: { ...TYPOGRAPHY.body, color: COLORS.text }, deleted: { color: COLORS.textSecondary, fontStyle: 'italic' },
  link: { ...TYPOGRAPHY.buttonCaption, color: COLORS.primary },
  dock: { paddingTop: SPACING.sm, backgroundColor: COLORS.background, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.separator }, empty: { ...TYPOGRAPHY.body, textAlign: 'center', color: COLORS.text },
  error: { padding: 12 }, errorText: { ...TYPOGRAPHY.footnote, color: COLORS.danger },
});
