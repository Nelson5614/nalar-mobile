import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import ProtectedVideo from '@/components/protected-video';
import { Comments, UpNext, VideoDetails } from '@/components/watch';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { PLATFORM } from '@/lib/config';
import { resolvePlayback, type Playback } from '@/lib/playback';
import { canPlay, episodeRoute } from '@/lib/series';
import { api, useSession } from '@/lib/session';
import type { MediaDetail, SeriesDetail } from '@/lib/types';

type Loaded = { media: MediaDetail; playback: Playback } | { error: string };

async function load(id: string): Promise<Loaded> {
  try {
    const media = await api.get<MediaDetail>(`/api/v1/media/${id}`);

    return { media, playback: await resolvePlayback(api, media) };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Something went wrong. Please try again.' };
  }
}

export default function Watch() {
  const { id, series } = useLocalSearchParams<{ id: string; series?: string }>();
  const { launch, reload } = useSession();
  const theme = useTheme();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [playlist, setPlaylist] = useState<SeriesDetail | null>(null);
  const signedIn = launch?.route === 'home' ? launch : null;
  const tag = signedIn?.me.watermark_tag;
  const watermark = typeof tag === 'string' && tag ? tag : undefined;
  const wallet: Wallet = {
    balance: signedIn?.me.credit_balance ?? 0,
    topUpUrl: signedIn?.config.top_up?.link_enabled?.[PLATFORM] ? signedIn.config.top_up.url : undefined,
  };

  const [messageError, setMessageError] = useState('');

  async function messageCreator(creatorId: number) {
    setMessageError('');
    try {
      const started = await api.post<{ data: { id: number } }>(`/api/v1/conversations/start/${creatorId}`);
      router.push({ pathname: '/conversation/[id]', params: { id: String(started.data.id) } });
    } catch (e) {
      setMessageError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    }
  }

  // The new balance shows in Me, and the video now loads as unlocked.
  async function afterUnlock() {
    await reload();
    setLoaded(await load(id));
  }

  useEffect(() => {
    let cancelled = false;
    load(id).then((result) => !cancelled && setLoaded(result));

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Opened from a series: the list sits under the player and plays on. If it
  // fails to load, the video still plays on its own.
  useEffect(() => {
    if (!series) return;
    let cancelled = false;
    api
      .get<{ data: SeriesDetail }>(`/api/v1/series/${encodeURIComponent(series)}`)
      .then((result) => !cancelled && setPlaylist(result.data))
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [series]);

  const me = signedIn
    ? {
        id: signedIn.me.id,
        name: signedIn.me.name,
        profile_photo_url: (signedIn.me.profile_photo_url as string | null | undefined) ?? null,
      }
    : null;

  // Counted once a video actually opens to play, as the web player does.
  const playable = loaded && 'media' in loaded && loaded.playback.kind === 'play' ? loaded.media.id : null;
  useEffect(() => {
    if (playable === null) return;
    api.post(`/api/v1/media/${playable}/track-view`)?.catch?.(() => {});
  }, [playable]);

  const current =
    playlist && loaded && 'media' in loaded ? playlist.media.findIndex((e) => e.id === loaded.media.id) : -1;
  const next =
    playlist && current >= 0 ? playlist.media.slice(current + 1).find((e) => canPlay(playlist, e)) : undefined;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: '', headerBackTitle: 'Back' }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}>
        {!loaded ? (
          <ActivityIndicator />
        ) : 'error' in loaded ? (
          <View style={styles.padded}>
            <ErrorText>{loaded.error}</ErrorText>
          </View>
        ) : (
          <>
            <Player
              playback={loaded.playback}
              watermark={watermark}
              mediaId={loaded.media.id}
              seriesPaywall={loaded.media.series_paywall ?? null}
              wallet={wallet}
              onUnlocked={afterUnlock}
              onEnd={next && playlist ? () => router.replace(episodeRoute(next, playlist.id)) : undefined}
            />
            <VideoDetails media={loaded.media} me={me} onMessage={() => messageCreator(loaded.media.creator.id)} />
            {messageError ? (
              <View style={styles.padded}>
                <ErrorText>{messageError}</ErrorText>
              </View>
            ) : null}
            {playlist && current >= 0 ? (
              <View style={styles.playlistGap}>
                <PlaylistPanel series={playlist} current={current} />
              </View>
            ) : null}
            <Comments mediaId={loaded.media.id} me={me} />
            <UpNext mediaId={loaded.media.id} />
          </>
        )}
      </ScrollView>
    </>
  );
}

type Wallet = { balance: number; topUpUrl?: string };

/** The series under the player, as YouTube shows a playlist: where you are, and what comes next. */
function PlaylistPanel({ series, current }: { series: SeriesDetail; current: number }) {
  const theme = useTheme();

  return (
    <View style={[styles.playlist, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.playlistHead}>
        <ThemedText type="smallBold" accessibilityRole="header" numberOfLines={1}>
          {series.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {[series.creator?.name, `${current + 1} / ${series.media.length}`].filter(Boolean).join(' · ')}
        </ThemedText>
      </View>
      {series.media.map((episode, index) => {
        const playing = index === current;
        const locked = !canPlay(series, episode);

        return (
          <Pressable
            key={episode.id}
            accessibilityRole="button"
            accessibilityLabel={`${playing ? 'Now playing' : 'Play'} ${episode.title}`}
            disabled={playing}
            onPress={() => router.replace(episodeRoute(episode, series.id))}
            style={({ pressed }) => [
              styles.playlistRow,
              playing && { backgroundColor: theme.background },
              pressed && { opacity: 0.7 },
            ]}>
            <View style={styles.playlistIndex}>
              {playing ? (
                <SymbolView name="play.fill" size={12} tintColor={theme.text} />
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  {index + 1}
                </ThemedText>
              )}
            </View>
            <View style={[styles.playlistThumb, { backgroundColor: theme.background }]}>
              {episode.thumbnail_url ? (
                <Image source={episode.thumbnail_url} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : null}
              {locked ? (
                <View style={[StyleSheet.absoluteFill, styles.lockShade]}>
                  <SymbolView name="lock.fill" size={14} tintColor="#fff" />
                </View>
              ) : null}
            </View>
            <View style={styles.playlistText}>
              <ThemedText type="smallBold" numberOfLines={2}>
                {episode.title}
              </ThemedText>
              {series.creator ? (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {series.creator.name}
                </ThemedText>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function Player({
  playback,
  watermark,
  mediaId,
  seriesPaywall,
  wallet,
  onUnlocked,
  onEnd,
}: {
  playback: Playback;
  watermark?: string;
  mediaId: number;
  seriesPaywall: MediaDetail['series_paywall'];
  wallet: Wallet;
  onUnlocked: () => Promise<void>;
  onEnd?: () => void;
}) {
  const theme = useTheme();

  if (playback.kind === 'play') {
    return <ProtectedVideo url={playback.url} protect={playback.protect} watermark={watermark} onEnd={onEnd} />;
  }

  // No price of its own: the server refuses a per-video unlock, so the bundle
  // is the only thing to offer (SERIES-06).
  if (playback.kind === 'locked' && seriesPaywall) {
    return (
      <View style={[styles.locked, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">
          Part of {seriesPaywall.title}. Unlock the series for {seriesPaywall.bundle_price_credits} credits.
        </ThemedText>
        <Button
          label="See the series"
          onPress={() => router.push({ pathname: '/series/[id]', params: { id: String(seriesPaywall.id) } })}
        />
      </View>
    );
  }

  if (playback.kind === 'locked') {
    return <LockedPanel mediaId={mediaId} price={playback.credits} wallet={wallet} onUnlocked={onUnlocked} />;
  }

  return (
    <View style={[styles.placeholder, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="small">{playback.message}</ThemedText>
    </View>
  );
}

/**
 * Spends credits through the same endpoint as the web. The server is the
 * authority on price and balance; the balance check here only decides whether
 * to offer Unlock or a top-up, and a refusal from the server is shown as is.
 */
function LockedPanel({
  mediaId,
  price,
  wallet,
  onUnlocked,
}: {
  mediaId: number;
  price: number;
  wallet: Wallet;
  onUnlocked: () => Promise<void>;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shortBy = price - wallet.balance;

  async function unlock() {
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/v1/content/${mediaId}/unlock`);
      await onUnlocked();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    Alert.alert('Unlock this video?', `This uses ${price} of your ${wallet.balance} credits.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlock', onPress: unlock },
    ]);
  }

  return (
    <View style={[styles.locked, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold">Unlock this video for {price} credits.</ThemedText>
      {shortBy > 0 ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            You need {shortBy} more credits to unlock it.
          </ThemedText>
          {wallet.topUpUrl ? (
            <Button label="Buy credits" onPress={() => WebBrowser.openBrowserAsync(wallet.topUpUrl!)} />
          ) : null}
        </>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            You have {wallet.balance} credits.
          </ThemedText>
          <Button label={`Unlock for ${price} credits`} busy={busy} onPress={confirm} />
        </>
      )}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: Spacing.five },
  padded: { padding: Spacing.three, gap: Spacing.two },
  locked: { padding: Spacing.four, gap: Spacing.three },
  playlistGap: { paddingTop: Spacing.three },
  playlist: { marginHorizontal: Spacing.three, borderRadius: 12, paddingVertical: Spacing.two, overflow: 'hidden' },
  playlistHead: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, gap: Spacing.half },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingRight: Spacing.three,
  },
  playlistIndex: { width: 28, alignItems: 'center' },
  playlistThumb: { width: 100, aspectRatio: 16 / 9, borderRadius: 6, overflow: 'hidden' },
  playlistText: { flex: 1, gap: Spacing.half },
  lockShade: { backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  placeholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    padding: Spacing.four,
  },
});
