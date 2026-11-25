import * as Clipboard from 'expo-clipboard';
import MessageReactionMenu from '../components/MessageReactionMenu';
import MessageReactions from '../components/MessageReactions';
import ContentSafetyActions from '../components/ContentSafetyActions';
import { randomUUID } from 'expo-crypto';
import DiscussionComposer from '../components/DiscussionComposer';
import { DISCUSSION_EMOJIS, DISCUSSION_LIGHT_COLORS, sortDiscussion, removeDiscussionBranch, formatDiscussionTime, discussionInitials } from '../utils/discussionThread';
import ComposerKeyboardView from '../components/ComposerKeyboardView';
import ShimmerImage from '../components/ShimmerImage';
import ConversationContextCard from '../components/ConversationContextCard';
import { useState, useEffect, useRef, useMemo } from 'react';
import { UNSTABLE_usePreventRemove as usePreventRemove, useIsFocused } from '@react-navigation/native';
import useNavigationTask from '../hooks/useNavigationTask';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Keyboard, } from 'react-native';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';

import ActionSheet from '../components/ActionSheet';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { COLORS, SPACING, TYPOGRAPHY } from '../utils/config';

const authorName = author => author?.displayName || [author?.firstName, author?.lastName].filter(Boolean).join(' ') || 'Neighbor';

export default function ListingDiscussionScreen({ route, navigation }) {
  const colors = DISCUSSION_LIGHT_COLORS;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isFocused = useIsFocused();
  const startNavigationTask = useNavigationTask(navigation, route.params.requestId || route.params.listingId);
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const { listingId, listing, requestId, request, autoFocus, threadId, discussionId } = route.params;
  const isRequest = !!requestId;
  const targetId = requestId || listingId;
  const [target, setTarget] = useState(request || listing || null);
  const targetTitle = target?.title;
  const [threadError, setThreadError] = useState('');
  const threadContext = { id: targetId, title: targetTitle, type: isRequest ? 'request' : 'listing',
    ...(isRequest ? { requestType: target?.type } : {}) };
  const isOwner = target?.isOwner;
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [failedAvatars, setFailedAvatars] = useState(new Set());
  const [reactionTarget, setReactionTarget] = useState(null);
  const reacting = useRef(false);
  const [actionTarget, setActionTarget] = useState(null);
  const [safetyTarget, setSafetyTarget] = useState(null);
  const openingChat = useRef(false);
  const [activeThreadId, setActiveThreadId] = useState(null);
  // Keep the addressee with its draft when a reader leaves and reopens a thread.
  const [replyTargets, setReplyTargets] = useState({});
  const replyToPostId = replyTargets[activeThreadId] || activeThreadId;
  const postsRequest = useRef(0);
  const [pendingDestination, setPendingDestination] = useState(null);
  const activeThread = posts.find(post => post.id === activeThreadId);
  const [replies, setReplies] = useState({});
  const [replyErrors, setReplyErrors] = useState({});
  const [loadingReplies, setLoadingReplies] = useState({});
  const [hasMoreReplies, setHasMoreReplies] = useState({});
  const [earliestReplyPage, setEarliestReplyPage] = useState({});
  const failedReplyPages = useRef({});
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const postsPage = useRef(1);
  const loadingPosts = useRef(false);
  const loadedReplies = useRef(new Set());
  const replyPages = useRef({});
  const replyRequests = useRef(new Map());
  const threadGeneration = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const pendingSubmissions = useRef({});
  const [sendErrors, setSendErrors] = useState({});
  const [drafts, setDrafts] = useState({});
  const draftKey = activeThreadId || 'comments';
  const newComment = drafts[draftKey] || '';
  const setNewComment = text => setDrafts(prev => ({ ...prev, [draftKey]: text }));
  const sendError = sendErrors[draftKey] || '';
  const setSendError = message => setSendErrors(prev => ({ ...prev, [draftKey]: message }));
  const [deleteSheetVisible, setDeleteSheetVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const overviewOffset = useRef(0);
  const restoreOffset = useRef(null);
  const pendingFocus = useRef(null);
  const currentView = useRef(draftKey);
  currentView.current = draftKey;
  const scrollTarget = useRef(null);
  const scrollRetry = useRef(null);
  const scrollAttempts = useRef(0);

  useEffect(() => {
    if (activeThreadId && pendingFocus.current === activeThreadId) {
      pendingFocus.current = null;
      inputRef.current?.focus();
    }
  }, [activeThreadId]);

  useEffect(() => () => clearTimeout(scrollRetry.current), [activeThreadId]);

  useEffect(() => {
    let active = true;
    setTarget(request || listing || null);
    if (!request?.title && !listing?.title) {
      (isRequest ? api.getRequest(targetId) : api.getListing(targetId)).then(data => {
        if (active) setTarget(data);
      }).catch(() => { if (active) setThreadError('Couldn’t load the original post. Go back and reopen it.'); });
    }
    return () => { active = false; };
  }, [targetId]);

  useEffect(() => {
    threadGeneration.current += 1;
    loadedReplies.current = new Set();
    replyPages.current = {};
    failedReplyPages.current = {};
    postsPage.current = 1;
    loadingPosts.current = false;
    setEarliestReplyPage({}); setHasMorePosts(false);
    replyRequests.current = new Map();
    submitting.current = false;
    pendingSubmissions.current = {};
    clearTimeout(scrollRetry.current);
    scrollTarget.current = null;
    pendingFocus.current = null; overviewOffset.current = 0; restoreOffset.current = null;
    scrollAttempts.current = 0;
    setReactionTarget(null); setActionTarget(null);
    setReplyTargets({});
    setPosts([]); setReplies({}); setReplyErrors({}); setLoadingReplies({}); setHasMoreReplies({}); setActiveThreadId(null);
    setDrafts({}); setIsLoading(true); setThreadError(''); setSendErrors({}); setIsSubmitting(false);
    fetchPosts();
    return () => { threadGeneration.current += 1; clearTimeout(scrollRetry.current); };
  }, [targetId, threadId, discussionId, user.id]);

  const focusedOnEntry = useRef(false);
  useEffect(() => {
    if (!focusedOnEntry.current && autoFocus && !threadId && !discussionId && !activeThreadId && inputRef.current) {
      const timer = setTimeout(() => { focusedOnEntry.current = true; inputRef.current?.focus(); }, 250);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, isLoading, threadId, discussionId, activeThreadId]);


  useEffect(() => {
    navigation.setOptions({ title: activeThreadId ? 'Replies' : 'Comments', headerBackButtonMenuEnabled: false, headerStyle: {backgroundColor:colors.surface}, headerTintColor:colors.text, statusBarStyle:'dark', contentStyle:{backgroundColor:colors.surface} });
  }, [activeThreadId, navigation, colors]);

  usePreventRemove(isFocused && !!activeThreadId, () => closeThread());

  useEffect(() => {
    if (activeThreadId || !pendingDestination) return;
    // The native back guard must be released before navigating to an existing screen.
    navigation.navigate(pendingDestination.screen, pendingDestination.params);
    setPendingDestination(null);
  }, [activeThreadId, pendingDestination, navigation]);

  const navigateFromComments = (screen, params) => {
    Keyboard.dismiss();
    if (activeThreadId) {
      restoreOffset.current = overviewOffset.current;
      setPendingDestination({ screen, params });
      setActiveThreadId(null);
    } else {
      navigation.navigate(screen, params);
    }
  };

  const fetchPosts = async (page = 1) => {
    if (loadingPosts.current && page !== 1) return;
    const requestNumber = ++postsRequest.current;
    loadingPosts.current = true;
    const generation = threadGeneration.current;
    try {
      const data = isRequest
        ? await api.getRequestDiscussions(requestId, { limit: 50, page, sort: 'oldest' })
        : await api.getDiscussions(listingId, { limit: 50, page, sort: 'oldest' });
      if (generation !== threadGeneration.current || requestNumber !== postsRequest.current) return;
      setPosts(prev => page === 1 ? data.posts || [] : [...prev, ...(data.posts || []).filter(post => !prev.some(old => old.id === post.id))]);
      postsPage.current = page;
      setHasMorePosts(page * 50 < (data.total || 0));
      if (page === 1 && (discussionId || threadId)) {
        try {
          const thread = isRequest
            ? await api.getRequestDiscussionThread(targetId, discussionId || threadId)
            : await api.getDiscussionThread(targetId, discussionId || threadId);
          if (generation !== threadGeneration.current) return;
          setPosts(prev => [thread.post, ...prev.filter(post => post.id !== thread.post.id)]);
          setActiveThreadId(thread.post.id);
          if (discussionId) scrollTarget.current = { draftKey: thread.post.id, messageId: discussionId };
          await fetchReplies(thread.post.id, thread.replyPage || 1);
        } catch {
          if (generation === threadGeneration.current) setThreadError('This thread is unavailable. You can still browse the comments.');
        }
      }
    } catch (error) {
      if (generation === threadGeneration.current) setThreadError('Couldn’t load comments. Go back and try again.');
    } finally {
      if (generation === threadGeneration.current && requestNumber === postsRequest.current) { setIsLoading(false); loadingPosts.current = false; }
    }
  };

  const fetchReplies = (postId, page = 1) => {
    if (replyRequests.current.has(postId)) return replyRequests.current.get(postId);
    const generation = threadGeneration.current;
    setLoadingReplies(prev => ({ ...prev, [postId]: true }));
    setReplyErrors(prev => ({ ...prev, [postId]: '' }));
    const pending = (async () => {
      try {
        const data = isRequest
          ? await api.getRequestDiscussionReplies(requestId, postId, { page, limit: 50 })
          : await api.getDiscussionReplies(listingId, postId, { page, limit: 50 });
        if (generation !== threadGeneration.current) return;
        const fetched = data.replies || [];
        const fetchedIds = new Set(fetched.map(reply => reply.id));
        // A new reply may have been sent while this thread was loading.
        setReplies(prev => ({ ...prev, [postId]: [
          ...fetched, ...(prev[postId] || []).filter(reply => !fetchedIds.has(reply.id)),
        ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) }));
        loadedReplies.current.add(postId);
        setEarliestReplyPage(prev => ({ ...prev, [postId]: Math.min(prev[postId] || page, page) }));
        if (page >= (replyPages.current[postId] || 0)) {
          replyPages.current[postId] = page;
          setHasMoreReplies(prev => ({ ...prev, [postId]: fetched.length === 50 }));
        }
        return fetched;
      } catch (error) {
        if (generation === threadGeneration.current) {
          failedReplyPages.current[postId] = page;
          setReplyErrors(prev => ({ ...prev, [postId]: 'Couldn’t load earlier replies.' }));
        }
      } finally {
        if (generation === threadGeneration.current) {
          setLoadingReplies(prev => ({ ...prev, [postId]: false }));
          replyRequests.current.delete(postId);
        }
      }
    })();
    replyRequests.current.set(postId, pending);
    return pending;
  };

  const openThread = (postId, focus = false, replyToId = postId) => {
    if (focus) {
      setReplyTargets(previous => ({ ...previous, [postId]: replyToId }));
      if (activeThreadId === postId) inputRef.current?.focus();
      else pendingFocus.current = postId;
    } else {
      Keyboard.dismiss();
    }
    restoreOffset.current = null;
    scrollTarget.current = null;
    scrollAttempts.current = 0;
    setActiveThreadId(postId);
    if (!loadedReplies.current.has(postId)) fetchReplies(postId);
  };

  const closeThread = () => {
    pendingFocus.current = null;
    scrollTarget.current = null;
    restoreOffset.current = overviewOffset.current;
    Keyboard.dismiss();
    setActiveThreadId(null);
  };

  const handleSubmit = async (selectedParent = activeThreadId) => {
    const selectedKey = selectedParent || 'comments';
    const selectedText = drafts[selectedKey] || '';
    if (submitting.current || !selectedText.trim()) return;
    submitting.current = true;
    const generation = threadGeneration.current;
    const parentId = selectedParent || undefined;
    const submittedDraftKey = selectedKey;
    const submittedText = selectedText;
    const pending = pendingSubmissions.current[submittedDraftKey];
    const nestedTarget = parentId && replyToPostId !== parentId ? replyToPostId : undefined;
    const data = pending?.content === selectedText.trim() && pending.replyToId === nestedTarget ? pending : {
      content: selectedText.trim(), parentId, clientRequestId: randomUUID(),
      ...(nestedTarget ? { replyToId: nestedTarget } : {}),
    };
    pendingSubmissions.current[submittedDraftKey] = data;
    setIsSubmitting(true);
    setSendError('');
    try {
      const result = isRequest
        ? await api.createRequestDiscussionPost(requestId, data)
        : await api.createDiscussionPost(listingId, data);
      if (generation !== threadGeneration.current) return;
      if (currentView.current === submittedDraftKey) {
        scrollAttempts.current = 0;
        scrollTarget.current = { draftKey: submittedDraftKey, messageId: result.id };
      }

      if (parentId) {
        // Add reply to the replies list
        setReplies(prev => ({
          ...prev,
          [parentId]: [...(prev[parentId] || []).filter(reply => reply.id !== result.id), {
            id: result.id,
            content: result.content,
            createdAt: result.createdAt,
            score: result.score ?? 1, viewerVote: result.viewerVote ?? 1, replyToId: result.replyToId || data.replyToId || parentId,
            user: {
            id: user.id,
            firstName: result.user?.firstName ?? (user.displayName || user.firstName),
            lastName: result.user?.lastName ?? (user.displayName ? '' : (user.lastName ? `${user.lastName.charAt(0)}.` : '')),
            profilePhotoUrl: user.profilePhotoUrl,
          },
            isOwn: true,
          }],
        }));

        // Update reply count on parent
        if (!result.replayed) setPosts(prev => prev.map(p =>
          p.id === parentId
            ? { ...p, replyCount: (p.replyCount || 0) + 1 }
            : p
        ));

        if (result.replayed) {
          const getThread = isRequest ? api.getRequestDiscussionThread : api.getDiscussionThread;
          getThread(targetId, parentId).then(thread => {
            if (generation === threadGeneration.current) setPosts(previous => previous.map(post => post.id === parentId ? thread.post : post));
          }).catch(() => {});
        }
        if (!loadedReplies.current.has(parentId)) fetchReplies(parentId);
      } else {
        // Append a new top-level post; the conversation stays chronological.
        setPosts(prev => [...prev.filter(post => post.id !== result.id), {
          id: result.id,
          content: result.content,
          replyCount: 0,
          createdAt: result.createdAt,
            score: result.score ?? 1, viewerVote: result.viewerVote ?? 1, replyToId: result.replyToId || data.replyToId || parentId,
          user: {
            id: user.id,
            firstName: result.user?.firstName ?? (user.displayName || user.firstName),
            lastName: result.user?.lastName ?? (user.displayName ? '' : (user.lastName ? `${user.lastName.charAt(0)}.` : '')),
            profilePhotoUrl: user.profilePhotoUrl,
          },
          isOwn: true,
        }]);
      }

      if (nestedTarget) setReplyTargets(prev => prev[parentId] === nestedTarget ? { ...prev, [parentId]: parentId } : prev);
      delete pendingSubmissions.current[submittedDraftKey];
      setDrafts(prev => ({ ...prev, [submittedDraftKey]: prev[submittedDraftKey] === submittedText ? '' : prev[submittedDraftKey] }));
    } catch (error) {
      if (generation !== threadGeneration.current) return;
      setSendErrors(previous => ({...previous,[submittedDraftKey]:'Couldn’t send. Please try again.'}));
    } finally {
      if (generation === threadGeneration.current) {
        submitting.current = false;
        setIsSubmitting(false);
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { postId, isReply, parentId } = deleteTarget;
    try {
      await (isRequest
        ? api.deleteRequestDiscussionPost(requestId, postId)
        : api.deleteDiscussionPost(listingId, postId));

      if (isReply && parentId) {
        const branch = removeDiscussionBranch(replies[parentId] || [], postId);
        setReplies(prev => ({ ...prev, [parentId]: removeDiscussionBranch(prev[parentId] || [], postId).items }));
        setPosts(prev => prev.map(p => p.id === parentId
          ? { ...p, replyCount: Math.max(0, (p.replyCount || 0) - branch.removed.size) } : p));
        setReplyTargets(prev => branch.removed.has(prev[parentId]) ? { ...prev, [parentId]: parentId } : prev);
      } else {
        setPosts(prev => prev.filter(p => p.id !== postId));
        if (activeThreadId === postId) closeThread();
      }
    } catch (error) {
      setThreadError('Couldn’t delete this comment. Please try again.');
    }
  };

  const confirmDelete = (postId, isReply = false, parentId = null) => {
    setDeleteTarget({ postId, isReply, parentId });
    setDeleteSheetVisible(true);
  };

  const openPrivateChat = async (post) => {
    if (openingChat.current) return;
    const isCurrent = startNavigationTask();
    openingChat.current = true;
    try {
      const conversations = await api.getConversations();
      if (!isCurrent()) return;
      const existing = conversations.find(chat => chat.otherUser?.id === post.user.id);
      navigateFromComments('Chat', {
        conversationId: existing?.id, recipientId: post.user.id, recipient: post.user,
        threadContext: { ...threadContext, replyText: post.content },
        ...(isRequest ? {} : { listingId: targetId }),
      });
    } catch {
      setThreadError('Couldn’t open private chat. Please try again from the comment menu.');
    } finally { openingChat.current = false; }
  };

  const openReactions = (post, parentId, event) => {
    setReactionTarget({ post, parentId, position: event?.nativeEvent?.pageY ? { y: event.nativeEvent.pageY } : undefined });
  };
  const react = async (post, emoji) => {
    if (reacting.current) return;
    reacting.current = true;
    setReactionTarget(null);
    const generation = threadGeneration.current;
    const removing = (post.reactions || []).some(r => r.userId === user.id && r.emoji === emoji);
    try {
      if (isRequest) await (removing ? api.removeRequestDiscussionReaction(requestId,post.id,emoji) : api.reactToRequestDiscussion(requestId,post.id,emoji));
      else await (removing ? api.removeDiscussionReaction(listingId,post.id,emoji) : api.reactToDiscussion(listingId,post.id,emoji));
      if (generation !== threadGeneration.current) return;
      const update = p => p.id !== post.id ? p : { ...p, reactions: [...(p.reactions || []).filter(r => !(r.userId === user.id && r.emoji === emoji)), ...(removing ? [] : [{ userId: user.id, emoji }])] };
      setPosts(prev => prev.map(update));
      setReplies(prev => Object.fromEntries(Object.entries(prev).map(([id,items]) => [id,items.map(update)])));
    } catch { if (generation === threadGeneration.current) setThreadError('Couldn’t update reaction. Try again.'); }
    finally { reacting.current = false; }
  };

  const listRows = useMemo(() => activeThread
    ? [activeThread, ...sortDiscussion(replies[activeThread.id] || [])]
    : sortDiscussion(posts), [activeThread, replies, posts]);
  const postsById = useMemo(() => new Map(listRows.map(post => [post.id, post])), [listRows]);
  const replyTarget = postsById.get(replyToPostId) || activeThread;

  const scrollToMessage = (id, rows = listRows) => {
    const index = rows.findIndex(post => post.id === id);
    if (index < 0) return false;
    listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.3 });
    return true;
  };

  const showReplySource = async id => {
    scrollAttempts.current = 0;
    if (scrollToMessage(id) || !activeThreadId || loadingReplies[activeThreadId]) return;
    const generation = threadGeneration.current;
    // Notification links can open in the middle of a long thread. Fill earlier
    // pages consecutively to keep pagination intact and use only visible data.
    for (let page = (earliestReplyPage[activeThreadId] || 1) - 1; page > 0; page--) {
      if (currentView.current !== activeThreadId || generation !== threadGeneration.current) return;
      scrollTarget.current = { draftKey: activeThreadId, messageId: id };
      const items = await fetchReplies(activeThreadId, page);
      if (!items || items.some(item => item.id === id)) return;
    }
    if (currentView.current === activeThreadId && generation === threadGeneration.current) {
      scrollTarget.current = null;
      setThreadError('That earlier reply is unavailable.');
    }
  };

  const renderPost = ({ item: post }) => {
    const parentId = activeThreadId && post.id !== activeThreadId ? activeThreadId : null;
    const name = authorName(post.user);
    const date = formatDiscussionTime(post.createdAt);
    const nestedId = parentId && post.replyToId !== parentId && post.replyToId;
    const source = postsById.get(nestedId);
    const profile = () => navigateFromComments('UserProfile', { id: post.user.id });
    const avatar = post.user.profilePhotoUrl && !failedAvatars.has(post.user.profilePhotoUrl)
      ? <ShimmerImage placeholderIcon="person" source={{ uri: post.user.profilePhotoUrl }} style={styles.avatar}
          onError={() => setFailedAvatars(previous => new Set([...previous, post.user.profilePhotoUrl]))} />
      : <View style={[styles.avatar, styles.fallback]} accessibilityLabel={`${name} avatar`}>
          <Text maxFontSizeMultiplier={1.4} style={styles.initials}>{discussionInitials(post.user)}</Text>
        </View>;
    return <View testID={`Comments.row.${post.id}`} style={[styles.row, post.id === discussionId && styles.highlight]}>
      <HapticPressable onLongPress={event => openReactions(post, parentId, event)} accessible={false}
        accessibilityRole={undefined} testID={`Comments.message.${post.id}`} style={styles.message}>
        {post.user.id ? <HapticPressable accessible={false} onPress={profile} hitSlop={4}>{avatar}</HapticPressable> : avatar}
        <View style={styles.column} testID={`Comments.column.${post.id}`}>
          <View style={styles.identity}>
            <View style={styles.byline}>
              {post.user.id
                ? <Text accessibilityRole="link" accessibilityLabel={`View ${name}’s profile`}
                    onPress={profile} style={styles.author}>{name}</Text>
                : <Text style={styles.author}>{name}</Text>}
              {!!date && <Text style={styles.date}>· {date}</Text>}
            </View>
            <HapticPressable accessibilityLabel={`Comment options for ${post.user.firstName}`} style={styles.more}
              hitSlop={{ top: 10, bottom: 10, left: 4, right: 6 }} onPress={() => setActionTarget({ post, parentId })}>
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary}/>
            </HapticPressable>
          </View>
          {!!nestedId && <HapticPressable onPress={() => showReplySource(nestedId)}
            accessibilityLabel={source ? `View reply from ${authorName(source.user)}` : 'View earlier reply'} style={styles.source}>
            <Text style={styles.date}>{source ? `To ${authorName(source.user)}` : 'View earlier reply'}</Text>
          </HapticPressable>}
          <Text style={styles.body}>{post.content}</Text>
          <View style={styles.actions}>
            {!!post.reactions?.length && <MessageReactions inline touchTarget colors={colors} reactions={post.reactions}
              userId={user.id} onToggle={emoji => react(post, emoji)} />}
            <HapticPressable style={styles.link} accessibilityLabel={`Reply to ${post.user.firstName}`}
              onPress={() => openThread(parentId || post.id, true, post.id)}><Text style={styles.replyText}>Reply</Text></HapticPressable>
            {!activeThreadId && post.replyCount > 0 && <HapticPressable style={styles.link}
              accessibilityLabel={`View ${post.replyCount} ${post.replyCount === 1 ? 'reply' : 'replies'} to ${post.user.firstName}`}
              onPress={() => openThread(post.id)}>
              <Text style={styles.actionText}>View {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}</Text>
              <Ionicons name="chevron-forward" size={13} color={colors.primary}/>
            </HapticPressable>}
          </View>
        </View>
      </HapticPressable>
      {activeThreadId === post.id && earliestReplyPage[post.id] > 1 &&
        <HapticPressable style={styles.actionButton} disabled={!!loadingReplies[post.id]} onPress={() => fetchReplies(post.id, earliestReplyPage[post.id] - 1)}>
          <Text style={styles.actionText}>Earlier replies</Text>
        </HapticPressable>}
    </View>;
  };

  const renderThreadStatus = (postId = activeThreadId) => {
    if (!loadingReplies[postId] && !replyErrors[postId] && !hasMoreReplies[postId]) return null;
    return <View style={styles.threadStatus}>
      {loadingReplies[postId] ? <View style={styles.replyStatus}>
        <ActivityIndicator size="small" color={colors.spinner} />
        <Text maxFontSizeMultiplier={1.4} style={styles.statusText}>Loading replies…</Text>
      </View> : replyErrors[postId] ? <View style={styles.replyStatus}>
        <Text accessibilityRole="alert" style={styles.replyError}>{replyErrors[postId]}</Text>
        <HapticPressable pressedBackgroundColor={COLORS.cardHover} style={styles.actionButton} accessibilityLabel="Retry loading replies"
          onPress={() => fetchReplies(postId, failedReplyPages.current[postId] || 1)}>
          <Text maxFontSizeMultiplier={1.4} style={styles.actionText}>Try again</Text>
        </HapticPressable>
      </View> : hasMoreReplies[postId] ? (
        <HapticPressable pressedBackgroundColor={COLORS.cardHover} style={styles.actionButton} onPress={() => fetchReplies(postId, replyPages.current[postId] + 1)}>
          <Text maxFontSizeMultiplier={1.4} style={styles.actionText}>Show more replies</Text>
        </HapticPressable>
      ) : null}
    </View>;
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.spinner} />
      </View>
    );
  }

  return (
    <ComposerKeyboardView testID="Comments.keyboardLayout" style={styles.container} onKeyboardVisibilityChange={setKeyboardVisible}>
      <FlatList
        key={draftKey}
        ref={listRef}
        style={styles.list}
        data={listRows}
        renderItem={renderPost}
        keyExtractor={item => item.id}
        onScroll={event => {
          if (!activeThreadId && restoreOffset.current == null) overviewOffset.current = Math.max(0, event.nativeEvent.contentOffset.y);
        }}
        scrollEventThrottle={16}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (!activeThreadId && restoreOffset.current != null) {
            const offset = restoreOffset.current;
            restoreOffset.current = null;
            if (offset) listRef.current?.scrollToOffset({ offset, animated: false });
          }
          const destination = scrollTarget.current;
          if (destination?.draftKey === draftKey && scrollToMessage(destination.messageId)) scrollTarget.current = null;
        }}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          if (scrollAttempts.current++ >= 3) return;
          listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
          clearTimeout(scrollRetry.current);
          scrollRetry.current = setTimeout(() => {
            if (currentView.current === draftKey) listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.3 });
          }, 100);
        }}
        ListHeaderComponent={<View testID="Comments.header">
          <ConversationContextCard compact colors={colors} title={targetTitle || (isRequest ? 'Wanted post' : 'Shared item')}
            label="Public comments" photoUrl={target?.photoUrl || target?.photos?.[0]} category={target?.category}
            icon={isRequest ? 'chatbubble' : 'basket'} accessibilityLabel="View original post"
            onPress={() => navigateFromComments(isRequest ? 'RequestDetail' : 'ListingDetail', { id: targetId })} />
          {!!threadError && <Text accessibilityRole="alert" style={styles.threadError}>{threadError}</Text>}
        </View>}
        ListFooterComponent={activeThreadId ? renderThreadStatus(activeThreadId) : hasMorePosts ?
          <HapticPressable style={styles.actionButton} onPress={() => fetchPosts(postsPage.current + 1)}>
            <Text style={styles.actionText}>More comments</Text></HapticPressable> : null}
        ListEmptyComponent={<View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={36} color={colors.primaryLight} />
          <Text style={styles.emptyTitle}>{isRequest ? 'No responses yet' : 'No comments yet'}</Text>
          <Text style={styles.emptySubtitle}>{isRequest ? 'Be the first to respond to this wanted post' : 'Be the first to ask a question about this item'}</Text>
        </View>}
      />
      <View testID="Comments.composer" style={[styles.dock, { paddingBottom: keyboardVisible ? 8 : Math.max(8, insets.bottom) }]}>
        {!!sendError && <Text accessibilityRole="alert" style={styles.replyError}>{sendError}</Text>}
        <DiscussionComposer key={draftKey} ref={inputRef} colors={colors} value={newComment} onChangeText={setNewComment}
          replyTo={replyTarget && authorName(replyTarget.user)} quote={replyTarget?.content}
          onCancel={replyToPostId && replyToPostId !== activeThreadId ? () => setReplyTargets(prev => ({ ...prev, [activeThreadId]: activeThreadId })) : undefined}
          onSend={() => handleSubmit()} sendAccessibilityLabel={activeThreadId ? 'Post reply' : 'Post comment'}
          editable={!isSubmitting} disabled={!newComment.trim()} loading={isSubmitting} />
      </View>

      <MessageReactionMenu options={DISCUSSION_EMOJIS} colors={colors} visible={!!reactionTarget} position={reactionTarget?.position} onClose={() => setReactionTarget(null)}
        onSelect={emoji => react(reactionTarget.post,emoji)} onMore={() => { setActionTarget(reactionTarget); setReactionTarget(null); }} />
      <ActionSheet
        isVisible={!!actionTarget}
        onClose={() => setActionTarget(null)}
        title={actionTarget ? `${actionTarget.post.user.firstName}’s comment` : 'Comment'}
        actions={actionTarget ? [
          { label: "Add reaction", onPress: () => openReactions(actionTarget.post,actionTarget.parentId) },
          { label: 'Copy Text', onPress: () => Clipboard.setStringAsync(actionTarget.post.content) },
          {
            label: 'Reply in thread',
            onPress: () => openThread(actionTarget.parentId || actionTarget.post.id, true, actionTarget.post.id),
          },
          ...(actionTarget.post.user.id && !actionTarget.post.isOwn && actionTarget.post.user.id !== user?.id ? [{
            label: 'Report or block',
            onPress: () => setSafetyTarget(actionTarget.post.id),
          }, {
            label: `Message ${actionTarget.post.user.firstName} privately`,
            onPress: () => openPrivateChat(actionTarget.post),
          }] : []),
          ...((actionTarget.post.isOwn || actionTarget.post.user.id === user?.id || isOwner) ? [{
            label: 'Delete comment', destructive: true,
            onPress: () => confirmDelete(actionTarget.post.id, !!actionTarget.parentId, actionTarget.parentId),
          }] : []),
        ] : []}
      />

      {!!safetyTarget && <ContentSafetyActions key={safetyTarget} type="discussion" id={safetyTarget} open
        onClose={() => setSafetyTarget(null)} onBlocked={() => navigation.goBack()} />}
      <ActionSheet
        isVisible={deleteSheetVisible}
        onClose={() => setDeleteSheetVisible(false)}
        title='Delete comment'
        message="Delete this comment?"
        actions={[
          {
            label: 'Delete',
            destructive: true,
            onPress: handleDelete,
          },
        ]}
      />
    </ComposerKeyboardView>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  list: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  row: { marginHorizontal: SPACING.lg, paddingTop: 14, paddingBottom: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  highlight: { backgroundColor: colors.primaryMuted },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryMuted },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { ...TYPOGRAPHY.buttonCaption, color: colors.primary },
  column: { flex: 1, minWidth: 0 },
  identity: { flexDirection: 'row', alignItems: 'flex-start' },
  byline: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 5 },
  author: { ...TYPOGRAPHY.subheadline, fontFamily: 'DMSans_600SemiBold', fontWeight: '600', color: colors.primaryDark, flexShrink: 1 },
  date: { ...TYPOGRAPHY.caption1, color: colors.textSecondary },
  more: { width: 34, minHeight: 24, alignItems: 'flex-end', justifyContent: 'center' },
  source: { alignSelf: 'flex-start', paddingVertical: 4 },
  body: { ...TYPOGRAPHY.body, color: colors.text, marginTop: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14 },
  link: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: 3 },
  replyText: { ...TYPOGRAPHY.footnote, color: colors.textSecondary },
  actionText: { ...TYPOGRAPHY.buttonCaption, color: colors.primaryDark },
  actionButton: { minHeight: 44, paddingHorizontal: 16, alignSelf: 'flex-start', justifyContent: 'center' },
  threadStatus: { paddingHorizontal: SPACING.lg },
  replyStatus: { minHeight: 44, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  statusText: { ...TYPOGRAPHY.caption1, color: colors.textSecondary },
  replyError: { ...TYPOGRAPHY.footnote, color: colors.danger },
  threadError: { ...TYPOGRAPHY.footnote, color: colors.danger, padding: SPACING.lg },
  emptyContainer: { alignItems: 'center', paddingVertical: 54, paddingHorizontal: 20 },
  emptyTitle: { ...TYPOGRAPHY.title3, color: colors.text, marginTop: 12 },
  emptySubtitle: { ...TYPOGRAPHY.body, color: colors.textSecondary, textAlign: 'center', marginTop: 4 },
  dock: { paddingHorizontal: SPACING.lg, paddingTop: 8, gap: 4, backgroundColor: colors.surface },
});
