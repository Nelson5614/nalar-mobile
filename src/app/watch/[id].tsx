import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import ProtectedVideo from '@/components/protected-video';
import { ThemedText } from '@/components/themed-text';
import { ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
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
  const { launch } = useSession();
  const theme = useTheme();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const tag = launch?.route === 'home' ? launch.me.watermark_tag : undefined;
  const watermark = typeof tag === 'string' && tag ? tag : undefined;

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
            <Player playback={loaded.playback} watermark={watermark} />
            <View style={styles.padded}>
              <ThemedText type="subtitle">{loaded.media.title}</ThemedText>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {loaded.media.creator.name}
              </ThemedText>
              {loaded.media.description ? <ThemedText>{loaded.media.description}</ThemedText> : null}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

function Player({ playback, watermark }: { playback: Playback; watermark?: string }) {
  const theme = useTheme();

  if (playback.kind === 'play') {
    return <ProtectedVideo url={playback.url} protect={playback.protect} watermark={watermark} />;
  }

  return (
    <View style={[styles.placeholder, { backgroundColor: theme.backgroundElement }]}>
      {playback.kind === 'locked' ? (
        <>
          <ThemedText type="smallBold">Unlock this video for {playback.credits} credits.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Unlocking from the app is coming next.
          </ThemedText>
        </>
      ) : (
        <ThemedText type="small">{playback.message}</ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: Spacing.five },
  padded: { padding: Spacing.three, gap: Spacing.two },
  placeholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    padding: Spacing.four,
  },
});
