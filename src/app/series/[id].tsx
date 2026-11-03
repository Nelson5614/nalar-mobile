import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { PLATFORM } from '@/lib/config';
import { canPlay, episodeRoute } from '@/lib/series';
import { api, useSession } from '@/lib/session';
import type { SeriesDetail, SeriesEpisode } from '@/lib/types';

type Loaded = { series: SeriesDetail } | { error: string };

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

async function load(id: string): Promise<Loaded> {
  try {
    return { series: (await api.get<{ data: SeriesDetail }>(`/api/v1/series/${encodeURIComponent(id)}`)).data };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Something went wrong. Please try again.' };
  }
}

/**
 * Laid out like a YouTube playlist: a dark header over a blurred poster with
 * the title, maker, count and one main action, then the videos as rows.
 */
export default function SeriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { reload } = useSession();
  const theme = useTheme();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    load(id).then((result) => !cancelled && setLoaded(result));

    return () => {
      cancelled = true;
    };
  }, [id]);

  // The new balance shows in Me, and every video now loads as playable.
  const afterUnlock = useCallback(async () => {
    await reload();
    setLoaded(await load(id));
  }, [id, reload]);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: '', headerBackTitle: 'Back' }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}>
        {!loaded ? (
          <ActivityIndicator style={styles.spinner} />
        ) : 'error' in loaded ? (
          <View style={styles.padded}>
            <ErrorText>{loaded.error}</ErrorText>
          </View>
        ) : (
          <>
            <Header series={loaded.series} onUnlocked={afterUnlock} />
            <View style={styles.list}>
              {loaded.series.media.map((episode) => (
                <EpisodeRow key={episode.id} series={loaded.series} episode={episode} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

function Header({ series, onUnlocked }: { series: SeriesDetail; onUnlocked: () => Promise<void> }) {
  const { launch } = useSession();
  const signedIn = launch?.route === 'home' ? launch : null;
  const balance = signedIn?.me.credit_balance ?? 0;
  const topUpUrl = signedIn?.config.top_up?.link_enabled?.[PLATFORM] ? signedIn.config.top_up.url : undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const poster = series.cover_url ?? series.media.find((episode) => episode.thumbnail_url)?.thumbnail_url ?? null;
  const first = series.media.find((episode) => canPlay(series, episode));
  const owned = series.is_premium && series.is_unlocked;
  const needsUnlock = !series.viewer_is_creator && series.is_premium && !series.is_unlocked && series.can_be_unlocked;
  const price = series.bundle_price_credits ?? 0;
  const shortBy = price - balance;
  const meta = [
    series.is_premium ? 'Premium series' : 'Series',
    plural(series.media.length, 'video', 'videos'),
    ...(owned ? ['Owned'] : []),
  ].join(' · ');

  async function unlock() {
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/v1/series/${series.id}/unlock`);
      await onUnlocked();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    Alert.alert('Unlock this series?', `This uses ${price} of your ${balance} credits.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlock', onPress: unlock },
    ]);
  }

  return (
    <View style={styles.header}>
      {poster ? <Image source={poster} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} /> : null}
      <View style={[StyleSheet.absoluteFill, styles.shade]} />

      <View style={styles.poster}>
        {poster ? (
          <Image source={poster} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <SymbolView name="play.rectangle.on.rectangle" size={40} tintColor="rgba(255,255,255,0.7)" />
        )}
      </View>

      <Text style={styles.title}>{series.title}</Text>
      {series.creator ? (
        <View style={styles.byline}>
          <Avatar uri={series.creator.profile_photo_url} name={series.creator.name} size={24} />
          <Text
            style={styles.creator}
            accessibilityRole="link"
            onPress={() =>
              router.push({
                pathname: '/creator/[id]',
                params: { id: series.creator!.public_id ?? String(series.creator!.id) },
              })
            }>
            {series.creator.name}
          </Text>
        </View>
      ) : null}
      <Text style={styles.meta}>{meta}</Text>
      {series.description ? (
        <Text style={styles.meta} numberOfLines={3}>
          {series.description}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {needsUnlock ? (
          shortBy > 0 ? (
            topUpUrl ? (
              <Pill label="Buy credits" icon="creditcard.fill" onPress={() => WebBrowser.openBrowserAsync(topUpUrl)} />
            ) : null
          ) : (
            <Pill label={`Unlock for ${price} credits`} icon="lock.open.fill" busy={busy} onPress={confirm} />
          )
        ) : first ? (
          <Pill label="Play all" icon="play.fill" onPress={() => router.push(episodeRoute(first, series.id))} />
        ) : null}
      </View>
      {needsUnlock && shortBy > 0 ? (
        <Text style={styles.meta}>{`Unlock every video for ${price} credits. You need ${shortBy} more.`}</Text>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

function Pill({
  label,
  icon,
  onPress,
  busy = false,
}: {
  label: string;
  icon: SymbolViewProps['name'];
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, pressed && { opacity: 0.8 }]}>
      {busy ? <ActivityIndicator color="#0f0f0f" /> : <SymbolView name={icon} size={16} tintColor="#0f0f0f" />}
      <Text style={styles.pillLabel}>{label}</Text>
    </Pressable>
  );
}

function EpisodeRow({ series, episode }: { series: SeriesDetail; episode: SeriesEpisode }) {
  const theme = useTheme();
  const locked = !canPlay(series, episode);
  const status = episode.playback_pending ? 'Preparing' : locked ? 'Locked' : null;
  const byline = [series.creator?.name, plural(episode.views ?? 0, 'view', 'views')].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${episode.title}`}
      onPress={() => router.push(episodeRoute(episode, series.id))}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
        {episode.thumbnail_url ? (
          <Image source={episode.thumbnail_url} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
        {locked ? (
          <View style={[StyleSheet.absoluteFill, styles.lockShade]}>
            <SymbolView name="lock.fill" size={20} tintColor="#fff" />
          </View>
        ) : null}
      </View>
      <View style={styles.rowText}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {episode.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {byline}
        </ThemedText>
        {status ? (
          <ThemedText type="small" themeColor={locked ? 'primary' : 'textSecondary'}>
            {status}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: Spacing.five },
  spinner: { marginTop: Spacing.five },
  padded: { padding: Spacing.three },
  header: {
    padding: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
    backgroundColor: '#1f1f1f',
    overflow: 'hidden',
  },
  shade: { backgroundColor: 'rgba(0,0,0,0.55)' },
  poster: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  title: { color: '#fff', fontSize: 26, lineHeight: 32, fontWeight: '700' },
  byline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  creator: { color: '#fff', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  meta: { color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  pill: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  pillLabel: { color: '#0f0f0f', fontSize: 15, fontWeight: '700' },
  list: { padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.three },
  thumb: { width: 160, aspectRatio: 16 / 9, borderRadius: 8, overflow: 'hidden' },
  lockShade: { backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: Spacing.half },
});
