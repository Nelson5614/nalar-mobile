import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { api } from '@/lib/session';
import type { FeedItem, FeedPage } from '@/lib/types';

const fetchPage = (page: number) => api.get<FeedPage>(`/api/v1/feed?page=${page}`);
const playable = (items: FeedItem[]) => items.filter((item) => item.type === 'media');
const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

export default function Home() {
  const theme = useTheme();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const showFirstPage = useCallback((result: FeedPage) => {
    setItems(playable(result.data));
    setPage(result.current_page);
    setLastPage(result.last_page);
    setError('');
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchPage(1)
      .then((result) => !cancelled && showFirstPage(result))
      .catch((e) => !cancelled && setError(messageOf(e)))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [showFirstPage]);

  async function reload(setBusy: (busy: boolean) => void) {
    setBusy(true);
    try {
      showFirstPage(await fetchPage(1));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (loadingMore || loading || page >= lastPage) return;
    setLoadingMore(true);
    try {
      const result = await fetchPage(page + 1);
      setItems((current) => [...current, ...playable(result.data)]);
      setPage(result.current_page);
      setLastPage(result.last_page);
    } catch {
      // The rows already shown stay; scrolling again retries.
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: theme.background }]}>
      <FlatList
        testID="feed"
        data={items}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        renderItem={({ item }) => <FeedCard item={item} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(setRefreshing)} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<ThemedText type="subtitle">Home</ThemedText>}
        ListFooterComponent={loadingMore ? <ActivityIndicator /> : undefined}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator />
          ) : error ? (
            <View style={styles.message}>
              <ErrorText>{error}</ErrorText>
              <Button label="Try again" busy={loading} onPress={() => reload(setLoading)} />
            </View>
          ) : (
            <ThemedText themeColor="textSecondary">
              Nothing here yet. Videos from creators on Nalar will show up here.
            </ThemedText>
          )
        }
      />
    </SafeAreaView>
  );
}

function FeedCard({ item }: { item: FeedItem }) {
  const theme = useTheme();
  const title = item.title ?? 'Untitled video';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => router.push({ pathname: '/watch/[id]', params: { id: String(item.id) } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
      <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
        {item.thumbnail_url ? (
          <Image source={item.thumbnail_url} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
        {item.requires_payment ? (
          <View style={[styles.badge, { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" style={styles.badgeText}>
              Premium
            </ThemedText>
          </View>
        ) : null}
      </View>
      <ThemedText type="smallBold">{title}</ThemedText>
      {item.creator?.name ? (
        <ThemedText type="small" themeColor="textSecondary">
          {item.creator.name}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.four },
  message: { gap: Spacing.three },
  card: { gap: Spacing.one },
  thumb: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden' },
  badge: { position: 'absolute', top: Spacing.two, left: Spacing.two, borderRadius: 6, paddingHorizontal: Spacing.two },
  badgeText: { color: '#fff' },
});
