import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import { ActionSheet, Attachment, AttachmentLinks, EmojiSheet, formatDuration } from '@/components/chat';
import { ThemedText } from '@/components/themed-text';
import { Avatar, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { formWith, pickDocument, pickPhoto, takePhoto, type Picked, type PickResult } from '@/lib/chat-media';
import { messageText } from '@/lib/messages';
import type { ThreadChannel, ThreadEvents } from '@/lib/realtime';
import { api } from '@/lib/session';
import type { ChatMessage } from '@/lib/types';

// Without a realtime connection an open thread checks on this interval; with
// one, the slower check only catches anything a dropped socket missed.
const POLL_MS = 5000;
const LIVE_POLL_MS = 30000;
const TYPING_SHOWN_MS = 4000;
const TYPING_SENT_EVERY_MS = 3000;
const MENU_CLOSE_MS = 400;
const DANGER = '#DC2626';
const AVATAR_SIZE = 28;
// The server's cap on a voice note, the same for both chats.
const MAX_VOICE_SECONDS = 300;
// The same list the server accepts (MessageReaction::EMOJIS).
const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍', '🔥', '🙏'];

export type ThreadPage<Header = unknown> = {
  data: Header;
  messages: ChatMessage[];
  meta: { current_page: number; last_page: number };
};

/** Where one kind of chat keeps its messages. A direct message and a circle differ only here. */
export type ThreadPaths = {
  page: string;
  send: string;
  voice: string;
  attachment: string;
  message: (id: number) => string;
  reaction: (id: number) => string;
  link: (id: number) => string;
};

type Props<Header> = {
  paths: ThreadPaths;
  // Kept stable by the screen (useCallback), or the thread rejoins each render.
  join: (events: ThreadEvents) => ThreadChannel | null;
  // Module-level in each screen, so it never changes between renders.
  describe: (header: Header) => { title: string; photo?: string | null };
  initialTitle?: string;
  headerAvatar?: boolean;
  backTitle: string;
  // A group chat names each sender and who is typing.
  group?: boolean;
  placeholder?: string;
  maxLength: number;
  unsendNote: string;
  emptyText?: string;
  cachePrefix: string;
};

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

/** Newer copies replace what is shown (edits, reactions, fresh links); new ids go on the end. */
export function mergeLatest(current: ChatMessage[], latest: ChatMessage[]): ChatMessage[] {
  const byId = new Map(latest.map((m) => [m.id, m]));
  const known = new Set(current.map((m) => m.id));

  return [...current.map((m) => byId.get(m.id) ?? m), ...latest.filter((m) => !known.has(m.id))];
}

const sameSender = (a: ChatMessage, b: ChatMessage | undefined) =>
  !!b && !b.is_mine && a.user?.id !== undefined && a.user?.id === b.user?.id;

/** One chat thread: direct messages and circles draw the same screen from their own endpoints. */
export function ChatThread<Header>({
  paths,
  join,
  describe,
  initialTitle = '',
  headerAvatar = false,
  backTitle,
  group = false,
  placeholder = 'Message',
  maxLength,
  unsendNote,
  emptyText,
  cachePrefix,
}: Props<Header>) {
  const theme = useTheme();
  const pagePath = paths.page;

  const [title, setTitle] = useState(initialTitle);
  const [photo, setPhoto] = useState<string | null>(null);
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
  const [typing, setTyping] = useState<{ until: number; name?: string }>({ until: 0 });

  const channel = useRef<ThreadChannel | null>(null);
  const lastTypingSent = useRef(0);
  const capTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopLatest = useRef<((keep: boolean) => Promise<void>) | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);

  const fetchPage = useCallback(
    (n = 1) => api.get<ThreadPage<Header>>(n > 1 ? `${pagePath}?page=${n}` : pagePath),
    [pagePath],
  );

  const refreshLatest = useCallback(
    () =>
      fetchPage()
        .then((latest) => setMessages((current) => mergeLatest(current, latest.messages)))
        .catch(() => {}),
    [fetchPage],
  );

  useEffect(() => {
    let cancelled = false;
    fetchPage()
      .then((first) => {
        if (cancelled) return;
        const header = describe(first.data);
        setTitle(header.title);
        setPhoto(header.photo ?? null);
        setMessages(first.messages);
        setPage(first.meta.current_page);
        setLastPage(first.meta.last_page);
      })
      .catch((e) => !cancelled && setLoadError(messageOf(e)))
      .finally(() => !cancelled && setLoading(false));

    channel.current = join({
      onChange: () => !cancelled && refreshLatest(),
      onDeleted: (messageId) => !cancelled && setMessages((current) => current.filter((m) => m.id !== messageId)),
      onTyping: (name) => !cancelled && setTyping({ until: Date.now() + TYPING_SHOWN_MS, name }),
    });

    const timer = setInterval(() => !cancelled && refreshLatest(), channel.current ? LIVE_POLL_MS : POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      channel.current?.leave();
      channel.current = null;
    };
  }, [fetchPage, join, describe, refreshLatest]);

  // Clears the "typing" line once they stop.
  useEffect(() => {
    if (!typing.until) return;
    const timer = setTimeout(() => setTyping({ until: 0 }), Math.max(0, typing.until - Date.now()));

    return () => clearTimeout(timer);
  }, [typing.until]);

  async function loadOlder() {
    if (loading || loadingOlder || page >= lastPage) return;
    setLoadingOlder(true);
    try {
      const older = await fetchPage(page + 1);
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
        const saved = await api.put<{ data: { id: number; body: string } }>(paths.message(editing.id), { body });
        setMessages((current) =>
          current.map((m) => (m.id === editing.id ? { ...m, body: saved.data.body, edited: true } : m)),
        );
        setEditing(null);
      } else {
        const sent = await api.post<{ data: ChatMessage }>(paths.send, { body, reply_to_id: replyTo?.id ?? null });
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

  const sendFile = (file: Picked) => upload(paths.attachment, formWith('file', file, { reply_to_id: replyTo?.id }));

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
      paths.voice,
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
          ? await api.delete<{ data: { reactions: ChatMessage['reactions'] } }>(paths.reaction(message.id))
          : await api.put<{ data: { reactions: ChatMessage['reactions'] } }>(paths.reaction(message.id), { emoji });
      setMessages((current) =>
        current.map((m) => (m.id === message.id ? { ...m, reactions: result.data.reactions } : m)),
      );
    } catch (e) {
      setSendError(messageOf(e));
    }
  }

  function unsend(message: ChatMessage) {
    setMenuFor(null);
    Alert.alert('Unsend this message?', unsendNote, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Unsend',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(paths.message(message.id));
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

  const linkPath = paths.link;
  const links = useMemo(
    () => ({
      renew: async (id: number) => (await api.get<{ data: { url: string } }>(linkPath(id))).data.url,
      cachePrefix,
    }),
    [linkPath, cachePrefix],
  );

  const canSend = !!text.trim() && !sending;
  const newestFirst = [...messages].reverse();
  const typist = group ? (typing.name ?? 'Someone') : title || 'They';

  return (
    <SafeAreaView edges={['bottom']} style={[styles.fill, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title,
          headerBackTitle: backTitle,
          headerTitle: () => (
            <View style={styles.headerTitle}>
              {headerAvatar ? <Avatar uri={photo} name={title || 'Nalar member'} size={32} /> : null}
              <ThemedText type="smallBold" numberOfLines={1}>
                {title}
              </ThemedText>
            </View>
          ),
        }}
      />
      <AttachmentLinks.Provider value={links}>
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
              data={newestFirst}
              keyExtractor={(m) => String(m.id)}
              renderItem={({ item, index }) => (
                <Bubble
                  message={item}
                  // Photo beside the newest of each run of theirs, name over the oldest.
                  showAvatar={!item.is_mine && !sameSender(item, newestFirst[index - 1])}
                  showName={group && !item.is_mine && !sameSender(item, newestFirst[index + 1])}
                  onLongPress={() => setMenuFor(item)}
                  onReact={(emoji) => react(item, emoji)}
                  onError={setSendError}
                />
              )}
              onEndReached={loadOlder}
              onEndReachedThreshold={0.3}
              ListFooterComponent={loadingOlder ? <ActivityIndicator /> : undefined}
              ListEmptyComponent={
                emptyText ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                    {emptyText}
                  </ThemedText>
                ) : undefined
              }
              contentContainerStyle={styles.thread}
            />
          )}
          {typing.until ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.typing}>
              {`${typist} is typing…`}
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
                  accessibilityLabel="Emoji"
                  onPress={() => {
                    Keyboard.dismiss();
                    setEmojiOpen(true);
                  }}
                  style={styles.iconButton}>
                  <SymbolView name="face.smiling" tintColor={theme.textSecondary} size={24} />
                </Pressable>
                <TextInput
                  accessibilityLabel="Message"
                  placeholder={placeholder}
                  placeholderTextColor={theme.textSecondary}
                  value={text}
                  onChangeText={onChangeText}
                  multiline
                  maxLength={maxLength}
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
          </View>
        </KeyboardAvoidingView>
      </AttachmentLinks.Provider>

      <EmojiSheet
        open={emojiOpen}
        onClose={() => setEmojiOpen(false)}
        onPick={(emoji) => setText((current) => current + emoji)}
      />

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
  showAvatar,
  showName,
  onLongPress,
  onReact,
  onError,
}: {
  message: ChatMessage;
  showAvatar: boolean;
  showName: boolean;
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

  const bubble = (
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
  );

  const reactionRow = reactions.length ? (
    <View style={[styles.reactionRow, mine ? styles.reactionRowMine : styles.reactionRowTheirs]}>
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
  ) : null;

  if (mine) {
    return (
      <View style={styles.mine}>
        {bubble}
        {reactionRow}
      </View>
    );
  }

  // Like other messaging apps, the other person's photo sits beside the last
  // message of each run of theirs; earlier ones keep the space so they line up.
  return (
    <View style={styles.theirs}>
      {showName ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.sender}>
          {message.user?.name ?? 'Nalar member'}
        </ThemedText>
      ) : null}
      <View style={styles.theirsRow}>
        {showAvatar ? (
          <Avatar
            uri={message.user?.profile_photo_url}
            name={message.user?.name ?? 'Nalar member'}
            size={AVATAR_SIZE}
          />
        ) : (
          <View style={styles.avatarSpace} />
        )}
        <View style={styles.shrink}>{bubble}</View>
      </View>
      {reactionRow}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  shrink: { flexShrink: 1 },
  padded: { padding: Spacing.three },
  thread: { padding: Spacing.three, gap: Spacing.two },
  // The list is drawn upside down, so its empty line is turned back.
  empty: { textAlign: 'center', paddingVertical: Spacing.five, transform: [{ scaleY: -1 }] },
  bubble: { borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.half },
  photoBubble: { padding: 0 },
  mine: { alignSelf: 'flex-end', maxWidth: '80%', alignItems: 'flex-end' },
  theirs: { alignSelf: 'flex-start', maxWidth: '85%', alignItems: 'flex-start' },
  theirsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  sender: { marginLeft: AVATAR_SIZE + Spacing.two + Spacing.one, marginBottom: 2 },
  avatarSpace: { width: AVATAR_SIZE },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, maxWidth: 240 },
  quote: { borderLeftWidth: 2, borderLeftColor: 'rgba(127,127,127,0.5)', paddingLeft: Spacing.two },
  light: { color: '#fff' },
  lightMuted: { color: 'rgba(255,255,255,0.8)' },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: -Spacing.one },
  reactionRowMine: { justifyContent: 'flex-end' },
  // Under the bubble, past the photo column.
  reactionRowTheirs: { marginLeft: AVATAR_SIZE + Spacing.two },
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
