import { router, useFocusEffect } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, ErrorText } from '@/components/ui';
import { Comments } from '@/components/watch';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { streamUrl } from '@/lib/playback';
import { api, useSession } from '@/lib/session';
import { compactCount } from '@/lib/time';
import type { Spark, SparksPage } from '@/lib/types';

const VIEWABILITY = { itemVisiblePercentThreshold: 80 };
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const withStream = (sparks: Spark[]) => sparks.filter((spark) => spark.mux_playback_id);
const fetchSparks = (cursor?: string | null) =>
  api.get<SparksPage>(cursor ? `/api/v1/sparks?cursor=${encodeURIComponent(cursor)}` : '/api/v1/sparks');

type Me = { id: number; name: string; profile_photo_url?: string | null } | null;

export default function Sparks() {
  const window = useWindowDimensions();
  const { launch } = useSession();
  const signedIn = launch?.route === 'home' ? launch : null;
  const me: Me = signedIn
    ? {
        id: signedIn.me.id,
        name: signedIn.me.name,
        profile_photo_url: (signedIn.me.profile_photo_url as string | null | undefined) ?? null,
      }
    : null;
  const [height, setHeight] = useState(window.height);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSparks()
      .then((page) => {
        if (cancelled) return;
        setSparks(withStream(page.data));
        setCursor(page.next_cursor);
      })
      .catch(
        (e) => !cancelled && setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'),
      )
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, []);

  // Leaving the tab pauses whatever was playing.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // FlatList refuses a new callback or config after mount, so both stay stable.
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setActiveIndex(first.index);
  }, []);

  async function loadMore() {
    if (!cursor) return;
    const page = await fetchSparks(cursor).catch(() => null);
    if (!page) return;
    setSparks((current) => [...current, ...withStream(page.data)]);
    setCursor(page.next_cursor);
  }

  if (loading || error || sparks.length === 0) {
    return (
      <View style={[styles.fill, styles.centered]}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : error ? (
          <ErrorText>{error}</ErrorText>
        ) : (
          <ThemedText style={styles.light}>No Sparks yet. Short videos from creators will show up here.</ThemedText>
        )}
      </View>
    );
  }

  return (
    <View style={styles.fill} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <FlatList
        data={sparks}
        keyExtractor={(spark) => String(spark.id)}
        renderItem={({ item, index }) => (
          <SparkItem spark={item} height={height} active={focused && index === activeIndex} me={me} />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY}
        onEndReached={loadMore}
        onEndReachedThreshold={1}
      />
    </View>
  );
}

/**
 * One Spark, laid out like Shorts: the action rail down the right edge, the
 * creator, caption and views along the bottom. Counts come from the server on
 * every press, so the rail never drifts from what everyone else sees.
 */
function SparkItem({ spark, height, active, me }: { spark: Spark; height: number; active: boolean; me: Me }) {
  const player = useVideoPlayer(streamUrl(spark.mux_playback_id!), (p) => {
    p.loop = true;
  });
  const [liked, setLiked] = useState(Boolean(spark.is_liked));
  const [disliked, setDisliked] = useState(Boolean(spark.is_disliked));
  const [likes, setLikes] = useState(spark.like_count ?? 0);
  const [saved, setSaved] = useState(Boolean(spark.is_saved));
  const [saves, setSaves] = useState(spark.save_count ?? 0);
  const [shares, setShares] = useState(spark.share_count ?? 0);
  const [comments, setComments] = useState(spark.comment_count ?? 0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const viewed = useRef(false);

  // A tap pauses, a second plays again. Swiping away and back starts it fresh,
  // so a pause belongs to this visit only (React's "adjust state on a prop
  // change" pattern, rather than an effect that would render twice).
  const [paused, setPaused] = useState(false);
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    setPaused(false);
  }

  useEffect(() => {
    if (active && !paused) player.play();
    else player.pause();
  }, [active, paused, player]);

  // One view per viewer per Spark, counted the first time it plays.
  useEffect(() => {
    if (!active || viewed.current || !me) return;
    viewed.current = true;
    api.post(`/api/v1/sparks/${spark.id}/view`, { watch_time_seconds: 0 })?.catch?.(() => {});
  }, [active, me, spark.id]);

  type Reaction = { is_liked: boolean; is_disliked: boolean; likes_count: number };

  async function react(kind: 'like' | 'dislike') {
    try {
      const result = await api.post<Reaction>(`/api/v1/sparks/${spark.id}/toggle-${kind}`);
      setLiked(result.is_liked);
      setDisliked(result.is_disliked);
      setLikes(result.likes_count);
    } catch {
      // Nothing changed on the server, so nothing changes here.
    }
  }

  async function save() {
    try {
      const result = await api.post<{ is_saved: boolean; save_count: number }>(
        `/api/v1/sparks/${spark.id}/toggle-save`,
      );
      setSaved(result.is_saved);
      setSaves(result.save_count);
    } catch {
      // Nothing changed on the server, so nothing changes here.
    }
  }

  async function share() {
    try {
      const result = await api.post<{ share_url: string; share_count: number }>(`/api/v1/sparks/${spark.id}/share`);
      setShares(result.share_count);
      await Share.share({ message: [spark.caption, result.share_url].filter(Boolean).join(' ') });
    } catch {
      // A closed share sheet or a refused link leaves the rail as it was.
    }
  }

  return (
    <View testID={`spark-${spark.id}`} style={{ height }}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        // iOS offers Live Text on a paused frame; on a Spark it is only in the way.
        allowsVideoFrameAnalysis={false}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={paused ? 'Play' : 'Pause'}
        onPress={() => setPaused((p) => !p)}
        style={StyleSheet.absoluteFill}
      />

      {me ? (
        <View style={styles.rail}>
          <RailButton
            icon={liked ? 'hand.thumbsup.fill' : 'hand.thumbsup'}
            label={compactCount(likes)}
            a11y={`${liked ? 'Unlike' : 'Like'}, ${plural(likes, 'like', 'likes')}`}
            onPress={() => react('like')}
          />
          <RailButton
            icon={disliked ? 'hand.thumbsdown.fill' : 'hand.thumbsdown'}
            a11y={disliked ? 'Undo dislike' : 'Dislike'}
            onPress={() => react('dislike')}
          />
          <RailButton
            icon="text.bubble.fill"
            label={compactCount(comments)}
            a11y={`Comments, ${plural(comments, 'comment', 'comments')}`}
            onPress={() => setCommentsOpen(true)}
          />
          <RailButton
            icon={saved ? 'bookmark.fill' : 'bookmark'}
            label={compactCount(saves)}
            a11y={`${saved ? 'Saved' : 'Save'}, ${plural(saves, 'save', 'saves')}`}
            onPress={save}
          />
          <RailButton
            icon="arrowshape.turn.up.right.fill"
            label={compactCount(shares)}
            a11y={`Share, ${plural(shares, 'share', 'shares')}`}
            onPress={share}
          />
        </View>
      ) : null}

      <View style={styles.caption}>
        {spark.creator ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={spark.creator.name}
            onPress={() => router.push({ pathname: '/creator/[id]', params: { id: String(spark.creator!.id) } })}
            style={styles.creator}>
            <Avatar uri={spark.creator.profile_photo_url} name={spark.creator.name} size={32} />
            <ThemedText type="smallBold" style={styles.light}>
              {spark.creator.name}
            </ThemedText>
          </Pressable>
        ) : null}
        {spark.caption ? <Caption text={spark.caption} maxHeight={height / 2} /> : null}
        <ThemedText type="small" style={styles.dim}>
          {`${compactCount(spark.view_count ?? 0)} ${spark.view_count === 1 ? 'view' : 'views'}`}
        </ThemedText>
      </View>

      {/* Drawn last so an opened caption cannot hide it; taps pass through to resume. */}
      {paused ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.centeredIcon]}>
          <View testID="paused-icon" style={styles.pausedIcon}>
            <SymbolView name="play.fill" size={44} tintColor="#fff" />
          </View>
        </View>
      ) : null}

      {me ? (
        <CommentsSheet
          sparkId={spark.id}
          me={me}
          open={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          onPosted={() => setComments((n) => n + 1)}
        />
      ) : null}
    </View>
  );
}

// Past two lines or so, a caption folds to two with "more", as on Shorts, so it
// never climbs up over the video.
const LONG_CAPTION = 90;

function Caption({ text, maxHeight }: { text: string; maxHeight: number }) {
  const [open, setOpen] = useState(false);
  const long = text.length > LONG_CAPTION;

  if (long && open) {
    // Opened out, the caption never climbs past half the screen; the rest scrolls.
    return (
      <View style={styles.captionOpen}>
        <ScrollView testID="caption-scroll" style={{ maxHeight }} nestedScrollEnabled showsVerticalScrollIndicator>
          <ThemedText style={[styles.light, styles.shadow]}>{text}</ThemedText>
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show less of the caption"
          onPress={() => setOpen(false)}
          hitSlop={8}>
          <ThemedText type="smallBold" style={[styles.light, styles.shadow]}>
            less
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      disabled={!long}
      accessibilityRole={long ? 'button' : undefined}
      accessibilityLabel={long ? 'Show the full caption' : undefined}
      onPress={() => setOpen(true)}>
      <ThemedText style={[styles.light, styles.shadow]} numberOfLines={long ? 2 : undefined}>
        {text}
      </ThemedText>
      {long ? (
        <ThemedText type="smallBold" style={[styles.light, styles.shadow]}>
          more
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

function RailButton({
  icon,
  label,
  a11y,
  onPress,
}: {
  icon: SymbolViewProps['name'];
  label?: string;
  a11y: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      hitSlop={6}
      style={styles.railButton}>
      <SymbolView name={icon} size={30} tintColor="#fff" />
      {label ? (
        <ThemedText type="smallBold" style={[styles.light, styles.shadow]}>
          {label}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

/** The thread slides up over the Spark, as on Shorts, so the video keeps its place. */
function CommentsSheet({
  sparkId,
  me,
  open,
  onClose,
  onPosted,
}: {
  sparkId: number;
  me: Me;
  open: boolean;
  onClose: () => void;
  onPosted: () => void;
}) {
  const theme = useTheme();

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close comments" style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <View style={styles.sheetHead}>
          <View style={[styles.grabber, { backgroundColor: theme.backgroundElement }]} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={10}
            style={styles.close}>
            <SymbolView name="xmark" size={16} tintColor={theme.text} />
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
          {open ? (
            <Comments
              me={me}
              onPosted={onPosted}
              paths={{
                list: `/api/v1/sparks/${sparkId}/comments`,
                post: `/api/v1/sparks/${sparkId}/comments`,
                like: (id) => `/api/v1/spark-comments/${id}/toggle-like`,
              }}
            />
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  centered: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  caption: {
    position: 'absolute',
    left: Spacing.three,
    right: 80,
    bottom: Spacing.four,
    gap: Spacing.one,
  },
  creator: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  light: { color: '#fff' },
  centeredIcon: { alignItems: 'center', justifyContent: 'center' },
  pausedIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionOpen: {
    gap: Spacing.one,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 10,
    padding: Spacing.two,
    marginLeft: -Spacing.two,
  },
  dim: { color: 'rgba(255,255,255,0.8)' },
  shadow: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  rail: { position: 'absolute', right: Spacing.two, bottom: Spacing.five, alignItems: 'center', gap: Spacing.four },
  // A soft shadow keeps white icons readable over a bright frame.
  railButton: {
    alignItems: 'center',
    gap: 2,
    minWidth: 56,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { height: '70%', borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
  sheetHead: { alignItems: 'center', paddingTop: Spacing.two },
  grabber: { width: 36, height: 5, borderRadius: 3 },
  close: { position: 'absolute', right: Spacing.three, top: Spacing.two },
  sheetBody: { paddingBottom: Spacing.five },
});
