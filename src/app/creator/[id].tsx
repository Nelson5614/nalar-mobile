import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { api } from '@/lib/session';
import type { CreatorProfileData } from '@/lib/types';

type Loaded = { profile: CreatorProfileData } | { error: string };

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

async function load(id: string): Promise<Loaded> {
  try {
    return { profile: (await api.get<{ data: CreatorProfileData }>(`/api/v1/creators/${encodeURIComponent(id)}`)).data };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Something went wrong. Please try again.' };
  }
}

export default function CreatorProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [messageError, setMessageError] = useState('');

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
              {loaded.profile.profile_photo_url ? (
                <Image source={loaded.profile.profile_photo_url} style={styles.avatar} contentFit="cover" />
              ) : null}
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
            {loaded.profile.can_offer_consultations && !loaded.profile.is_me ? (
              <Button
                label="Book a consultation"
                onPress={() =>
                  router.push({
                    pathname: '/consultations/[creator]',
                    params: { creator: loaded.profile.public_id ?? String(loaded.profile.id) },
                  })
                }
              />
            ) : null}
            {messageError ? <ErrorText>{messageError}</ErrorText> : null}
          </View>

          {loaded.profile.videos.length > 0 ? (
            <View style={styles.section}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Videos
              </ThemedText>
              {loaded.profile.videos.map((video) => (
                <Pressable
                  key={video.id}
                  accessibilityRole="button"
                  accessibilityLabel={video.title}
                  onPress={() =>
                    router.push({ pathname: '/watch/[id]', params: { id: video.public_id ?? String(video.id) } })
                  }
                  style={({ pressed }) => [styles.videoRow, pressed && { opacity: 0.7 }]}>
                  <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
                    {video.thumbnail_url ? (
                      <Image source={video.thumbnail_url} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : null}
                  </View>
                  <View style={styles.videoText}>
                    <ThemedText type="smallBold" numberOfLines={2}>
                      {video.title}
                    </ThemedText>
                    {video.requires_payment ? (
                      <ThemedText type="smallBold" themeColor="primary">
                        {video.is_unlocked ? 'Unlocked' : 'Premium'}
                      </ThemedText>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Series have no screen in the app yet, so they are listed only. */}
          {loaded.profile.series.length > 0 ? (
            <View style={styles.section}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Series
              </ThemedText>
              {loaded.profile.series.map((series) => (
                <View key={series.id} style={styles.seriesRow}>
                  <ThemedText type="smallBold">{series.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {plural(series.media_count, 'video', 'videos')}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: Spacing.five, gap: Spacing.three },
  padded: { padding: Spacing.three, gap: Spacing.three },
  cover: { width: '100%', aspectRatio: 3 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  identityText: { flex: 1, gap: Spacing.half },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  badge: { borderRadius: 12, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  section: { paddingHorizontal: Spacing.three, gap: Spacing.three },
  videoRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  thumb: { width: 112, aspectRatio: 16 / 9, borderRadius: 8, overflow: 'hidden' },
  videoText: { flex: 1, gap: Spacing.half },
  seriesRow: { gap: Spacing.half },
});
