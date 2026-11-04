import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Avatar, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { joinCircle, type RealtimeConfig } from '@/lib/realtime';
import { api, useSession } from '@/lib/session';
import { timeAgo } from '@/lib/time';
import { tokenStore } from '@/lib/token-store';
import type { CircleChatMessage } from '@/lib/types';

type Page = { data: CircleChatMessage[]; next_cursor: string | null };

const POLL_MS = 5000;
const LIVE_POLL_MS = 30000;
const failure = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

/** Newest first, as the list draws it upside down; the latest page replaces what it overlaps. */
function merge(current: CircleChatMessage[], latest: CircleChatMessage[]): CircleChatMessage[] {
  const ids = new Set(latest.map((m) => m.id));
  const oldest = latest.length ? latest[latest.length - 1].id : Infinity;

  return [...latest, ...current.filter((m) => !ids.has(m.id) && m.id < oldest)];
}

/** The circle's group chat. Members post; a paused member reads, and the server says why they cannot post. */
export default function CircleChat() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const theme = useTheme();
  const { launch } = useSession();
  const signedIn = launch?.route === 'home' ? launch : null;
  const myId = signedIn?.me.id;
  const [messages, setMessages] = useState<CircleChatMessage[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const live = useRef<{ leave: () => void } | null>(null);
  const path = `/api/v1/circles/${encodeURIComponent(id)}/messages`;

  const refresh = useCallback(async () => {
    try {
      const page = await api.get<Page>(path);
      setMessages((current) => merge(current ?? [], page.data));
      setCursor((existing) => existing ?? page.next_cursor);
      setLoadError('');
    } catch (e) {
      setLoadError(failure(e));
      setMessages((current) => current ?? []);
    }
  }, [path]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Page>(path)
      .then((page) => {
        if (cancelled) return;
        setMessages((current) => merge(current ?? [], page.data));
        setCursor(page.next_cursor);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(failure(e));
        setMessages((current) => current ?? []);
      });
    tokenStore.get().then((stored) => !cancelled && setToken(stored?.token ?? null));
    live.current = joinCircle(signedIn?.config.realtime as RealtimeConfig | undefined, id, refresh);
    const timer = setInterval(() => !cancelled && refresh(), live.current ? LIVE_POLL_MS : POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      live.current?.leave();
    };
    // The channel and the timer belong to this circle; config is read once on the way in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, path, refresh]);

  async function loadOlder() {
    if (!cursor) return;
    try {
      const page = await api.get<Page>(`${path}?cursor=${encodeURIComponent(cursor)}`);
      setMessages((current) => [
        ...(current ?? []),
        ...page.data.filter((m) => !(current ?? []).some((c) => c.id === m.id)),
      ]);
      setCursor(page.next_cursor);
    } catch {
      // The next scroll to the top tries again.
    }
  }

  async function send() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setSendError('');
    try {
      const sent = await api.post<{ data: CircleChatMessage }>(path, { body });
      setMessages((current) => [sent.data, ...(current ?? []).filter((m) => m.id !== sent.data.id)]);
      setText('');
    } catch (e) {
      setSendError(failure(e));
    } finally {
      setSending(false);
    }
  }

  function confirmDelete(message: CircleChatMessage) {
    Alert.alert('Delete this message?', 'It is removed for everyone in the circle.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/api/v1/circle-messages/${message.id}`);
            setMessages((current) => (current ?? []).filter((m) => m.id !== message.id));
          } catch (e) {
            setSendError(failure(e));
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView edges={['bottom']} style={[styles.fill, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: true, title: title ?? 'Circle chat', headerBackTitle: 'Back' }} />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}>
        {messages === null ? (
          <ActivityIndicator style={styles.fill} />
        ) : (
          <FlatList
            data={messages}
            inverted
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={styles.list}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.3}
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                {loadError || 'No messages yet. Say hello.'}
              </ThemedText>
            }
            renderItem={({ item }) => (
              <Bubble message={item} mine={item.user_id === myId} token={token} onDelete={confirmDelete} />
            )}
          />
        )}

        {sendError ? (
          <View style={styles.errorRow}>
            <ErrorText>{sendError}</ErrorText>
          </View>
        ) : null}
        <View style={[styles.composer, { borderTopColor: theme.backgroundElement }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message the circle"
            placeholderTextColor={theme.textSecondary}
            maxLength={2000}
            multiline
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: sending || !text.trim(), busy: sending }}
            disabled={sending || !text.trim()}
            onPress={send}>
            {sending ? (
              <ActivityIndicator />
            ) : (
              <SymbolView
                name="arrow.up.circle.fill"
                size={32}
                tintColor={text.trim() ? theme.primary : theme.textSecondary}
              />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({
  message,
  mine,
  token,
  onDelete,
}: {
  message: CircleChatMessage;
  mine: boolean;
  token: string | null;
  onDelete: (message: CircleChatMessage) => void;
}) {
  const theme = useTheme();
  const name = message.user?.name ?? 'Someone';
  const body = message.body ?? message.attachment_name ?? '';

  return (
    <View style={[styles.row, mine && styles.rowMine]}>
      {!mine ? <Avatar uri={message.user?.profile_photo_url} name={name} size={28} /> : null}
      <Pressable
        accessibilityLabel={mine ? `Your message: ${body}` : `${name}: ${body}`}
        onLongPress={mine ? () => onDelete(message) : undefined}
        style={[
          styles.bubble,
          mine ? { backgroundColor: theme.primary } : { backgroundColor: theme.backgroundElement },
        ]}>
        {!mine ? (
          <ThemedText type="small" themeColor="textSecondary">
            {`${name} · ${timeAgo(message.created_at)}`}
          </ThemedText>
        ) : null}
        {message.attachment_url && message.attachment_type === 'image' && token ? (
          // The file sits behind the member check, so the picture is fetched with my sign-in.
          <Image
            source={{ uri: message.attachment_url, headers: { Authorization: `Bearer ${token}` } }}
            style={styles.photo}
            contentFit="cover"
          />
        ) : message.attachment_url ? (
          <View style={styles.file}>
            <SymbolView name="doc.fill" size={16} tintColor={mine ? '#fff' : theme.text} />
            <ThemedText type="small" style={mine ? styles.onDark : undefined}>
              {message.attachment_name ?? 'File'}
            </ThemedText>
          </View>
        ) : null}
        {message.body ? (
          <ThemedText type="small" style={mine ? styles.onDark : undefined}>
            {message.body}
          </ThemedText>
        ) : null}
        {mine ? (
          <ThemedText type="small" style={styles.mineTime}>
            {timeAgo(message.created_at)}
          </ThemedText>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two },
  empty: { textAlign: 'center', paddingVertical: Spacing.five, transform: [{ scaleY: -1 }] },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  rowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: 2 },
  onDark: { color: '#fff' },
  mineTime: { color: 'rgba(255,255,255,0.75)', fontSize: 11, alignSelf: 'flex-end' },
  photo: { width: 200, height: 150, borderRadius: 10, marginVertical: 2 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorRow: { paddingHorizontal: Spacing.three },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
  },
});
