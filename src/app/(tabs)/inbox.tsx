import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import NotificationsList from '@/components/notifications-list';
import { ThemedText } from '@/components/themed-text';
import { Avatar, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { messageText } from '@/lib/messages';
import { api } from '@/lib/session';
import type { ConversationSummary } from '@/lib/types';

type Inbox = { data: ConversationSummary[] };
type Segment = 'messages' | 'notifications';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'messages', label: 'Messages' },
  { key: 'notifications', label: 'Notifications' },
];

const fetchInbox = () => api.get<Inbox>('/api/v1/conversations');
const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

export default function InboxScreen() {
  const theme = useTheme();
  const [threads, setThreads] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [segment, setSegment] = useState<Segment>('messages');

  // Coming back from a conversation should show it as read and moved to the top.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchInbox()
        .then((inbox) => {
          if (cancelled) return;
          setThreads(inbox.data);
          setError('');
        })
        .catch((e) => !cancelled && setError(messageOf(e)))
        .finally(() => !cancelled && setLoading(false));

      return () => {
        cancelled = true;
      };
    }, []),
  );

  async function refresh() {
    setRefreshing(true);
    try {
      setThreads((await fetchInbox()).data);
      setError('');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <ThemedText type="subtitle">Inbox</ThemedText>
        <View style={styles.segments}>
          {SEGMENTS.map(({ key, label }) => {
            const selected = segment === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected }}
                onPress={() => setSegment(key)}
                style={[styles.segment, selected && { backgroundColor: theme.primary }]}>
                <ThemedText type="smallBold" style={selected ? styles.selectedText : undefined}>
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>
      {segment === 'notifications' ? (
        <NotificationsList />
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(thread) => String(thread.id)}
          renderItem={({ item }) => <ThreadRow thread={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          contentContainerStyle={styles.content}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator />
            ) : error ? (
              <ErrorText>{error}</ErrorText>
            ) : (
              <ThemedText themeColor="textSecondary">
                No messages yet. Open a creator’s video and tap Message to start a conversation.
              </ThemedText>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

function ThreadRow({ thread }: { thread: ConversationSummary }) {
  const theme = useTheme();
  const name = thread.other_user?.name ?? 'Nalar member';
  const last = thread.last_message;
  const preview = last ? messageText(last.body, last.attachment_type) : '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={() =>
        router.push({
          pathname: '/conversation/[id]',
          params: { id: String(thread.id) },
        })
      }
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <Avatar uri={thread.other_user?.profile_photo_url} name={name} size={52} />
      <View style={styles.rowText}>
        <ThemedText type="smallBold">{name}</ThemedText>
        {preview ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {last?.is_mine ? `You: ${preview}` : preview}
          </ThemedText>
        ) : null}
      </View>
      {thread.unread_count > 0 ? (
        <View style={[styles.badge, { backgroundColor: theme.primary }]}>
          <ThemedText type="smallBold" style={styles.badgeText}>
            {String(thread.unread_count)}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  segments: { flexDirection: 'row', gap: Spacing.two },
  segment: {
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    minHeight: 32,
    justifyContent: 'center',
  },
  selectedText: { color: '#fff' },
  content: { padding: Spacing.three, gap: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
  },
  rowText: { flex: 1, gap: Spacing.half },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff' },
});
