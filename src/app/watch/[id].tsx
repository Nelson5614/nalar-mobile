import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import ProtectedVideo from '@/components/protected-video';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { PLATFORM } from '@/lib/config';
import { resolvePlayback, type Playback } from '@/lib/playback';
import { api, useSession } from '@/lib/session';
import type { MediaDetail } from '@/lib/types';

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
  const { id } = useLocalSearchParams<{ id: string }>();
  const { launch, reload } = useSession();
  const theme = useTheme();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
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
              wallet={wallet}
              onUnlocked={afterUnlock}
            />
            <View style={styles.padded}>
              <ThemedText type="subtitle">{loaded.media.title}</ThemedText>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {loaded.media.creator.name}
              </ThemedText>
              {signedIn && signedIn.me.id !== loaded.media.creator.id ? (
                <Button
                  label={`Message ${loaded.media.creator.name}`}
                  variant="secondary"
                  onPress={() => messageCreator(loaded.media.creator.id)}
                />
              ) : null}
              {messageError ? <ErrorText>{messageError}</ErrorText> : null}
              {loaded.media.description ? <ThemedText>{loaded.media.description}</ThemedText> : null}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

type Wallet = { balance: number; topUpUrl?: string };

function Player({
  playback,
  watermark,
  mediaId,
  wallet,
  onUnlocked,
}: {
  playback: Playback;
  watermark?: string;
  mediaId: number;
  wallet: Wallet;
  onUnlocked: () => Promise<void>;
}) {
  const theme = useTheme();

  if (playback.kind === 'play') {
    return <ProtectedVideo url={playback.url} protect={playback.protect} watermark={watermark} />;
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
  placeholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    padding: Spacing.four,
  },
});
