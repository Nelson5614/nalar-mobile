import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { api } from '@/lib/session';
import { compactCount, shortDate, timeAgo } from '@/lib/time';
import type { MediaDetail, RelatedVideo, VideoComment } from '@/lib/types';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const failure = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

type Me = { id: number; name: string; profile_photo_url?: string | null } | null;

/** Who a reply answers, and the first comment of the thread it lands in. */
type ReplyTarget = { rootId: number; name: string; mention: boolean };

/**
 * Under the player, in YouTube's order: title and stats, the channel, the
 * action row, the description, then comments. Up next follows on its own.
 */
export function VideoDetails({ media, me, onMessage }: { media: MediaDetail; me: Me; onMessage: () => void }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const stats = [plural(media.views ?? 0, 'view', 'views'), shortDate(media.created_at)].filter(Boolean).join(' · ');

  return (
    <View style={styles.details}>
      <ThemedText style={styles.title}>{media.title}</ThemedText>
      <View style={styles.statsRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {stats}
        </ThemedText>
        {media.requires_payment ? (
          <View style={[styles.premiumTag, { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" style={styles.onDark}>
              Premium
            </ThemedText>
          </View>
        ) : null}
      </View>

      <ChannelRow creator={media.creator} me={me} />
      <ActionRow media={media} me={me} onMessage={onMessage} />

      {media.description ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Show less of the description' : 'Show more of the description'}
          onPress={() => setExpanded((open) => !open)}
          style={[styles.descriptionBox, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" numberOfLines={expanded ? undefined : 3}>
            {media.description}
          </ThemedText>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {expanded ? 'Show less' : 'more'}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

function ChannelRow({ creator, me }: { creator: MediaDetail['creator']; me: Me }) {
  const theme = useTheme();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [delta, setDelta] = useState(0);
  const [busy, setBusy] = useState(false);
  const canSubscribe = me !== null && me.id !== creator.id;

  useEffect(() => {
    if (!canSubscribe) return;
    let cancelled = false;
    api
      .get<{ is_subscribed: boolean }>(`/api/v1/subscription/check?creator_id=${creator.id}`)
      .then((result) => !cancelled && setSubscribed(Boolean(result.is_subscribed)))
      .catch(() => !cancelled && setSubscribed(false));

    return () => {
      cancelled = true;
    };
  }, [canSubscribe, creator.id]);

  async function toggle() {
    setBusy(true);
    try {
      if (subscribed) {
        await api.delete(`/api/v1/subscriptions?creator_id=${creator.id}`);
        setSubscribed(false);
        setDelta((d) => d - 1);
      } else {
        await api.post('/api/v1/subscriptions', { creator_id: creator.id });
        setSubscribed(true);
        setDelta((d) => d + 1);
      }
    } catch {
      // The button keeps its state; pressing again retries.
    } finally {
      setBusy(false);
    }
  }

  const subscribers = Math.max(0, (creator.subscribers_count ?? 0) + delta);

  return (
    <View style={styles.channel}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={creator.name}
        onPress={() =>
          router.push({ pathname: '/creator/[id]', params: { id: creator.public_id ?? String(creator.id) } })
        }
        style={styles.channelWho}>
        <Avatar uri={creator.profile_photo_url} name={creator.name} size={40} />
        <View style={styles.channelText}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {creator.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {plural(subscribers, 'subscriber', 'subscribers')}
          </ThemedText>
        </View>
      </Pressable>
      {canSubscribe && subscribed !== null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={subscribed ? 'Subscribed' : 'Subscribe'}
          accessibilityState={{ busy }}
          disabled={busy}
          onPress={toggle}
          style={({ pressed }) => [
            styles.pill,
            { backgroundColor: subscribed ? theme.backgroundElement : theme.text },
            pressed && { opacity: 0.8 },
          ]}>
          {subscribed ? <SymbolView name="bell" size={14} tintColor={theme.text} /> : null}
          <ThemedText type="smallBold" style={{ color: subscribed ? theme.text : theme.background }}>
            {subscribed ? 'Subscribed' : 'Subscribe'}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

function ActionRow({ media, me, onMessage }: { media: MediaDetail; me: Me; onMessage: () => void }) {
  const [liked, setLiked] = useState(Boolean(media.is_liked));
  const [likes, setLikes] = useState(media.likes_count ?? 0);

  async function like() {
    try {
      const result = await api.post<{ action: string; likes_count: number }>(`/api/v1/media/${media.id}/toggle-like`);
      setLiked(result.action === 'liked');
      setLikes(result.likes_count);
    } catch {
      // Nothing changed on the server, so nothing changes here.
    }
  }

  async function share() {
    try {
      const { share_url } = await api.post<{ share_url: string }>(`/api/v1/media/${media.id}/share`);
      await Share.share({ message: `${media.title} ${share_url}` });
    } catch {
      // A closed share sheet or a refused link leaves the page as it was.
    }
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions}>
      {me ? (
        <Chip
          icon={liked ? 'hand.thumbsup.fill' : 'hand.thumbsup'}
          label={compactCount(likes)}
          a11y={`${liked ? 'Unlike' : 'Like'}, ${plural(likes, 'like', 'likes')}`}
          onPress={like}
        />
      ) : null}
      <Chip icon="square.and.arrow.up" label="Share" a11y="Share" onPress={share} />
      {me && me.id !== media.creator.id ? (
        <Chip icon="bubble.left" label="Message" a11y="Message" onPress={onMessage} />
      ) : null}
    </ScrollView>
  );
}

function Chip({
  icon,
  label,
  a11y,
  onPress,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  a11y: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, { backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.7 }]}>
      <SymbolView name={icon} size={16} tintColor={theme.text} />
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

/** YouTube's thread: newest first, one level of replies, a like and Reply under each. */
/** Where a thread lives. Videos and Sparks share the thread, not the endpoints. */
export type CommentPaths = { list: string; post: string; like: (commentId: number) => string };

export const videoCommentPaths = (mediaId: number): CommentPaths => ({
  list: `/api/v1/media/${mediaId}/comments`,
  post: `/api/v1/media/${mediaId}/comments`,
  like: (id) => `/api/v1/comments/${id}/toggle-like`,
});

export function Comments({
  mediaId,
  me,
  paths,
  onPosted,
}: {
  mediaId?: number;
  me: Me;
  paths?: CommentPaths;
  // A new top-level comment, so a count shown elsewhere can follow.
  onPosted?: () => void;
}) {
  const where = paths ?? videoCommentPaths(mediaId!);
  const theme = useTheme();
  const [comments, setComments] = useState<VideoComment[] | null>(null);
  const [total, setTotal] = useState(0);
  const [draft, setDraft] = useState('');
  // Replies stay one level deep: answering a reply goes to its thread's first
  // comment, with the person answered named at the start, as YouTube does.
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const startReply = (target: ReplyTarget) => {
    setReplyTo(target);
    if (target.mention) setDraft(`@${target.name} `);
  };
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<number[]>([]);
  const toggleReplies = (id: number) =>
    setOpen((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ comments: VideoComment[]; total: number }>(where.list)
      .then((result) => {
        if (cancelled) return;
        setComments(result.comments);
        setTotal(result.total);
      })
      .catch(() => !cancelled && setComments([]));

    return () => {
      cancelled = true;
    };
  }, [where.list]);

  async function post() {
    const content = draft.trim();
    if (!content) return;
    setPosting(true);
    setError('');
    try {
      const created = await api.post<VideoComment>(
        where.post,
        replyTo ? { content, parent_id: replyTo.rootId } : { content },
      );
      setComments((list) =>
        replyTo
          ? (list ?? []).map((c) =>
              c.id === replyTo.rootId
                ? { ...c, replies: [...(c.replies ?? []), created], replies_count: (c.replies_count ?? 0) + 1 }
                : c,
            )
          : [created, ...(list ?? [])],
      );
      // A new reply shows straight away, in its opened thread.
      if (replyTo) setOpen((ids) => (ids.includes(replyTo.rootId) ? ids : [...ids, replyTo.rootId]));
      else {
        setTotal((t) => t + 1);
        onPosted?.();
      }
      setDraft('');
      setReplyTo(null);
    } catch (e) {
      setError(failure(e));
    } finally {
      setPosting(false);
    }
  }

  return (
    <View style={styles.comments}>
      <View style={styles.commentsHead}>
        <ThemedText type="smallBold" style={styles.sectionTitle}>
          Comments
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {total}
        </ThemedText>
      </View>

      {me ? (
        <View style={styles.composer}>
          <Avatar uri={me.profile_photo_url} name={me.name} size={32} />
          <View style={styles.composerField}>
            {replyTo ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stop replying"
                onPress={() => setReplyTo(null)}
                style={styles.replying}>
                <ThemedText type="small" themeColor="textSecondary">
                  Replying to {replyTo.name}
                </ThemedText>
                <SymbolView name="xmark" size={10} tintColor={theme.textSecondary} />
              </Pressable>
            ) : null}
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={replyTo ? `Reply to ${replyTo.name}…` : 'Add a comment…'}
              placeholderTextColor={theme.textSecondary}
              maxLength={1000}
              multiline
              style={[styles.input, { color: theme.text, borderBottomColor: theme.backgroundElement }]}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Post comment"
            accessibilityState={{ disabled: posting || !draft.trim(), busy: posting }}
            disabled={posting || !draft.trim()}
            onPress={post}
            style={styles.send}>
            {posting ? (
              <ActivityIndicator />
            ) : (
              <SymbolView
                name="arrow.up.circle.fill"
                size={28}
                tintColor={draft.trim() ? theme.primary : theme.textSecondary}
              />
            )}
          </Pressable>
        </View>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}

      {comments === null ? (
        <ActivityIndicator />
      ) : comments.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          No comments yet. Be the first to say something.
        </ThemedText>
      ) : (
        comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            canAct={me !== null}
            onReply={startReply}
            showReplies={open.includes(comment.id)}
            onToggleReplies={() => toggleReplies(comment.id)}
            likePath={where.like(comment.id)}
          />
        ))
      )}
    </View>
  );
}

function CommentItem({
  comment,
  canAct,
  onReply,
  showReplies,
  onToggleReplies,
  likePath,
}: {
  comment: VideoComment;
  canAct: boolean;
  onReply: (target: ReplyTarget) => void;
  showReplies: boolean;
  onToggleReplies: () => void;
  likePath: string;
}) {
  const theme = useTheme();
  // Video threads say `liked_by_me`, Spark threads `is_liked`.
  const [liked, setLiked] = useState(Boolean(comment.liked_by_me || comment.is_liked));
  const [likes, setLikes] = useState(comment.likes_count ?? 0);
  const name = comment.user?.name ?? 'Someone';
  const replies = comment.replies ?? [];

  async function like() {
    try {
      const result = await api.post<{ action: string; likes_count: number }>(likePath);
      setLiked(result.action === 'liked');
      setLikes(result.likes_count);
    } catch {
      // Nothing changed on the server, so nothing changes here.
    }
  }

  return (
    <View style={styles.comment}>
      <Avatar uri={comment.user?.profile_photo_url} name={name} size={32} />
      <View style={styles.commentBody}>
        <ThemedText type="small" themeColor="textSecondary">
          {`${name} · ${timeAgo(comment.created_at)}`}
        </ThemedText>
        <ThemedText type="small">{comment.content}</ThemedText>
        {canAct ? (
          <View style={styles.commentActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${liked ? 'Unlike' : 'Like'} comment by ${name}, ${plural(likes, 'like', 'likes')}`}
              onPress={like}
              hitSlop={8}
              style={styles.commentLike}>
              <SymbolView
                name={liked ? 'hand.thumbsup.fill' : 'hand.thumbsup'}
                size={14}
                tintColor={theme.textSecondary}
              />
              {likes > 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {compactCount(likes)}
                </ThemedText>
              ) : null}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Reply to ${name}`}
              onPress={() => onReply({ rootId: comment.id, name, mention: false })}
              hitSlop={8}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Reply
              </ThemedText>
            </Pressable>
          </View>
        ) : null}
        {replies.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showReplies ? 'Hide replies' : plural(replies.length, 'reply', 'replies')}
            onPress={onToggleReplies}
            hitSlop={8}>
            <ThemedText type="smallBold" themeColor="primary">
              {showReplies ? 'Hide replies' : plural(replies.length, 'reply', 'replies')}
            </ThemedText>
          </Pressable>
        ) : null}
        {showReplies
          ? replies.map((reply) => (
              <View key={reply.id} style={styles.reply}>
                <Avatar uri={reply.user?.profile_photo_url} name={reply.user?.name ?? 'Someone'} size={24} />
                <View style={styles.commentBody}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {`${reply.user?.name ?? 'Someone'} · ${timeAgo(reply.created_at)}`}
                  </ThemedText>
                  <ThemedText type="small">{reply.content}</ThemedText>
                  {canAct ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Reply to ${reply.user?.name ?? 'Someone'}`}
                      onPress={() =>
                        onReply({ rootId: comment.id, name: reply.user?.name ?? 'Someone', mention: true })
                      }
                      hitSlop={8}>
                      <ThemedText type="smallBold" themeColor="textSecondary">
                        Reply
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))
          : null}
      </View>
    </View>
  );
}

/** YouTube's mobile Up next: full-width cards, the creator's photo beside the title. */
export function UpNext({ mediaId }: { mediaId: number }) {
  const [videos, setVideos] = useState<RelatedVideo[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<RelatedVideo[]>(`/api/v1/media/${mediaId}/related`)
      .then((result) => !cancelled && setVideos(Array.isArray(result) ? result : []))
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  if (videos.length === 0) return null;

  return (
    <View style={styles.upNext}>
      <ThemedText type="smallBold" style={styles.sectionTitle}>
        Up next
      </ThemedText>
      {videos.map((video) => (
        <UpNextCard key={video.id} video={video} />
      ))}
    </View>
  );
}

function UpNextCard({ video }: { video: RelatedVideo }) {
  const theme = useTheme();
  const locked = Boolean(video.requires_payment && !video.is_unlocked);
  const meta = [video.creator?.name, plural(video.views ?? 0, 'view', 'views'), shortDate(video.created_at)]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={video.title}
      onPress={() => router.push({ pathname: '/watch/[id]', params: { id: video.public_id ?? String(video.id) } })}
      style={({ pressed }) => [styles.upNextCard, pressed && { opacity: 0.8 }]}>
      <View style={[styles.upNextThumb, { backgroundColor: theme.backgroundElement }]}>
        {video.thumbnail_url ? (
          <Image source={video.thumbnail_url} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
        {video.requires_payment ? (
          <View style={[styles.badge, { backgroundColor: locked ? 'rgba(0,0,0,0.75)' : theme.primary }]}>
            <SymbolView name={locked ? 'lock.fill' : 'lock.open.fill'} size={11} tintColor="#fff" />
            <ThemedText type="smallBold" style={styles.onDark}>
              {locked ? (video.required_credits ? `${video.required_credits} credits` : 'Premium') : 'Unlocked'}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.upNextInfo}>
        <Avatar uri={video.creator?.profile_photo_url} name={video.creator?.name ?? ''} size={36} />
        <View style={styles.commentBody}>
          <ThemedText type="smallBold" numberOfLines={2}>
            {video.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {meta}
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  details: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.three },
  title: { fontSize: 19, lineHeight: 25, fontWeight: '700' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: -Spacing.two },
  premiumTag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  onDark: { color: '#fff' },
  channel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  channelWho: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  channelText: { flex: 1 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    height: 36,
  },
  actions: { gap: Spacing.two },
  descriptionBox: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one },
  sectionTitle: { fontSize: 17, lineHeight: 22 },
  comments: { paddingHorizontal: Spacing.three, paddingTop: Spacing.four, gap: Spacing.three },
  commentsHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  composer: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  composerField: { flex: 1 },
  replying: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { borderBottomWidth: 1, paddingVertical: 6, fontSize: 15, maxHeight: 120 },
  send: { paddingTop: 2 },
  center: { textAlign: 'center', paddingVertical: Spacing.three },
  comment: { flexDirection: 'row', gap: Spacing.three },
  commentBody: { flex: 1, gap: 2 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four, marginTop: Spacing.one },
  commentLike: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reply: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  upNext: { paddingHorizontal: Spacing.three, paddingTop: Spacing.four, gap: Spacing.four },
  upNextCard: { gap: Spacing.two },
  upNextThumb: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden' },
  upNextInfo: { flexDirection: 'row', gap: Spacing.three },
  badge: {
    position: 'absolute',
    left: Spacing.two,
    bottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: 6,
  },
});
