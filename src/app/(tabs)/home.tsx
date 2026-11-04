import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { api } from '@/lib/session';
import type { FeedItem, FeedPage } from '@/lib/types';

const ALL = 'All';
// The web's list (resources/js/constants/categories.js in the Nalar repo).
// media.category is free text on the server, so the two must be kept in step.
const CATEGORIES = [ALL, 'Music', 'Entertainment', 'Culture Preservation', 'Education', 'Spirituality', 'News'];

const fetchPage = (page: number, category: string) =>
  api.get<FeedPage>(
    category === ALL
      ? `/api/v1/feed?page=${page}`
      : `/api/v1/feed?page=${page}&category=${encodeURIComponent(category)}`,
  );
const playable = (items: FeedItem[]) => items.filter((item) => item.type === 'media');
const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

export default function Home() {
  const theme = useTheme();
  const [category, setCategory] = useState(ALL);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  // Each first-page load takes a ticket; an answer for an older one (a
  // category tapped past) is dropped instead of replacing the newer feed.
  const ticket = useRef(0);

  const showFirstPage = useCallback((result: FeedPage) => {
    setItems(playable(result.data));
    setPage(result.current_page);
    setLastPage(result.last_page);
    setError('');
  }, []);

  useEffect(() => {
    let cancelled = false;
    const mine = ++ticket.current;
    const current = () => !cancelled && mine === ticket.current;
    fetchPage(1, ALL)
      .then((result) => current() && showFirstPage(result))
      .catch((e) => current() && setError(messageOf(e)))
      .finally(() => current() && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [showFirstPage]);

  async function reload(setBusy: (busy: boolean) => void, chosen = category) {
    const mine = ++ticket.current;
    setBusy(true);
    try {
      const result = await fetchPage(1, chosen);
      if (mine === ticket.current) showFirstPage(result);
    } catch (e) {
      if (mine === ticket.current) setError(messageOf(e));
    } finally {
      if (mine === ticket.current) setBusy(false);
    }
  }

  function choose(next: string) {
    if (next === category) return;
    setCategory(next);
    setItems([]);
    setError('');
    reload(setLoading, next);
  }

  async function loadMore() {
    if (loadingMore || loading || page >= lastPage) return;
    const mine = ticket.current;
    setLoadingMore(true);
    try {
      const result = await fetchPage(page + 1, category);
      if (mine !== ticket.current) return;
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
      <View style={styles.header}>
        <ThemedText type="subtitle">Home</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search"
          onPress={() => router.push('/search')}
          hitSlop={8}
          style={({ pressed }) => [styles.searchButton, pressed && { opacity: 0.6 }]}>
          <SymbolView name="magnifyingglass" tintColor={theme.text} size={24} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipBar}
        contentContainerStyle={styles.chips}>
        {CATEGORIES.map((name) => {
          const selected = name === category;
          return (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityLabel={name}
              accessibilityState={{ selected }}
              onPress={() => choose(name)}
              hitSlop={{ top: 4, bottom: 4 }}
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: selected ? theme.primary : theme.backgroundElement },
                pressed && { opacity: 0.7 },
              ]}>
              <ThemedText type="smallBold" style={{ color: selected ? '#fff' : theme.text }}>
                {name}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
      <FlatList
        testID="feed"
        data={items}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        renderItem={({ item }) => <FeedCard item={item} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(setRefreshing)} />}
        contentContainerStyle={styles.content}
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
              {category === ALL
                ? 'Nothing here yet. Videos from creators on Nalar will show up here.'
                : `No ${category} videos yet. Try another category.`}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  searchButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  // Stays put above the feed, like the web's pill bar.
  chipBar: { flexGrow: 0 },
  chips: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  chip: { minHeight: 36, borderRadius: 8, paddingHorizontal: Spacing.three, justifyContent: 'center' },
  message: { gap: Spacing.three },
  card: { gap: Spacing.one },
  thumb: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden' },
  badge: { position: 'absolute', top: Spacing.two, left: Spacing.two, borderRadius: 6, paddingHorizontal: Spacing.two },
  badgeText: { color: '#fff' },
});
