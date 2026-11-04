import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CircleCard } from '@/components/circles';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { api } from '@/lib/session';
import { shortDate } from '@/lib/time';
import type { CircleSummary, CreatorProfileData } from '@/lib/types';

type Loaded = { profile: CreatorProfileData } | { error: string };
type Video = CreatorProfileData['videos'][number];
type SeriesCard = CreatorProfileData['series'][number];
type VideoTab = 'free' | 'premium';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

async function load(id: string): Promise<Loaded> {
  try {
    return {
      profile: (await api.get<{ data: CreatorProfileData }>(`/api/v1/creators/${encodeURIComponent(id)}`)).data,
    };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Something went wrong. Please try again.' };
  }
}

/**
 * Follows the web profile (Pages/Creator/Profile.vue): the creator up top, then
 * section tabs, with Videos split into Free, Premium and Series. Sparks,
 * Streams, Circles and Shop join the row as the app gains their screens.
 */
export default function CreatorProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [messageError, setMessageError] = useState('');
  const [videoTab, setVideoTab] = useState<VideoTab>('free');
  const [mainTab, setMainTab] = useState<'videos' | 'series' | 'circles'>('videos');

  useEffect(() => {
    let cancelled = false;
    load(id).then((result) => !cancelled && setLoaded(result));

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function message(creatorId: number) {
    setMessageError('');
    try {
      const started = await api.post<{ data: { id: number } }>(`/api/v1/conversations/start/${creatorId}`);
      router.push({ pathname: '/conversation/[id]', params: { id: String(started.data.id) } });
    } catch (e) {
      setMessageError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    }
  }

  const profile = loaded && 'profile' in loaded ? loaded.profile : null;

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: true, title: profile?.name ?? '', headerBackTitle: 'Back' }} />
      {!loaded ? (
        <ActivityIndicator style={styles.fill} />
      ) : 'error' in loaded ? (
        <View style={styles.padded}>
          <ErrorText>{loaded.error}</ErrorText>
        </View>
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
          {loaded.profile.cover_image_url ? (
            <Image source={loaded.profile.cover_image_url} style={styles.cover} contentFit="cover" />
          ) : null}
          <View style={styles.padded}>
            <View style={styles.identity}>
              <Avatar uri={loaded.profile.profile_photo_url} name={loaded.profile.name} size={64} />
              <View style={styles.identityText}>
                <ThemedText type="subtitle">{loaded.profile.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {`${plural(loaded.profile.subscriber_count, 'subscriber', 'subscribers')} · ${plural(loaded.profile.video_count, 'video', 'videos')}`}
                </ThemedText>
              </View>
            </View>
            {loaded.profile.badges.length > 0 ? (
              <View style={styles.badges}>
                {loaded.profile.badges.map((badge) => (
                  <View key={badge.slug} style={[styles.badge, { backgroundColor: theme.backgroundElement }]}>
                    <ThemedText type="smallBold">{badge.name}</ThemedText>
                  </View>
                ))}
              </View>
            ) : null}
            {loaded.profile.bio ? <ThemedText>{loaded.profile.bio}</ThemedText> : null}
            {!loaded.profile.is_me ? (
              <Button label="Message" variant="secondary" onPress={() => message(loaded.profile.id)} />
            ) : null}
            {messageError ? <ErrorText>{messageError}</ErrorText> : null}
          </View>

          <TabRow>
            <Tab label="Videos" selected={mainTab === 'videos'} onPress={() => setMainTab('videos')} />
            <Tab label="Series" selected={mainTab === 'series'} onPress={() => setMainTab('series')} />
            <Tab label="Circles" selected={mainTab === 'circles'} onPress={() => setMainTab('circles')} />
            {loaded.profile.can_offer_consultations ? (
              // A link on the web too: the menu and booking live on their own screen.
              <Tab
                label="Consultations"
                selected={false}
                onPress={() =>
                  router.push({
                    pathname: '/consultations/[creator]',
                    params: { creator: loaded.profile.public_id ?? String(loaded.profile.id) },
                  })
                }
              />
            ) : null}
          </TabRow>

          {mainTab === 'videos' ? (
            <VideosSection profile={loaded.profile} tab={videoTab} onTab={setVideoTab} />
          ) : mainTab === 'series' ? (
            <View style={styles.section}>
              {loaded.profile.series.length ? (
                loaded.profile.series.map((series) => (
                  <SeriesStack key={series.id} series={series} profile={loaded.profile} />
                ))
              ) : (
                <Empty text="This creator hasn’t published any series yet." />
              )}
            </View>
          ) : (
            <CirclesSection creatorId={loaded.profile.id} />
          )}
        </ScrollView>
      )}
    </View>
  );
}

function VideosSection({
  profile,
  tab,
  onTab,
}: {
  profile: CreatorProfileData;
  tab: VideoTab;
  onTab: (tab: VideoTab) => void;
}) {
  const free = profile.videos.filter((video) => !video.requires_payment);
  const premium = profile.videos.filter((video) => video.requires_payment);

  return (
    <>
      <TabRow>
        <Tab label={`Free (${free.length})`} selected={tab === 'free'} onPress={() => onTab('free')} />
        <Tab label={`Premium (${premium.length})`} selected={tab === 'premium'} onPress={() => onTab('premium')} />
      </TabRow>

      <View style={styles.section}>
        {tab === 'free' ? (
          free.length ? (
            free.map((video) => <VideoCard key={video.id} video={video} isMe={profile.is_me} />)
          ) : (
            <Empty text="This creator hasn’t posted any free videos yet." />
          )
        ) : premium.length ? (
          premium.map((video) => <VideoCard key={video.id} video={video} isMe={profile.is_me} />)
        ) : (
          <Empty text="This creator hasn’t posted any premium videos yet." />
        )}
      </View>
    </>
  );
}

/** The creator's circles, fetched when the tab is first opened, as the web loads them. */
function CirclesSection({ creatorId }: { creatorId: number }) {
  const [circles, setCircles] = useState<CircleSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: CircleSummary[] }>(`/api/v1/circles?user_id=${creatorId}`)
      .then((result) => !cancelled && setCircles(result.data))
      .catch(() => !cancelled && setCircles([]));

    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  return (
    <View style={styles.section}>
      {circles === null ? (
        <ActivityIndicator />
      ) : circles.length ? (
        circles.map((circle) => <CircleCard key={circle.id} circle={circle} />)
      ) : (
        <Empty text="This creator hasn’t created any Circles yet." />
      )}
    </View>
  );
}

function TabRow({ children }: { children: React.ReactNode }) {
  const theme = useTheme();

  return (
    <View style={[styles.tabRow, { borderBottomColor: theme.backgroundElement }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {children}
      </ScrollView>
    </View>
  );
}

function Tab({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.tab, { borderBottomColor: selected ? theme.primary : 'transparent' }]}>
      <ThemedText type="smallBold" themeColor={selected ? 'primary' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function VideoCard({ video, isMe }: { video: Video; isMe: boolean }) {
  const theme = useTheme();
  const bought = video.requires_payment && video.is_unlocked;
  // The creator plays their own work, so the lock would only be in their way.
  const locked = video.requires_payment && !video.is_unlocked && !isMe;
  const price = video.required_credits ? `${video.required_credits} credits` : null;
  const date = shortDate(video.created_at);
  const label = locked && price ? `${video.title}, premium, ${price} to unlock` : video.title;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push({ pathname: '/watch/[id]', params: { id: video.public_id ?? String(video.id) } })}
      style={({ pressed }) => [styles.card, { borderColor: theme.backgroundElement }, pressed && { opacity: 0.8 }]}>
      <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
        {video.thumbnail_url ? (
          <Image source={video.thumbnail_url} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
        {locked ? (
          <View style={[StyleSheet.absoluteFill, styles.lockShade]}>
            <SymbolView name="lock.fill" size={26} tintColor="#fff" />
            <ThemedText type="smallBold" style={styles.onDark}>
              Premium Content
            </ThemedText>
          </View>
        ) : null}
        {video.requires_payment ? (
          <View style={[styles.premiumBadge, { backgroundColor: bought ? theme.primary : 'rgba(0,0,0,0.75)' }]}>
            <SymbolView name={bought ? 'lock.open.fill' : 'lock.fill'} size={11} tintColor="#fff" />
            <ThemedText type="smallBold" style={styles.onDark}>
              {bought ? 'Unlocked' : (price ?? 'Premium')}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {video.title}
        </ThemedText>
        <View style={styles.stats}>
          <Stat icon="eye" text={plural(video.views, 'view', 'views')} />
          {date ? <Stat icon="clock" text={date} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

function Stat({ icon, text }: { icon: 'eye' | 'clock'; text: string }) {
  const theme = useTheme();

  return (
    <View style={styles.stat}>
      <SymbolView name={icon} size={13} tintColor={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary">
        {text}
      </ThemedText>
    </View>
  );
}

/** The web's series card: two sheets peeking above the poster, and the count down its right edge. */
function SeriesStack({ series, profile }: { series: SeriesCard; profile: CreatorProfileData }) {
  const theme = useTheme();
  const meta = [plural(series.media_count, 'video', 'videos'), ...(series.is_premium ? ['Premium series'] : [])].join(
    ' · ',
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={series.title}
      onPress={() => router.push({ pathname: '/series/[id]', params: { id: String(series.id) } })}
      style={({ pressed }) => [styles.seriesCard, pressed && { opacity: 0.8 }]}>
      <View style={styles.stack}>
        <View style={[styles.sheetBack, { backgroundColor: theme.textSecondary, opacity: 0.35 }]} />
        <View style={[styles.sheetMid, { backgroundColor: theme.textSecondary, opacity: 0.2 }]} />
        <View style={[styles.thumb, styles.seriesThumb, { backgroundColor: theme.backgroundElement }]}>
          {series.thumbnail_url ? (
            <Image source={series.thumbnail_url} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              No cover
            </ThemedText>
          )}
          <View style={styles.countPanel}>
            <SymbolView name="list.bullet.rectangle" size={20} tintColor="#fff" />
            <ThemedText type="smallBold" style={styles.onDark}>
              {series.media_count}
            </ThemedText>
          </View>
          {series.is_premium && series.bundle_price_credits ? (
            <View style={styles.priceBadge}>
              <ThemedText type="small" style={styles.onDark}>{`${series.bundle_price_credits} credits`}</ThemedText>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.seriesInfo}>
        <Avatar uri={profile.profile_photo_url} name={profile.name} size={36} />
        <View style={styles.seriesText}>
          <ThemedText type="smallBold" numberOfLines={2}>
            {series.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {meta}
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
      {text}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: Spacing.five, gap: Spacing.three },
  padded: { padding: Spacing.three, gap: Spacing.three },
  cover: { width: '100%', aspectRatio: 3 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  identityText: { flex: 1, gap: Spacing.half },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  badge: { borderRadius: 12, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  tabRow: { borderBottomWidth: StyleSheet.hairlineWidth, marginHorizontal: Spacing.three },
  tabs: { gap: Spacing.four },
  tab: { paddingVertical: Spacing.two, borderBottomWidth: 2 },
  section: { paddingHorizontal: Spacing.three, gap: Spacing.four },
  card: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  thumb: { width: '100%', aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  lockShade: { backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', gap: Spacing.one },
  onDark: { color: '#fff' },
  premiumBadge: {
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
  cardBody: { padding: Spacing.three, gap: Spacing.one },
  stats: { flexDirection: 'row', gap: Spacing.three },
  stat: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  seriesCard: { gap: Spacing.two },
  stack: { paddingTop: Spacing.two },
  sheetBack: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: 12,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  sheetMid: {
    position: 'absolute',
    top: 4,
    left: 8,
    right: 8,
    height: 12,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  seriesThumb: { borderRadius: 10 },
  countPanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 80,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  priceBadge: {
    position: 'absolute',
    left: Spacing.two,
    bottom: Spacing.two,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  seriesInfo: { flexDirection: 'row', gap: Spacing.three },
  seriesText: { flex: 1, gap: Spacing.half },
  empty: { textAlign: 'center', paddingVertical: Spacing.four },
});
