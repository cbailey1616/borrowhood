import { randomUUID } from 'expo-crypto';
import MessageComposer from '../components/MessageComposer';
import ComposerKeyboardView from '../components/ComposerKeyboardView';
import ShimmerImage from '../components/ShimmerImage';
import ConversationContextCard from '../components/ConversationContextCard';
import { useState, useEffect, useRef } from 'react';
import { UNSTABLE_usePreventRemove as usePreventRemove, useIsFocused } from '@react-navigation/native';
import useNavigationTask from '../hooks/useNavigationTask';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';

import ActionSheet from '../components/ActionSheet';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function ListingDiscussionScreen({ route, navigation }) {
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
  const [actionTarget, setActionTarget] = useState(null);
  const openingChat = useRef(false);
  const [activeThreadId, setActiveThreadId] = useState(null);
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
  const scrollTarget = useRef(null);
  const scrollRetry = useRef(null);
  const scrollAttempts = useRef(0);

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
    scrollAttempts.current = 0;
    setPosts([]); setReplies({}); setReplyErrors({}); setLoadingReplies({}); setHasMoreReplies({}); setActiveThreadId(null);
    setDrafts({}); setIsLoading(true); setThreadError(''); setSendErrors({}); setIsSubmitting(false);
    fetchPosts();
    return () => { threadGeneration.current += 1; clearTimeout(scrollRetry.current); };
  }, [targetId, threadId, discussionId, user.id]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      const timer = setTimeout(() => inputRef.current?.focus(), 500);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, isLoading]);


  useEffect(() => {
    navigation.setOptions({ title: activeThreadId ? 'Replies' : 'Comments', headerBackButtonMenuEnabled: false });
  }, [activeThreadId, navigation]);

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
      setPendingDestination({ screen, params });
      setActiveThreadId(null);
    } else {
      navigation.navigate(screen, params);
    }
  };

  const fetchPosts = async (page = 1) => {
    if (loadingPosts.current) return;
    loadingPosts.current = true;
    const generation = threadGeneration.current;
    try {
      const data = isRequest
        ? await api.getRequestDiscussions(requestId, { limit: 50, page })
        : await api.getDiscussions(listingId, { limit: 50, page });
      if (generation !== threadGeneration.current) return;
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
          scrollTarget.current = { draftKey: thread.post.id, messageId: discussionId };
          await fetchReplies(thread.post.id, thread.replyPage || 1);
        } catch {
          if (generation === threadGeneration.current) setThreadError('This thread is unavailable. You can still browse the comments.');
        }
      }
    } catch (error) {
      if (generation === threadGeneration.current) setThreadError('Couldn’t load comments. Go back and try again.');
    } finally {
      if (generation === threadGeneration.current) { setIsLoading(false); loadingPosts.current = false; }
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

  const openThread = (postId, focus = false) => {
    setActiveThreadId(postId);
    setSendError('');
    if (!loadedReplies.current.has(postId)) fetchReplies(postId);
    if (focus) inputRef.current?.focus();
  };

  const closeThread = () => {
    Keyboard.dismiss();
    setActiveThreadId(null);
    setSendError('');
  };

  const handleSubmit = async () => {
    if (submitting.current || !newComment.trim()) return;
    submitting.current = true;
    const generation = threadGeneration.current;
    const parentId = activeThreadId || undefined;
    const submittedDraftKey = draftKey;
    const submittedText = newComment;
    const pending = pendingSubmissions.current[submittedDraftKey];
    const data = pending?.content === newComment.trim() ? pending : {
      content: newComment.trim(), parentId, clientRequestId: randomUUID(),
    };
    pendingSubmissions.current[submittedDraftKey] = data;
    setIsSubmitting(true);
    setSendError('');
    try {
      const result = isRequest
        ? await api.createRequestDiscussionPost(requestId, data)
        : await api.createDiscussionPost(listingId, data);
      if (generation !== threadGeneration.current) return;
      scrollTarget.current = { draftKey: submittedDraftKey, atEnd: !!parentId };

      if (parentId) {
        // Add reply to the replies list
        setReplies(prev => ({
          ...prev,
          [parentId]: [...(prev[parentId] || []).filter(reply => reply.id !== result.id), {
            id: result.id,
            content: result.content,
            createdAt: result.createdAt,
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
        // Add new top-level post
        setPosts(prev => [{
          id: result.id,
          content: result.content,
          replyCount: 0,
          createdAt: result.createdAt,
          user: {
            id: user.id,
            firstName: result.user?.firstName ?? (user.displayName || user.firstName),
            lastName: result.user?.lastName ?? (user.displayName ? '' : (user.lastName ? `${user.lastName.charAt(0)}.` : '')),
            profilePhotoUrl: user.profilePhotoUrl,
          },
          isOwn: true,
        }, ...prev.filter(post => post.id !== result.id)]);
      }

      haptics.success();
      delete pendingSubmissions.current[submittedDraftKey];
      setDrafts(prev => ({ ...prev, [submittedDraftKey]: prev[submittedDraftKey] === submittedText ? '' : prev[submittedDraftKey] }));
    } catch (error) {
      if (generation !== threadGeneration.current) return;
      setSendError('Couldn’t send. Please try again.');
      haptics.error();
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
        setReplies(prev => ({
          ...prev,
          [parentId]: (prev[parentId] || []).filter(r => r.id !== postId),
        }));
        setPosts(prev => prev.map(p =>
          p.id === parentId
            ? { ...p, replyCount: Math.max(0, (p.replyCount || 0) - 1) }
            : p
        ));
      } else {
        setPosts(prev => prev.filter(p => p.id !== postId));
        if (activeThreadId === postId) closeThread();
      }
    } catch (error) {
      setThreadError('Couldn’t delete this comment. Please try again.');
      haptics.error();
    }
  };

  const confirmDelete = (postId, isReply = false, parentId = null) => {
    setDeleteTarget({ postId, isReply, parentId });
    setDeleteSheetVisible(true);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
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

  const renderComment = (post, parentId = null) => {
    const name = [post.user.firstName, post.user.lastName].filter(Boolean).join(' ') || 'Neighbor';
    const identity = <>
      <ShimmerImage placeholderIcon="person" source={{ uri: post.user.profilePhotoUrl || null }} style={styles.postAvatar} />
      <View style={styles.commentMeta}>
        <Text style={styles.postAuthor}>{name}</Text>
        <Text style={styles.postDate}>{formatDate(post.createdAt)}</Text>
      </View>
    </>;
    return (
      <HapticPressable style={styles.comment} onLongPress={() => setActionTarget({ post, parentId })}
        accessible={false} accessibilityRole={undefined} haptic={false} scaleDown={1}
        testID={`Comments.message.${post.id}`}>
        <View style={styles.commentHeader}>
          {post.user.id ? <HapticPressable style={styles.authorIdentity} accessibilityLabel={`View ${name}’s profile`}
            onPress={() => navigateFromComments('UserProfile', { id: post.user.id })}>
            {identity}
          </HapticPressable> : <View style={styles.authorIdentity}>{identity}</View>}
          <HapticPressable accessibilityLabel={`Comment options for ${post.user.firstName}`} style={styles.moreButton}
            onPress={() => setActionTarget({ post, parentId })}>
            <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.primary} />
          </HapticPressable>
        </View>
        <Text style={styles.postContent}>{post.content}</Text>
        {!activeThreadId && (
          <View style={styles.postActions}>
            <HapticPressable style={styles.replyButton} onPress={() => openThread(post.id, true)}
              accessibilityLabel={`Reply to ${post.user.firstName}`}>
              <Ionicons name="chatbubble-outline" size={16} color={COLORS.primary} />
              <Text style={styles.actionText}>Reply</Text>
            </HapticPressable>
            {post.replyCount > 0 && <HapticPressable style={styles.replyCountButton} onPress={() => openThread(post.id)}
              accessibilityLabel={`View ${post.replyCount} ${post.replyCount === 1 ? 'reply' : 'replies'} to ${post.user.firstName}`}>
              <Text style={styles.actionText}>{post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}</Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.primary} />
            </HapticPressable>}
          </View>
        )}
      </HapticPressable>
    );
  };

  const renderPost = ({ item: post }) => (
    <View style={[styles.postCard, !!activeThreadId && styles.threadReply,
      post.id === discussionId && { backgroundColor: COLORS.primaryMuted }]}>
      {renderComment(post, activeThreadId)}
    </View>
  );

  const renderThreadStatus = () => (
    <View style={styles.threadStatus}>
      {loadingReplies[activeThreadId] ? <View style={styles.replyStatus}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.statusText}>Loading replies…</Text>
      </View> : replyErrors[activeThreadId] ? <View style={styles.replyStatus}>
        <Text accessibilityRole="alert" style={styles.replyError}>{replyErrors[activeThreadId]}</Text>
        <HapticPressable style={styles.actionButton} accessibilityLabel="Retry loading replies"
          onPress={() => fetchReplies(activeThreadId, failedReplyPages.current[activeThreadId] || 1)}>
          <Text style={styles.actionText}>Try again</Text>
        </HapticPressable>
      </View> : hasMoreReplies[activeThreadId] ? (
        <HapticPressable style={styles.actionButton} onPress={() => fetchReplies(activeThreadId, replyPages.current[activeThreadId] + 1)}>
          <Text style={styles.actionText}>Show more replies</Text>
        </HapticPressable>
      ) : null}
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const renderInputBar = () => (
    <View testID="Comments.composer" style={[styles.composeContainer, {
      // The keyboard covers the home indicator; keep only a small typing gap.
      paddingBottom: keyboardVisible ? SPACING.sm : Math.max(insets.bottom, SPACING.md),
    }]}>
      {!!sendError && <Text accessibilityRole="alert" style={styles.sendError}>{sendError}</Text>}
      <MessageComposer
        ref={inputRef}
        resetKey={draftKey}
        value={newComment}
        onChangeText={setNewComment}
        onSend={handleSubmit}
        placeholder={activeThreadId ? 'Reply in thread…' : 'Add a comment…'}
        inputAccessibilityLabel="Comment"
        sendAccessibilityLabel={activeThreadId ? 'Post reply' : 'Post comment'}
        editable={!isSubmitting}
        disabled={!newComment.trim() || isSubmitting}
        loading={isSubmitting}
      />
    </View>
  );

  return (
    <ComposerKeyboardView
      testID="Comments.keyboardLayout"
      style={styles.container}
      onKeyboardVisibilityChange={setKeyboardVisible}
    >
      {/* Header */}
      <ConversationContextCard
        title={targetTitle || (isRequest ? 'Wanted post' : 'Shared item')}
        label="Public comments"
        photoUrl={target?.photoUrl || target?.photos?.[0]}
        icon={isRequest ? 'chatbubble' : 'basket'}
        accessibilityLabel="View original post"
        onPress={() => navigateFromComments(isRequest ? 'RequestDetail' : 'ListingDetail', { id: targetId })}
      />
      {!!threadError && <Text accessibilityRole="alert" style={styles.threadError}>{threadError}</Text>}

      <FlatList
        ref={listRef}
        style={styles.list}
        key={activeThreadId || 'comments'}
        data={activeThreadId ? replies[activeThreadId] || [] : posts}
        renderItem={renderPost}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (scrollTarget.current?.draftKey !== draftKey) return;
          const { atEnd, messageId } = scrollTarget.current;
          scrollTarget.current = null;
          const index = messageId ? (replies[activeThreadId] || []).findIndex(reply => reply.id === messageId) : -1;
          if (index >= 0) listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.3 });
          else if (atEnd) listRef.current?.scrollToEnd({ animated: true });
          else listRef.current?.scrollToOffset({ offset: 0, animated: true });
        }}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          if (scrollAttempts.current++ >= 3) return;
          const generation = threadGeneration.current;
          listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
          clearTimeout(scrollRetry.current);
          scrollRetry.current = setTimeout(() => {
            if (generation === threadGeneration.current) listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.3 });
          }, 100);
        }}
        ListHeaderComponent={activeThread ? <View style={styles.threadParent}>
          {renderComment(activeThread)}
          <Text style={styles.threadCount}>{activeThread.replyCount || 0} {activeThread.replyCount === 1 ? 'reply' : 'replies'}</Text>
        </View> : null}
        ListFooterComponent={activeThreadId ? <>
          {earliestReplyPage[activeThreadId] > 1 && <HapticPressable style={styles.actionButton}
            onPress={() => fetchReplies(activeThreadId, earliestReplyPage[activeThreadId] - 1)}>
            <Text style={styles.actionText}>Earlier replies</Text>
          </HapticPressable>}
          {renderThreadStatus()}
        </> : hasMorePosts ? <HapticPressable style={styles.actionButton} onPress={() => fetchPosts(postsPage.current + 1)}>
          <Text style={styles.actionText}>Older comments</Text>
        </HapticPressable> : null}
        ListEmptyComponent={activeThreadId ? null :
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color={COLORS.gray[600]} />
            <Text style={styles.emptyTitle}>{isRequest ? 'No responses yet' : 'No comments yet'}</Text>
            <Text style={styles.emptySubtitle}>
              {isRequest
                ? 'Be the first to respond to this wanted post'
                : 'Be the first to ask a question about this item'}
            </Text>
          </View>
        }
      />

      {/* Input Bar */}
      {renderInputBar()}

      <ActionSheet
        isVisible={!!actionTarget}
        onClose={() => setActionTarget(null)}
        title={actionTarget ? `${actionTarget.post.user.firstName}’s comment` : 'Comment'}
        actions={actionTarget ? [
          {
            label: 'Reply in thread',
            onPress: () => openThread(actionTarget.parentId || actionTarget.post.id, true),
          },
          ...(actionTarget.post.user.id && !actionTarget.post.isOwn && actionTarget.post.user.id !== user?.id ? [{
            label: `Message ${actionTarget.post.user.firstName} privately`,
            onPress: () => openPrivateChat(actionTarget.post),
          }] : []),
          ...((actionTarget.post.isOwn || actionTarget.post.user.id === user?.id || isOwner) ? [{
            label: 'Delete comment', destructive: true,
            onPress: () => confirmDelete(actionTarget.post.id, !!actionTarget.parentId, actionTarget.parentId),
          }] : []),
        ] : []}
      />

      <ActionSheet
        isVisible={deleteSheetVisible}
        onClose={() => setDeleteSheetVisible(false)}
        title="Delete comment"
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
  threadError: { ...TYPOGRAPHY.footnote, color: COLORS.danger, padding: SPACING.lg },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
  },
  list: { flex: 1 },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 20,
    color: COLORS.text,
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  postCard: {
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  comment: { minWidth: 0 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  authorIdentity: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  commentMeta: { flex: 1, gap: 2 },
  postAvatar: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryMuted,
  },
  postAuthor: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.text,
    flexShrink: 1,
  },
  postDate: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  moreButton: {
    width: 44, minHeight: 44, borderRadius: RADIUS.full,
    alignItems: 'center', justifyContent: 'center',
  },
  postContent: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    lineHeight: 23,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  replyButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.xs },
  replyCountButton: { minHeight: 44, marginLeft: 'auto', paddingHorizontal: SPACING.sm, flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  actionButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryMuted,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    flexShrink: 1,
  },
  actionText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.primary,
    fontWeight: '400',
    flexShrink: 1,
  },
  threadParent: { padding: SPACING.md, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg },
  threadCount: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, marginTop: SPACING.md, paddingHorizontal: SPACING.xs },
  threadReply: {
    marginLeft: SPACING.lg,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.primaryMuted,
  },
  threadStatus: { paddingVertical: SPACING.md },
  replyStatus: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SPACING.sm },
  statusText: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  replyError: { ...TYPOGRAPHY.footnote, color: COLORS.danger, flexShrink: 1 },
  composeContainer: {
    flexShrink: 0,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  sendError: { ...TYPOGRAPHY.footnote, color: COLORS.danger, marginBottom: SPACING.sm },
});
