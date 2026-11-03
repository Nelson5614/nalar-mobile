import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet, Attachment, EmojiTray, formatDuration } from '@/components/chat';
import { ThemedText } from '@/components/themed-text';
import { ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { formWith, pickDocument, pickPhoto, takePhoto, type Picked, type PickResult } from '@/lib/chat-media';
import { messageText } from '@/lib/messages';
import { joinThread, type RealtimeConfig, type ThreadChannel } from '@/lib/realtime';
import { api, useSession } from '@/lib/session';
import type { ChatMessage, ConversationPage } from '@/lib/types';

// Without a realtime connection an open thread checks on this interval; with
// one, the slower check only catches anything a dropped socket missed.
const POLL_MS = 5000;
const LIVE_POLL_MS = 30000;
const TYPING_SHOWN_MS = 4000;
const TYPING_SENT_EVERY_MS = 3000;
const MENU_CLOSE_MS = 400;
const DANGER = '#DC2626';
// The server's cap on a voice note (StoreVoiceMessageRequest).
const MAX_VOICE_SECONDS = 300;
// The same list the server accepts (MessageReaction::EMOJIS).
const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍', '🔥', '🙏'];

const fetchPage = (id: string, page = 1) =>
  api.get<ConversationPage>(page > 1 ? `/api/v1/conversations/${id}?page=${page}` : `/api/v1/conversations/${id}`);
const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

/** Newer copies replace what is shown (edits, reactions, fresh links); new ids go on the end. */
export function mergeLatest(current: ChatMessage[], latest: ChatMessage[]): ChatMessage[] {
  const byId = new Map(latest.map((m) => [m.id, m]));
  const known = new Set(current.map((m) => m.id));

  return [...current.map((m) => byId.get(m.id) ?? m), ...latest.filter((m) => !known.has(m.id))];
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { launch } = useSession();
  const realtime = launch?.route === 'home' ? (launch.config.realtime as RealtimeConfig | undefined) : undefined;

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
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [menuFor, setMenuFor] = useState<ChatMessage | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [typingUntil, setTypingUntil] = useState(0);

  const channel = useRef<ThreadChannel | null>(null);
  const lastTypingSent = useRef(0);
  const capTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopLatest = useRef<((keep: boolean) => Promise<void>) | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);

  const refreshLatest = useCallback(
    () =>
      fetchPage(id)
        .then((latest) => setMessages((current) => mergeLatest(current, latest.messages)))
        .catch(() => {}),
    [id],
  );

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

    channel.current = joinThread(realtime, id, {
      onChange: () => !cancelled && refreshLatest(),
      onDeleted: (messageId) => !cancelled && setMessages((current) => current.filter((m) => m.id !== messageId)),
      onTyping: () => !cancelled && setTypingUntil(Date.now() + TYPING_SHOWN_MS),
    });

    const timer = setInterval(() => !cancelled && refreshLatest(), channel.current ? LIVE_POLL_MS : POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      channel.current?.leave();
      channel.current = null;
    };
  }, [id, realtime, refreshLatest]);

  // Clears the "typing" line once the other person stops.
  useEffect(() => {
    if (!typingUntil) return;
    const timer = setTimeout(() => setTypingUntil(0), Math.max(0, typingUntil - Date.now()));

    return () => clearTimeout(timer);
  }, [typingUntil]);

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

  function onChangeText(value: string) {
    setText(value);
    const now = Date.now();
    if (value && channel.current && now - lastTypingSent.current > TYPING_SENT_EVERY_MS) {
      lastTypingSent.current = now;
      channel.current.typing();
    }
  }

  function added(message: ChatMessage) {
    setMessages((current) => mergeLatest(current, [message]));
    setReplyTo(null);
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError('');
    try {
      if (editing) {
        const saved = await api.put<{ data: { id: number; body: string } }>(`/api/v1/messages/${editing.id}`, { body });
        setMessages((current) =>
          current.map((m) => (m.id === editing.id ? { ...m, body: saved.data.body, edited: true } : m)),
        );
        setEditing(null);
      } else {
        const sent = await api.post<{ data: ChatMessage }>(`/api/v1/conversations/${id}/messages`, {
          body,
          reply_to_id: replyTo?.id ?? null,
        });
        added(sent.data);
      }
      setText('');
    } catch (e) {
      setSendError(e instanceof ApiError ? (e.fieldErrors.body ?? e.message) : messageOf(e));
    } finally {
      setSending(false);
    }
  }

  async function upload(path: string, form: FormData) {
    setSending(true);
    setSendError('');
    try {
      added((await api.post<{ data: ChatMessage }>(path, form)).data);
    } catch (e) {
      const fieldError = e instanceof ApiError ? (e.fieldErrors.file ?? e.fieldErrors.voice) : undefined;
      setSendError(fieldError ?? messageOf(e));
    } finally {
      setSending(false);
    }
  }

  async function attach(pick: () => Promise<PickResult>) {
    setAttachOpen(false);
    // iOS will not present the picker while the menu is still closing.
    await new Promise((resolve) => setTimeout(resolve, MENU_CLOSE_MS));
    const result = await pick();
    if (!result) return;
    if ('error' in result) return setSendError(result.error);
    await sendFile(result.file);
  }

  const sendFile = (file: Picked) =>
    upload(`/api/v1/conversations/${id}/attachments`, formWith('file', file, { reply_to_id: replyTo?.id }));

  async function startRecording() {
    setSendError('');
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) return setSendError('Allow microphone access in Settings to record a voice message.');
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      // The server refuses a voice note over five minutes, so it is sent at the cap.
      capTimer.current = setTimeout(() => stopLatest.current?.(true), MAX_VOICE_SECONDS * 1000);
    } catch {
      setSendError('Recording could not start. Please try again.');
    }
  }

  async function stopRecording(keep: boolean) {
    if (capTimer.current) clearTimeout(capTimer.current);
    capTimer.current = null;
    const seconds = Math.min(MAX_VOICE_SECONDS, Math.round(recorderState.durationMillis / 1000));
    await recorder.stop();
    setRecording(false);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (!keep || !recorder.uri) return;
    if (seconds < 1) return setSendError('That was too short to send. Hold on a little longer.');

    await upload(
      `/api/v1/conversations/${id}/voice-messages`,
      formWith(
        'voice',
        { uri: recorder.uri, name: 'voice-message.m4a', type: 'audio/m4a' },
        { duration: seconds, reply_to_id: replyTo?.id },
      ),
    );
  }

  // The cap timer outlives the render that started it, so it calls the latest
  // stopRecording, which reads the current duration and reply.
  useEffect(() => {
    stopLatest.current = stopRecording;
  });
  useEffect(
    () => () => {
      if (capTimer.current) clearTimeout(capTimer.current);
    },
    [],
  );

  async function react(message: ChatMessage, emoji: string) {
    setMenuFor(null);
    const mineNow = message.reactions?.find((r) => r.mine)?.emoji;
    try {
      const result =
        mineNow === emoji
          ? await api.delete<{ data: { reactions: ChatMessage['reactions'] } }>(
              `/api/v1/messages/${message.id}/reaction`,
            )
          : await api.put<{ data: { reactions: ChatMessage['reactions'] } }>(
              `/api/v1/messages/${message.id}/reaction`,
              {
                emoji,
              },
            );
      setMessages((current) =>
        current.map((m) => (m.id === message.id ? { ...m, reactions: result.data.reactions } : m)),
      );
    } catch (e) {
      setSendError(messageOf(e));
    }
  }

  function unsend(message: ChatMessage) {
    setMenuFor(null);
    Alert.alert('Unsend this message?', 'It will be removed for both of you.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Unsend',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/api/v1/messages/${message.id}`);
            setMessages((current) => current.filter((m) => m.id !== message.id));
          } catch (e) {
            setSendError(messageOf(e));
          }
        },
      },
    ]);
  }

  const menuActions = menuFor
    ? [
        {
          label: 'Reply',
          onPress: () => {
            setEditing(null);
            setReplyTo(menuFor);
            setMenuFor(null);
          },
        },
        ...(menuFor.is_mine && !menuFor.attachment_type
          ? [
              {
                label: 'Edit',
                onPress: () => {
                  setReplyTo(null);
                  setEditing(menuFor);
                  setText(menuFor.body);
                  setMenuFor(null);
                },
              },
            ]
          : []),
        ...(menuFor.is_mine ? [{ label: 'Unsend', destructive: true, onPress: () => unsend(menuFor) }] : []),
        { label: 'Cancel', onPress: () => setMenuFor(null) },
      ]
    : [];

  const canSend = !!text.trim() && !sending;

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
            renderItem={({ item }) => (
              <Bubble
                message={item}
                onLongPress={() => setMenuFor(item)}
                onReact={(emoji) => react(item, emoji)}
                onError={setSendError}
              />
            )}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loadingOlder ? <ActivityIndicator /> : undefined}
            contentContainerStyle={styles.thread}
          />
        )}
        {typingUntil ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.typing}>
            {`${title || 'They'} is typing…`}
          </ThemedText>
        ) : null}

        <View style={[styles.composer, { borderTopColor: theme.backgroundElement }]}>
          {sendError ? <ErrorText>{sendError}</ErrorText> : null}
          {replyTo || editing ? (
            <View style={[styles.banner, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" numberOfLines={1} style={styles.shrink}>
                {editing
                  ? 'Editing message'
                  : `Replying to ${replyTo!.is_mine ? 'yourself' : (replyTo!.user?.name ?? title)}: ${messageText(replyTo!.body, replyTo!.attachment_type)}`}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={editing ? 'Stop editing' : 'Cancel reply'}
                onPress={() => {
                  if (editing) setText('');
                  setEditing(null);
                  setReplyTo(null);
                }}
                style={styles.iconButton}>
                <ThemedText>✕</ThemedText>
              </Pressable>
            </View>
          ) : null}

          {recording ? (
            <View style={styles.composerRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Discard recording"
                onPress={() => stopRecording(false)}
                style={styles.iconButton}>
                <SymbolView name="trash" tintColor={DANGER} size={22} />
              </Pressable>
              <ThemedText style={styles.recordingText}>
                {`● Recording ${formatDuration(recorderState.durationMillis / 1000)}`}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send voice message"
                onPress={() => stopRecording(true)}
                style={[styles.send, { backgroundColor: theme.primary }]}>
                <ThemedText type="smallBold" style={styles.sendText}>
                  Send
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.composerRow}>
              {!editing ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Attach"
                  disabled={sending}
                  onPress={() => {
                    Keyboard.dismiss();
                    setAttachOpen(true);
                  }}
                  style={styles.iconButton}>
                  <SymbolView name="plus.circle.fill" tintColor={theme.primary} size={26} />
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={emojiOpen ? 'Hide emoji' : 'Emoji'}
                onPress={() => {
                  Keyboard.dismiss();
                  setEmojiOpen((open) => !open);
                }}
                style={styles.iconButton}>
                <SymbolView name={emojiOpen ? 'keyboard' : 'face.smiling'} tintColor={theme.textSecondary} size={24} />
              </Pressable>
              <TextInput
                accessibilityLabel="Message"
                placeholder="Message"
                placeholderTextColor={theme.textSecondary}
                value={text}
                onChangeText={onChangeText}
                onFocus={() => setEmojiOpen(false)}
                multiline
                maxLength={5000}
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
              {text.trim() || editing ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={editing ? 'Save' : 'Send'}
                  accessibilityState={{ disabled: !canSend, busy: sending }}
                  disabled={!canSend}
                  onPress={send}
                  style={({ pressed }) => [
                    styles.send,
                    { backgroundColor: theme.primary },
                    (pressed || !canSend) && { opacity: 0.5 },
                  ]}>
                  {sending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <ThemedText type="smallBold" style={styles.sendText}>
                      {editing ? 'Save' : 'Send'}
                    </ThemedText>
                  )}
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Record voice message"
                  disabled={sending}
                  onPress={startRecording}
                  style={[styles.send, { backgroundColor: theme.primary }]}>
                  {sending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <SymbolView name="mic.fill" tintColor="#fff" size={20} />
                  )}
                </Pressable>
              )}
            </View>
          )}
          {emojiOpen ? <EmojiTray onPick={(emoji) => setText((current) => current + emoji)} /> : null}
        </View>
      </KeyboardAvoidingView>

      <ActionSheet
        visible={menuFor !== null}
        reactions={REACTIONS}
        onReact={(emoji) => menuFor && react(menuFor, emoji)}
        actions={menuActions}
        onClose={() => setMenuFor(null)}
      />
      <ActionSheet
        visible={attachOpen}
        actions={[
          { label: 'Take photo', onPress: () => attach(takePhoto) },
          { label: 'Photo library', onPress: () => attach(pickPhoto) },
          { label: 'Document', onPress: () => attach(pickDocument) },
          { label: 'Cancel', onPress: () => setAttachOpen(false) },
        ]}
        onClose={() => setAttachOpen(false)}
      />
    </SafeAreaView>
  );
}

function Bubble({
  message,
  onLongPress,
  onReact,
  onError,
}: {
  message: ChatMessage;
  onLongPress: () => void;
  onReact: (emoji: string) => void;
  onError: (text: string) => void;
}) {
  const theme = useTheme();
  const mine = message.is_mine;
  const reactions = message.reactions ?? [];

  // A photo sits on the page as it is, with no coloured bubble around it, so
  // any text with it uses the page colours rather than the bubble's white.
  const photo = message.attachment_type === 'image';
  const onColour = mine && !photo;

  return (
    <View style={mine ? styles.mine : styles.theirs}>
      <Pressable
        accessibilityHint="Long press for reply, reactions and more"
        onLongPress={onLongPress}
        delayLongPress={300}
        style={[
          styles.bubble,
          photo ? styles.photoBubble : { backgroundColor: mine ? theme.primary : theme.backgroundElement },
        ]}>
        {message.reply_to ? (
          <ThemedText
            type="small"
            numberOfLines={2}
            style={[styles.quote, onColour && styles.lightMuted]}
            themeColor={onColour ? undefined : 'textSecondary'}>
            {`${message.reply_to.user_name ?? 'Reply'}: ${message.reply_to.body || 'Attachment'}`}
          </ThemedText>
        ) : null}
        {message.attachment_type ? (
          <Attachment message={message} onError={onError} onLongPress={onLongPress} />
        ) : (
          <ThemedText style={mine ? styles.light : undefined}>
            {messageText(message.body, message.attachment_type)}
          </ThemedText>
        )}
        {message.edited ? (
          <ThemedText
            type="small"
            style={onColour ? styles.lightMuted : undefined}
            themeColor={onColour ? undefined : 'textSecondary'}>
            edited
          </ThemedText>
        ) : null}
      </Pressable>
      {reactions.length ? (
        <View style={[styles.reactionRow, mine && styles.reactionRowMine]}>
          {reactions.map((r) => (
            <Pressable
              key={r.emoji}
              accessibilityRole="button"
              accessibilityLabel={`${r.emoji} ${r.count}${r.mine ? ', yours. Tap to remove' : ''}`}
              onPress={() => onReact(r.emoji)}
              style={[styles.reactionChip, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small">{r.count > 1 ? `${r.emoji} ${r.count}` : r.emoji}</ThemedText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  shrink: { flexShrink: 1 },
  padded: { padding: Spacing.three },
  thread: { padding: Spacing.three, gap: Spacing.two },
  bubble: { borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.half },
  photoBubble: { padding: 0 },
  mine: { alignSelf: 'flex-end', maxWidth: '80%', alignItems: 'flex-end' },
  theirs: { alignSelf: 'flex-start', maxWidth: '80%', alignItems: 'flex-start' },
  quote: { borderLeftWidth: 2, borderLeftColor: 'rgba(127,127,127,0.5)', paddingLeft: Spacing.two },
  light: { color: '#fff' },
  lightMuted: { color: 'rgba(255,255,255,0.8)' },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: -Spacing.one },
  reactionRowMine: { justifyContent: 'flex-end' },
  reactionChip: {
    borderRadius: 12,
    paddingHorizontal: Spacing.two,
    minHeight: 28,
    justifyContent: 'center',
  },
  typing: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.one },
  composer: { padding: Spacing.two, gap: Spacing.one, borderTopWidth: StyleSheet.hairlineWidth },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.one },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingLeft: Spacing.three,
    gap: Spacing.two,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  recordingText: { flex: 1, alignSelf: 'center', color: DANGER },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
  },
  send: {
    height: 44,
    minWidth: 56,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  sendText: { color: '#fff' },
});
