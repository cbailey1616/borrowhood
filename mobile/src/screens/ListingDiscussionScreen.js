import MessageComposer from '../components/MessageComposer';
import ShimmerImage from '../components/ShimmerImage';
import { useState, useEffect, useRef } from 'react';
import { useHeaderHeight } from '@react-navigation/elements';
import { UNSTABLE_usePreventRemove as usePreventRemove } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';

import ActionSheet from '../components/ActionSheet';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function ListingDiscussionScreen({ route, navigation }) {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const { listingId, listing, requestId, request, autoFocus } = route.params;
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
  const loadedReplies = useRef(new Set());
  const replyPages = useRef({});
  const replyRequests = useRef(new Map());
  const threadGeneration = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
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

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

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
    replyRequests.current = new Map();
    submitting.current = false;
    setPosts([]); setReplies({}); setReplyErrors({}); setLoadingReplies({}); setHasMoreReplies({}); setActiveThreadId(null);
    setDrafts({}); setIsLoading(true); setThreadError(''); setSendErrors({}); setIsSubmitting(false);
    fetchPosts();
    return () => { threadGeneration.current += 1; };
  }, [targetId]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      const timer = setTimeout(() => inputRef.current?.focus(), 500);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, isLoading]);


  useEffect(() => {
    navigation.setOptions({ title: activeThreadId ? 'Thread' : 'Comments', headerBackButtonMenuEnabled: false });
  }, [activeThreadId, navigation]);

  usePreventRemove(!!activeThreadId, () => {
    Keyboard.dismiss();
    setActiveThreadId(null);
    setSendError('');
  });

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

  const fetchPosts = async () => {
    const generation = threadGeneration.current;
    try {
      const data = isRequest
        ? await api.getRequestDiscussions(requestId, { limit: 50 })
        : await api.getDiscussions(listingId, { limit: 50 });
      if (generation === threadGeneration.current) setPosts(data.posts || []);
    } catch (error) {
      if (generation === threadGeneration.current) setThreadError('Couldn’t load comments. Go back and try again.');
    } finally {
      if (generation === threadGeneration.current) setIsLoading(false);
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
        replyPages.current[postId] = page;
        setHasMoreReplies(prev => ({ ...prev, [postId]: fetched.length === 50 }));
      } catch (error) {
        if (generation === threadGeneration.current) {
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
    setIsSubmitting(true);
    setSendError('');
    try {
      const data = {
        content: newComment.trim(),
        parentId,
      };

      const result = isRequest
        ? await api.createRequestDiscussionPost(requestId, data)
        : await api.createDiscussionPost(listingId, data);
      if (generation !== threadGeneration.current) return;
      scrollTarget.current = { draftKey: submittedDraftKey, atEnd: !!parentId };

      if (parentId) {
        // Add reply to the replies list
        setReplies(prev => ({
          ...prev,
          [parentId]: [...(prev[parentId] || []), {
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
        setPosts(prev => prev.map(p =>
          p.id === parentId
            ? { ...p, replyCount: (p.replyCount || 0) + 1 }
            : p
        ));

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
        }, ...prev]);
      }

      haptics.success();
      setDrafts(prev => ({ ...prev, [submittedDraftKey]: '' }));
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
    openingChat.current = true;
    try {
      const conversations = await api.getConversations();
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
    return (
      <HapticPressable style={styles.comment} onLongPress={() => setActionTarget({ post, parentId })}
        accessible={false} accessibilityRole={undefined} haptic={false} scaleDown={1}
        testID={`Comments.message.${post.id}`}>
        <View style={styles.commentHeader}>
          <ShimmerImage placeholderIcon="person" source={{ uri: post.user.profilePhotoUrl || null }}
            style={[styles.postAvatar, !!parentId && styles.replyAvatar]} />
          <View style={styles.commentMeta}>
            <Text style={styles.postAuthor}>{[post.user.firstName, post.user.lastName].filter(Boolean).join(' ')}</Text>
            <Text style={styles.postDate}>{formatDate(post.createdAt)}</Text>
          </View>
          <HapticPressable accessibilityLabel={`Comment options for ${post.user.firstName}`} style={styles.moreButton}
            onPress={() => setActionTarget({ post, parentId })}>
            <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.primary} />
          </HapticPressable>
        </View>
        <Text style={[styles.postContent, !!parentId && styles.replyIndent]}>{post.content}</Text>
        {!activeThreadId && post.replyCount > 0 && (
          <View style={styles.postActions}>
            <HapticPressable style={styles.actionButton} onPress={() => openThread(post.id)}
              accessibilityLabel={`View ${post.replyCount} ${post.replyCount === 1 ? 'reply' : 'replies'} to ${post.user.firstName}`}>
              <Ionicons name="chatbubble-outline" size={15} color={COLORS.primary} />
              <Text style={styles.actionText}>{post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}</Text>
            </HapticPressable>
          </View>
        )}
      </HapticPressable>
    );
  };

  const renderPost = ({ item: post }) => (
    <View style={[styles.postCard, !!activeThreadId && styles.threadReply]}>
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
          onPress={() => fetchReplies(activeThreadId, (replyPages.current[activeThreadId] || 0) + 1)}>
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
    <KeyboardAvoidingView
      testID="Comments.keyboardLayout"
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      {/* Header */}
      <View style={styles.listingHeader}>
        <View style={styles.listingContext}>
          {activeThreadId ? <HapticPressable style={styles.backToComments} onPress={closeThread}>
            <Ionicons name="chevron-back" size={18} color={COLORS.primary} />
            <Text style={styles.actionText}>Back to comments</Text>
          </HapticPressable> : <Text style={styles.listingTitle} numberOfLines={fontScale > 1.4 ? undefined : 2}>{targetTitle || (isRequest ? 'Neighbor request' : 'Shared item')}</Text>}
          <HapticPressable style={styles.viewPostButton} accessibilityLabel="View original post"
            onPress={() => navigateFromComments(isRequest ? 'RequestDetail' : 'ListingDetail', { id: targetId })}>
            <Text style={styles.actionText}>View post</Text>
          </HapticPressable>
        </View>
        {!activeThreadId && <Text style={styles.visibilityNote}>Comments are visible to people who can see this post.</Text>}
      </View>
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
          const { atEnd } = scrollTarget.current;
          scrollTarget.current = null;
          if (atEnd) listRef.current?.scrollToEnd({ animated: true });
          else listRef.current?.scrollToOffset({ offset: 0, animated: true });
        }}
        ListHeaderComponent={activeThread ? <View style={styles.threadParent}>
          {renderComment(activeThread)}
          <Text style={styles.threadCount}>{activeThread.replyCount || 0} {activeThread.replyCount === 1 ? 'reply' : 'replies'}</Text>
        </View> : null}
        ListFooterComponent={activeThreadId ? renderThreadStatus() : null}
        ListEmptyComponent={activeThreadId ? null :
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color={COLORS.gray[600]} />
            <Text style={styles.emptyTitle}>{isRequest ? 'No responses yet' : 'No comments yet'}</Text>
            <Text style={styles.emptySubtitle}>
              {isRequest
                ? 'Be the first to respond to this request'
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
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  listingContext: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SPACING.md },
  listingTitle: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 180,
  },
  viewPostButton: {
    minHeight: 44, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderGreenStrong,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface,
  },
  visibilityNote: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, marginTop: SPACING.sm },
  threadError: { ...TYPOGRAPHY.footnote, color: COLORS.danger, padding: SPACING.lg },
  listContent: {
    paddingHorizontal: SPACING.lg,
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
    paddingVertical: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
  },
  comment: { minWidth: 0 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  commentMeta: { flex: 1, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: SPACING.sm, rowGap: 2 },
  postAvatar: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryMuted,
  },
  postAuthor: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
    flexShrink: 1,
  },
  postDate: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  moreButton: {
    width: 44, minHeight: 44, borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.borderGreen,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface,
  },
  postContent: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    lineHeight: 23,
    marginTop: SPACING.xs,
    marginLeft: 44,
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    marginLeft: 44,
  },
  actionButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.borderGreenStrong,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
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
    fontWeight: '600',
    flexShrink: 1,
  },
  backToComments: {
    minHeight: 44, flexGrow: 1, flexShrink: 1, flexDirection: 'row', alignItems: 'center',
    gap: SPACING.xs, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderGreenStrong,
    backgroundColor: COLORS.surface,
  },
  threadParent: { paddingTop: SPACING.lg, paddingBottom: SPACING.md },
  threadCount: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, marginLeft: 44, marginTop: SPACING.lg },
  threadReply: {
    marginLeft: 18,
    paddingLeft: SPACING.md,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.primaryMuted,
    borderBottomWidth: 0,
  },
  replyAvatar: {
    width: 28,
    height: 28,
  },
  replyIndent: { marginLeft: 36 },
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
