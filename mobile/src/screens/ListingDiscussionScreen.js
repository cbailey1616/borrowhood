import * as Clipboard from 'expo-clipboard';
import MessageReactionMenu from '../components/MessageReactionMenu';
import MessageReactions from '../components/MessageReactions';
import ContentSafetyActions from '../components/ContentSafetyActions';
import { randomUUID } from 'expo-crypto';
import DiscussionComposer from '../components/DiscussionComposer';
import { DISCUSSION_EMOJIS, DISCUSSION_DARK_COLORS, flattenDiscussion, discussionMentions, removeDiscussionBranch } from '../utils/discussionThread';
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
  Keyboard,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';

import ActionSheet from '../components/ActionSheet';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function ListingDiscussionScreen({ route, navigation }) {
  const scheme = useColorScheme();
  const colors = useMemo(() => scheme === 'dark' ? DISCUSSION_DARK_COLORS : COLORS, [scheme]);
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
  const [reactionTarget, setReactionTarget] = useState(null);
  const reacting = useRef(false);
  const [actionTarget, setActionTarget] = useState(null);
  const [safetyTarget, setSafetyTarget] = useState(null);
  const openingChat = useRef(false);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [replyToPostId, setReplyToPostId] = useState(null);
  const [expandedThreads, setExpandedThreads] = useState(new Set());
  const [collapsedComments, setCollapsedComments] = useState(new Set());
  const [sort, setSort] = useState('top');
  const sortRef = useRef('top');
  const postsRequest = useRef(0);
  const voting = useRef(new Set());
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
    setReactionTarget(null); setActionTarget(null);
    setReplyToPostId(null); setExpandedThreads(new Set()); setCollapsedComments(new Set());
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
    navigation.setOptions({ title: 'Comments', headerBackButtonMenuEnabled: false, headerStyle: {backgroundColor:colors.background}, headerTintColor:colors.text });
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
        ? await api.getRequestDiscussions(requestId, { limit: 50, page, sort: sortRef.current })
        : await api.getDiscussions(listingId, { limit: 50, page, sort: sortRef.current });
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
          setReplyToPostId(thread.post.id);
          setExpandedThreads(previous => new Set([...previous,thread.post.id]));
          scrollTarget.current = { draftKey: thread.post.id, messageId: discussionId };
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
    setReplyToPostId(replyToId);
    setExpandedThreads(previous => new Set([...previous,postId]));
    setCollapsedComments(previous => { const next = new Set(previous); next.delete(postId); next.delete(replyToId); return next; });
    setActiveThreadId(postId);
    setSendError('');
    if (!loadedReplies.current.has(postId)) fetchReplies(postId);
    scrollTarget.current = {draftKey:postId,messageId:replyToId};
    if (focus) setTimeout(() => inputRef.current?.focus(), 50);
  };

  const closeThread = () => {
    Keyboard.dismiss();
    setActiveThreadId(null);
    setReplyToPostId(null);
    setSendError('');
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
    const data = pending?.content === selectedText.trim() ? pending : {
      content: selectedText.trim(), parentId, clientRequestId: randomUUID(),
      ...(parentId && replyToPostId && replyToPostId !== parentId ? {replyToId:replyToPostId} : {}),
    };
    pendingSubmissions.current[submittedDraftKey] = data;
    setIsSubmitting(true);
    setSendError('');
    try {
      const result = isRequest
        ? await api.createRequestDiscussionPost(requestId, data)
        : await api.createDiscussionPost(listingId, data);
      if (generation !== threadGeneration.current) return;
      scrollTarget.current = { draftKey: submittedDraftKey, atEnd: !!parentId, messageId: result.id };

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
        // Add new top-level post
        setPosts(prev => [{
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
        }, ...prev.filter(post => post.id !== result.id)]);
      }

      haptics.success();
      delete pendingSubmissions.current[submittedDraftKey];
      setDrafts(prev => ({ ...prev, [submittedDraftKey]: prev[submittedDraftKey] === submittedText ? '' : prev[submittedDraftKey] }));
    } catch (error) {
      if (generation !== threadGeneration.current) return;
      setSendErrors(previous => ({...previous,[submittedDraftKey]:'Couldn’t send. Please try again.'}));
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
        const branch = removeDiscussionBranch(replies[parentId] || [], postId);
        setReplies(prev => ({ ...prev, [parentId]: removeDiscussionBranch(prev[parentId] || [], postId).items }));
        setPosts(prev => prev.map(p => p.id === parentId
          ? { ...p, replyCount: Math.max(0, (p.replyCount || 0) - branch.removed.size) } : p));
        if (branch.removed.has(replyToPostId)) closeThread();
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
      haptics.success();
    } catch { if (generation === threadGeneration.current) setThreadError('Couldn’t update reaction. Try again.'); }
    finally { reacting.current = false; }
  };

  const threadRows = useMemo(() => flattenDiscussion(posts,replies,expandedThreads,collapsedComments,sort), [posts,replies,expandedThreads,collapsedComments,sort]);
  const mentions = useMemo(() => discussionMentions(posts,replies,user), [posts,replies,user]);
  const replyTarget = replyToPostId ? threadRows.find(post => post.id === replyToPostId) : null;

  const vote = async (post, direction) => {
    if (voting.current.has(post.id)) return;
    voting.current.add(post.id);
    const generation = threadGeneration.current;
    const value = post.viewerVote === direction ? 0 : direction;
    try {
      const result = await (isRequest ? api.voteOnRequestDiscussion : api.voteOnDiscussion)(targetId,post.id,value);
      if (generation !== threadGeneration.current) return;
      const update = item => item.id === post.id ? {...item,score:result.score,viewerVote:result.viewerVote} : item;
      setPosts(previous => previous.map(update));
      setReplies(previous => Object.fromEntries(Object.entries(previous).map(([id,items]) => [id,items.map(update)])));
    } catch { if (generation === threadGeneration.current) setThreadError('Couldn’t update vote. Try again.'); }
    finally { voting.current.delete(post.id); }
  };

  const renderComment = (post, parentId = null) => {
    const name = [post.user.firstName,post.user.lastName].filter(Boolean).join(' ') || 'Neighbor';
    const collapsed = collapsedComments.has(post.id);
    const identity = <>
      <ShimmerImage placeholderIcon="person" source={{uri:post.user.profilePhotoUrl || null}} style={styles.postAvatar}/>
      <View style={styles.commentMeta}>
        <Text style={styles.postAuthor}>{name}</Text>
        <Text style={styles.postDate}>{formatDate(post.createdAt)}</Text>
      </View>
    </>;
    return <HapticPressable style={styles.comment} onLongPress={event => openReactions(post,parentId,event)}
      accessible={false} accessibilityRole={undefined} haptic={false} scaleDown={1} testID={`Comments.message.${post.id}`}>
      <View style={styles.commentHeader}>
        {post.user.id ? <HapticPressable style={styles.authorIdentity} accessibilityLabel={`View ${name}’s profile`}
          onPress={() => navigateFromComments('UserProfile',{id:post.user.id})}>{identity}</HapticPressable> : <View style={styles.authorIdentity}>{identity}</View>}
        <HapticPressable accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} comment by ${post.user.firstName}`}
          accessibilityState={{expanded:!collapsed}} style={styles.moreButton} onPress={() => {
            setCollapsedComments(previous => { const next = new Set(previous); if (next.has(post.id)) next.delete(post.id); else next.add(post.id); return next; });
            if (!collapsed && activeThreadId === (parentId || post.id)) closeThread();
          }}><Ionicons name={collapsed ? 'add' : 'remove'} size={18} color={colors.textMuted}/></HapticPressable>
        <HapticPressable accessibilityLabel={`Comment options for ${post.user.firstName}`} style={styles.moreButton}
          onPress={() => setActionTarget({post,parentId})}><Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted}/></HapticPressable>
      </View>
      {!collapsed && <View style={styles.commentBody}>
        <Text style={styles.postContent}>{post.content.split(/(@[a-zA-Z0-9_]+)/g).map((part,index) =>
          part.startsWith('@') && mentions.some(person => `@${person.handle}`.toLowerCase() === part.toLowerCase())
            ? <Text key={index} style={styles.mention}>{part}</Text> : part)}</Text>
        <MessageReactions compact colors={colors} reactions={post.reactions} userId={user.id} onToggle={emoji => react(post,emoji)}/>
        <View style={styles.postActions}>
          <View style={styles.voteControl}>
            {[1,-1].map(direction => <HapticPressable key={direction} style={styles.voteButton}
              accessibilityLabel={`${direction === 1 ? 'Upvote' : 'Downvote'} comment by ${post.user.firstName}`}
              accessibilityState={{selected:post.viewerVote === direction}} onPress={() => vote(post,direction)}>
              <Ionicons name={direction === 1 ? 'arrow-up' : 'arrow-down'} size={17}
                color={post.viewerVote === direction ? direction === 1 ? colors.primary : colors.danger : colors.textMuted}/>
              {direction === 1 && <Text accessibilityLabel={`Score: ${post.score || 0}`} style={styles.voteScore}>{post.score || 0}</Text>}
            </HapticPressable>)}
          </View>
          <HapticPressable style={styles.replyButton} onPress={() => openThread(parentId || post.id,true,post.id)} accessibilityLabel={`Reply to ${post.user.firstName}`}>
            <Ionicons name="chat-reply" size={16} color={colors.textMuted}/><Text style={styles.actionText}>Reply</Text>
          </HapticPressable>
          <HapticPressable style={styles.moreButton} accessibilityLabel="Add reaction" onPress={event => openReactions(post,parentId,event)}>
            <Ionicons name="reaction-add" size={23} color={colors.primary}/>
          </HapticPressable>
          {!parentId && post.replyCount > 0 && <HapticPressable style={styles.replyCountButton} onPress={() => openThread(post.id)}
            accessibilityLabel={`View ${post.replyCount} ${post.replyCount === 1 ? 'reply' : 'replies'} to ${post.user.firstName}`}>
            <Text style={styles.actionText}>{post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}</Text>
          </HapticPressable>}
        </View>
        {activeThreadId && replyToPostId === post.id && renderInputBar(true)}
      </View>}
    </HapticPressable>;
  };

  const renderPost = ({item:post}) => <View style={[styles.postCard,post.depth > 0 && [styles.threadReply,{marginLeft:Math.min(3,post.depth)*12}],
    post.id === discussionId && {backgroundColor:colors.primaryMuted}]}>
    {renderComment(post,post.depth > 0 ? post.rootId : null)}
    {post.depth === 0 && expandedThreads.has(post.id) && !collapsedComments.has(post.id) && renderThreadStatus(post.id)}
  </View>;

  const renderThreadStatus = (postId = activeThreadId) => (
    <View style={styles.threadStatus}>
      {loadingReplies[postId] ? <View style={styles.replyStatus}>
        <ActivityIndicator size="small" color={colors.spinner} />
        <Text style={styles.statusText}>Loading replies…</Text>
      </View> : replyErrors[postId] ? <View style={styles.replyStatus}>
        <Text accessibilityRole="alert" style={styles.replyError}>{replyErrors[postId]}</Text>
        <HapticPressable style={styles.actionButton} accessibilityLabel="Retry loading replies"
          onPress={() => fetchReplies(postId, failedReplyPages.current[postId] || 1)}>
          <Text style={styles.actionText}>Try again</Text>
        </HapticPressable>
      </View> : hasMoreReplies[postId] ? (
        <HapticPressable style={styles.actionButton} onPress={() => fetchReplies(postId, replyPages.current[postId] + 1)}>
          <Text style={styles.actionText}>Show more replies</Text>
        </HapticPressable>
      ) : null}
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.spinner} />
      </View>
    );
  }

  const renderInputBar = (inline = false) => {
    const key = inline ? draftKey : 'comments';
    const text = drafts[key] || '';
    return <View testID={inline || !activeThreadId ? 'Comments.composer' : 'Comments.mainComposer'} style={[styles.composeContainer,{
      paddingBottom:inline ? 8 : keyboardVisible ? SPACING.sm : Math.max(insets.bottom,SPACING.md),
    }]}>
      {!!sendErrors[key] && <Text accessibilityRole="alert" style={styles.sendError}>{sendErrors[key]}</Text>}
      <DiscussionComposer ref={inline || !activeThreadId ? inputRef : undefined} resetKey={key} value={text}
        colors={colors} dark={scheme === 'dark'} mentions={mentions}
        replyTo={inline ? mentions.find(person => person.id === replyTarget?.user.id)?.name || 'Neighbor' : undefined}
        onCancel={closeThread} onChangeText={value => setDrafts(previous => ({...previous,[key]:value}))}
        onSend={() => handleSubmit(inline ? activeThreadId : null)}
        inputAccessibilityLabel={inline || !activeThreadId ? 'Comment' : 'New comment'}
        sendAccessibilityLabel={inline ? 'Post reply' : 'Post comment'} editable={!isSubmitting}
        disabled={!text.trim() || isSubmitting} loading={isSubmitting}/>
    </View>;
  };

  return (
    <ComposerKeyboardView
      testID="Comments.keyboardLayout"
      style={styles.container}
      onKeyboardVisibilityChange={setKeyboardVisible}
    >
      {/* Header */}
      <ConversationContextCard
        colors={colors}
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
        data={threadRows}
        renderItem={renderPost}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (!scrollTarget.current || (scrollTarget.current.draftKey !== draftKey && scrollTarget.current.draftKey !== 'comments')) return;
          const { atEnd, messageId } = scrollTarget.current;
          scrollTarget.current = null;
          const index = messageId ? threadRows.findIndex(reply => reply.id === messageId) : -1;
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
        ListHeaderComponent={<View>
          {renderInputBar(false)}
          <View style={styles.sortToolbar} accessibilityRole="tablist">
            <Text style={styles.sortLabel}>The conversation</Text>
            {['top','newest','oldest'].map(order => <HapticPressable key={order} accessibilityRole="tab"
              accessibilityLabel={`Sort ${order}`} accessibilityState={{selected:sort === order}}
              style={[styles.sortButton,sort === order && styles.sortSelected]} onPress={() => {
                setSort(order);sortRef.current=order;fetchPosts(1);
              }}><Text style={styles.actionText}>{order[0].toUpperCase()+order.slice(1)}</Text></HapticPressable>)}
          </View>
        </View>}
        ListFooterComponent={<>
          {!!activeThreadId && earliestReplyPage[activeThreadId] > 1 && <HapticPressable style={styles.actionButton}
            onPress={() => fetchReplies(activeThreadId,earliestReplyPage[activeThreadId]-1)}><Text style={styles.actionText}>Earlier replies</Text></HapticPressable>}
          {hasMorePosts && <HapticPressable style={styles.actionButton} onPress={() => fetchPosts(postsPage.current+1)}><Text style={styles.actionText}>Older comments</Text></HapticPressable>}
        </>}
        ListEmptyComponent={activeThreadId ? null :
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color={colors.gray[600]} />
            <Text style={styles.emptyTitle}>{isRequest ? 'No responses yet' : 'No comments yet'}</Text>
            <Text style={styles.emptySubtitle}>
              {isRequest
                ? 'Be the first to respond to this wanted post'
                : 'Be the first to ask a question about this item'}
            </Text>
          </View>
        }
      />


      <MessageReactionMenu options={DISCUSSION_EMOJIS} colors={colors} visible={!!reactionTarget} position={reactionTarget?.position} onClose={() => setReactionTarget(null)}
        onSelect={emoji => react(reactionTarget.post,emoji)} onMore={() => { setActionTarget(reactionTarget); setReactionTarget(null); }} />
      <ActionSheet
        isVisible={!!actionTarget}
        onClose={() => setActionTarget(null)}
        title={actionTarget ? `${actionTarget.post.user.firstName}’s comment` : 'Comment'}
        actions={actionTarget ? [
          { label: 'Add reaction', onPress: () => openReactions(actionTarget.post,actionTarget.parentId) },
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

const makeStyles = COLORS => StyleSheet.create({
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
  commentBody:{marginLeft:0},
  mention:{color:COLORS.primary,backgroundColor:COLORS.primaryMuted,fontWeight:'600'},
  voteControl:{flexDirection:'row',borderRadius:10,backgroundColor:COLORS.surfaceElevated,alignItems:'center'},
  voteButton:{minHeight:44,minWidth:34,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4,paddingHorizontal:4},
  voteScore:{...TYPOGRAPHY.caption1,color:COLORS.text},
  sortToolbar:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:4,marginBottom:12},
  sortLabel:{...TYPOGRAPHY.caption1,color:COLORS.textMuted,marginRight:'auto'},
  sortButton:{minHeight:44,paddingHorizontal:10,alignItems:'center',justifyContent:'center',borderRadius:10},
  sortSelected:{backgroundColor:COLORS.primaryMuted},
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
    fontWeight:'600',
    color: COLORS.text,
    flexShrink: 1,
  },
  postDate: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  moreButton: {
    width: 32, minHeight: 44, borderRadius: RADIUS.full,
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
  replyButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: SPACING.xs },
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
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: COLORS.border,
    borderRadius:0,marginBottom:SPACING.xs,backgroundColor:'transparent',
  },
  threadStatus: { paddingVertical: SPACING.md },
  replyStatus: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SPACING.sm },
  statusText: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  replyError: { ...TYPOGRAPHY.footnote, color: COLORS.danger, flexShrink: 1 },
  composeContainer: {
    flexShrink: 0,
    backgroundColor: COLORS.background,
    paddingHorizontal: 0,
    paddingTop: SPACING.sm,
  },
  sendError: { ...TYPOGRAPHY.footnote, color: COLORS.danger, marginBottom: SPACING.sm },
});
