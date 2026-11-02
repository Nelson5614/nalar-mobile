import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { api } from '@/lib/session';
import type { SearchCreator, SearchResponse, SearchVideo } from '@/lib/types';

// The server refuses shorter terms, and waiting for a pause in typing keeps
// the app well inside the per-IP search limit.
const MIN_LENGTH = 2;
const PAUSE_MS = 400;

type Results = { term: string; creators: SearchCreator[]; videos: SearchVideo[] } | { term: string; error: string };

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

export default function Search() {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const term = text.trim();

  useEffect(() => {
    if (term.length < MIN_LENGTH) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .get<SearchResponse>(`/api/v1/search?term=${encodeURIComponent(term)}`)
        .then((response) => !cancelled && setResults({ term, ...response.data }))
        .catch((e) => !cancelled && setResults({ term, error: messageOf(e) }));
    }, PAUSE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  // Results for an older term are never shown against a newer one.
  const current = results?.term === term ? results : null;

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: true, title: 'Search', headerBackTitle: 'Back' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <TextInput
          accessibilityLabel="Search Nalar"
          placeholder="Creators and videos"
          placeholderTextColor={theme.textSecondary}
          value={text}
          onChangeText={setText}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        {term.length < MIN_LENGTH ? (
          <ThemedText themeColor="textSecondary">Search for creators and videos.</ThemedText>
        ) : !current ? (
          <ActivityIndicator />
        ) : 'error' in current ? (
          <ErrorText>{current.error}</ErrorText>
        ) : current.creators.length === 0 && current.videos.length === 0 ? (
          <ThemedText themeColor="textSecondary">Nothing found for “{current.term}”.</ThemedText>
        ) : (
          <>
            {current.creators.length > 0 ? (
              <View style={styles.section}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  Creators
                </ThemedText>
                {current.creators.map((creator) => (
                  <Pressable
                    key={creator.id}
                    accessibilityRole="button"
                    accessibilityLabel={creator.name}
                    onPress={() =>
                      router.push({ pathname: '/creator/[id]', params: { id: creator.public_id ?? String(creator.id) } })
                    }
                    style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
                    <ThemedText type="smallBold">{creator.name}</ThemedText>
                    {creator.bio_excerpt ? (
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                        {creator.bio_excerpt}
                      </ThemedText>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
            {current.videos.length > 0 ? (
              <View style={styles.section}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  Videos
                </ThemedText>
                {current.videos.map((video) => (
                  <VideoRow key={video.id} video={video} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function VideoRow({ video }: { video: SearchVideo }) {
  const theme = useTheme();

  return (
    <Pressable
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
        {video.creator_name ? (
          <ThemedText type="small" themeColor="textSecondary">
            {video.creator_name}
          </ThemedText>
        ) : null}
        {video.requires_payment ? (
          <ThemedText type="smallBold" themeColor="primary">
            Premium
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.four },
  input: { minHeight: 44, borderRadius: 12, paddingHorizontal: Spacing.three, fontSize: 16 },
  section: { gap: Spacing.three },
  row: { gap: Spacing.half },
  videoRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  thumb: { width: 112, aspectRatio: 16 / 9, borderRadius: 8, overflow: 'hidden' },
  videoText: { flex: 1, gap: Spacing.half },
});
