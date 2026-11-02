import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { messageText } from '@/lib/messages';
import { api } from '@/lib/session';
import type { ChatMessage, ConversationPage } from '@/lib/types';

// Until the app joins the realtime channels, an open thread checks for new
// messages on this interval.
const POLL_MS = 5000;

const fetchPage = (id: string, page = 1) =>
  api.get<ConversationPage>(page > 1 ? `/api/v1/conversations/${id}?page=${page}` : `/api/v1/conversations/${id}`);
const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

function mergeNewest(current: ChatMessage[], newest: ChatMessage[]): ChatMessage[] {
  const known = new Set(current.map((m) => m.id));
  const fresh = newest.filter((m) => !known.has(m.id));

  return fresh.length ? [...current, ...fresh] : current;
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchPage(id)
      .then((first) => {
        if (cancelled) return;
        setTitle(first.data.other_user?.name ?? '');
        setMessages(first.messages);
        setPage(first.meta.current_page);
        setLastPage(first.meta.last_page);
      })
      .catch((e) => !cancelled && setLoadError(messageOf(e)))
      .finally(() => !cancelled && setLoading(false));

    const timer = setInterval(() => {
      fetchPage(id)
        .then((latest) => !cancelled && setMessages((current) => mergeNewest(current, latest.messages)))
        .catch(() => {});
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);

  async function loadOlder() {
    if (loading || loadingOlder || page >= lastPage) return;
    setLoadingOlder(true);
    try {
      const older = await fetchPage(id, page + 1);
      setMessages((current) => [...older.messages.filter((m) => !current.some((c) => c.id === m.id)), ...current]);
      setPage(older.meta.current_page);
    } catch {
      // What is already shown stays; scrolling back again retries.
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError('');
    try {
      const sent = await api.post<{ data: ChatMessage }>(`/api/v1/conversations/${id}/messages`, { body });
      setMessages((current) => mergeNewest(current, [sent.data]));
      setText('');
    } catch (e) {
      setSendError(e instanceof ApiError ? (e.fieldErrors.body ?? e.message) : messageOf(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView edges={['bottom']} style={[styles.fill, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: true, title, headerBackTitle: 'Inbox' }} />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}>
        {loading ? (
          <ActivityIndicator style={styles.fill} />
        ) : loadError ? (
          <View style={styles.padded}>
            <ErrorText>{loadError}</ErrorText>
          </View>
        ) : (
          <FlatList
            testID="thread"
            inverted
            data={[...messages].reverse()}
            keyExtractor={(m) => String(m.id)}
            renderItem={({ item }) => <Bubble message={item} />}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loadingOlder ? <ActivityIndicator /> : undefined}
            contentContainerStyle={styles.thread}
          />
        )}
        <View style={[styles.composer, { borderTopColor: theme.backgroundElement }]}>
          {sendError ? <ErrorText>{sendError}</ErrorText> : null}
          <View style={styles.composerRow}>
            <TextInput
              accessibilityLabel="Message"
              placeholder="Message"
              placeholderTextColor={theme.textSecondary}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={5000}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !text.trim() || sending, busy: sending }}
              disabled={!text.trim() || sending}
              onPress={send}
              style={({ pressed }) => [
                styles.send,
                { backgroundColor: theme.primary },
                (pressed || !text.trim()) && { opacity: 0.5 },
              ]}>
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText type="smallBold" style={styles.sendText}>
                  Send
                </ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const theme = useTheme();
  const mine = message.is_mine;

  return (
    <View
      style={[
        styles.bubble,
        mine ? [styles.mine, { backgroundColor: theme.primary }] : [styles.theirs, { backgroundColor: theme.backgroundElement }],
      ]}>
      {message.reply_to ? (
        <ThemedText type="small" style={mine ? styles.lightMuted : undefined} themeColor={mine ? undefined : 'textSecondary'}>
          {`${message.reply_to.user_name ?? 'Reply'}: ${message.reply_to.body}`}
        </ThemedText>
      ) : null}
      <ThemedText style={mine ? styles.light : undefined}>{messageText(message.body, message.attachment_type)}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  padded: { padding: Spacing.three },
  thread: { padding: Spacing.three, gap: Spacing.two },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.half },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  light: { color: '#fff' },
  lightMuted: { color: 'rgba(255,255,255,0.8)' },
  composer: { padding: Spacing.two, gap: Spacing.one, borderTopWidth: StyleSheet.hairlineWidth },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 20, paddingHorizontal: Spacing.three, paddingTop: 12, paddingBottom: 12, fontSize: 16 },
  send: { height: 44, minWidth: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.three },
  sendText: { color: '#fff' },
});
