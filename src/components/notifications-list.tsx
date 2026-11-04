import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { api } from '@/lib/session';
import { timeAgo } from '@/lib/time';
import type { AppNotification, NotificationFeed } from '@/lib/types';
import { refreshUnread } from '@/lib/unread';

const fetchFeed = (page = 1) =>
  api.get<NotificationFeed>(page > 1 ? `/api/v1/notifications?page=${page}` : '/api/v1/notifications');
const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

/**
 * The server names the screen (NotificationFeedService::target). A screen this
 * version of the app does not know opens nothing, so an older install never
 * lands somewhere wrong.
 */
function routeFor(target: AppNotification['target']): Href | null {
  if (!target) return null;
  const id = target.id ?? '';

  switch (target.screen) {
    case 'watch':
      return { pathname: '/watch/[id]', params: { id } };
    case 'conversation':
      return { pathname: '/conversation/[id]', params: { id } };
    case 'circle':
      return { pathname: '/circle/[id]', params: { id } };
    case 'creator':
      return { pathname: '/creator/[id]', params: { id } };
    case 'consultations':
      return '/consultations/mine';
    case 'library':
      return '/library';
    default:
      return null;
  }
}

export default function NotificationsList() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const show = (feed: NotificationFeed) => {
    setItems(feed.data);
    setPage(feed.meta.current_page);
    setLastPage(feed.meta.last_page);
  };

  useEffect(() => {
    let cancelled = false;
    fetchFeed()
      .then((feed) => !cancelled && show(feed))
      .catch((e) => !cancelled && setError(messageOf(e)))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      show(await fetchFeed());
      setError('');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setRefreshing(false);
    }
  }

  async function loadMore() {
    if (loading || loadingMore || page >= lastPage) return;
    setLoadingMore(true);
    try {
      const older = await fetchFeed(page + 1);
      setItems((current) => [...current, ...older.data.filter((n) => !current.some((c) => c.id === n.id))]);
      setPage(older.meta.current_page);
      setLastPage(older.meta.last_page);
    } catch {
      // What is shown stays; scrolling again retries.
    } finally {
      setLoadingMore(false);
    }
  }

  // Marking read is shown straight away; if the request fails the next load
  // shows it unread again, which is harmless.
  function open(notification: AppNotification) {
    if (!notification.read) {
      setItems((current) => current.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      api
        .post(`/api/v1/notifications/${notification.id}/read`)
        .then(refreshUnread)
        .catch(() => {});
    }

    const route = routeFor(notification.target);
    if (route) router.push(route);
  }

  function markAllRead() {
    setItems((current) => current.map((n) => ({ ...n, read: true })));
    api
      .post('/api/v1/notifications/read-all')
      .then(refreshUnread)
      .catch(() => {});
  }

  const hasUnread = items.some((n) => !n.read);

  return (
    <FlatList
      testID="notifications"
      data={items}
      keyExtractor={(n) => n.id}
      renderItem={({ item }) => <NotificationRow notification={item} onPress={() => open(item)} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        hasUnread ? (
          <ThemedText type="linkPrimary" accessibilityRole="button" onPress={markAllRead} style={styles.markAll}>
            Mark all as read
          </ThemedText>
        ) : undefined
      }
      ListFooterComponent={loadingMore ? <ActivityIndicator /> : undefined}
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator />
        ) : error ? (
          <ErrorText>{error}</ErrorText>
        ) : (
          <ThemedText themeColor="textSecondary">
            No notifications yet. Replies, likes and new videos from creators will show up here.
          </ThemedText>
        )
      }
    />
  );
}

function NotificationRow({ notification, onPress }: { notification: AppNotification; onPress: () => void }) {
  const theme = useTheme();
  const when = timeAgo(notification.created_at);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={notification.read ? notification.message : `Unread: ${notification.message}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      {notification.image_url ? (
        <Image
          testID={`notification-photo-${notification.id}`}
          source={{ uri: notification.image_url }}
          style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}
          contentFit="cover"
        />
      ) : (
        // Badges, payouts and other system notices have no person behind them.
        <View
          testID={`notification-icon-${notification.id}`}
          style={[styles.avatar, styles.iconAvatar, { backgroundColor: theme.backgroundElement }]}>
          <SymbolView name="bell.fill" tintColor={theme.textSecondary} size={22} />
        </View>
      )}
      <View style={styles.text}>
        <ThemedText type={notification.read ? 'small' : 'smallBold'}>{notification.message}</ThemedText>
        {when ? (
          <ThemedText type="small" themeColor="textSecondary">
            {when}
          </ThemedText>
        ) : null}
      </View>
      <View style={[styles.dot, { backgroundColor: notification.read ? 'transparent' : theme.primary }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  markAll: { alignSelf: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 56 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  iconAvatar: { alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { flex: 1, gap: 2 },
});
