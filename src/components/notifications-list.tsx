import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { api } from '@/lib/session';
import type { AppNotification, NotificationFeed } from '@/lib/types';

const fetchFeed = () => api.get<NotificationFeed>('/api/v1/notifications');
const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

// Videos are the only notification target with a screen in the app so far.
const videoIdIn = (url: string | null) => url?.match(/^\/watch\/([^/?#]+)/)?.[1] ?? null;

export default function NotificationsList() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchFeed()
      .then((feed) => !cancelled && setItems(feed.data))
      .catch((e) => !cancelled && setError(messageOf(e)))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      setItems((await fetchFeed()).data);
      setError('');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setRefreshing(false);
    }
  }

  // Marking read is shown straight away; if the request fails the next load
  // shows it unread again, which is harmless.
  function open(notification: AppNotification) {
    if (!notification.read) {
      setItems((current) => current.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      api.post(`/api/v1/notifications/${notification.id}/read`).catch(() => {});
    }

    const videoId = videoIdIn(notification.url);
    if (videoId) router.push({ pathname: '/watch/[id]', params: { id: videoId } });
  }

  function markAllRead() {
    setItems((current) => current.map((n) => ({ ...n, read: true })));
    api.post('/api/v1/notifications/read-all').catch(() => {});
  }

  const hasUnread = items.some((n) => !n.read);

  return (
    <FlatList
      data={items}
      keyExtractor={(n) => n.id}
      renderItem={({ item }) => <NotificationRow notification={item} onPress={() => open(item)} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        hasUnread ? (
          <ThemedText type="linkPrimary" accessibilityRole="button" onPress={markAllRead} style={styles.markAll}>
            Mark all as read
          </ThemedText>
        ) : undefined
      }
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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={notification.read ? notification.message : `Unread: ${notification.message}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={[styles.dot, { backgroundColor: notification.read ? 'transparent' : theme.primary }]} />
      <ThemedText type={notification.read ? 'small' : 'smallBold'} style={styles.message}>
        {notification.message}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  markAll: { alignSelf: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  message: { flex: 1 },
});
