import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { freshLink } from '@/lib/chat-media';
import type { ChatMessage } from '@/lib/types';

export const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

// A short set people reach for most in a chat; the keyboard's own emoji key
// has the rest.
export const EMOJIS = [
  '😀',
  '😂',
  '🥹',
  '😍',
  '😘',
  '😊',
  '😉',
  '😎',
  '🤔',
  '😅',
  '😭',
  '😢',
  '😡',
  '😮',
  '🙄',
  '😴',
  '👍',
  '👎',
  '👏',
  '🙏',
  '💪',
  '🙌',
  '👋',
  '🤝',
  '❤️',
  '🔥',
  '✨',
  '🎉',
  '💯',
  '✅',
  '👀',
  '🎶',
];

export function EmojiTray({ onPick }: { onPick: (emoji: string) => void }) {
  const theme = useTheme();

  return (
    <View testID="emoji-tray" style={[styles.tray, { backgroundColor: theme.backgroundElement }]}>
      {EMOJIS.map((emoji) => (
        <Pressable
          key={emoji}
          accessibilityRole="button"
          accessibilityLabel={`Add ${emoji}`}
          onPress={() => onPick(emoji)}
          style={styles.emojiKey}>
          <ThemedText style={styles.emoji}>{emoji}</ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

type AttachmentProps = {
  message: ChatMessage;
  onError: (text: string) => void;
  // On a phone the inner button takes the whole touch, so a long press has to
  // be handled here too or the bubble's menu never opens for a file.
  onLongPress?: () => void;
};

/** The photo, document or voice note inside a bubble. */
export function Attachment(props: AttachmentProps) {
  if (props.message.attachment_type === 'image') return <Photo {...props} />;
  if (props.message.attachment_type === 'voice') return <VoiceNote {...props} />;
  if (props.message.attachment_type === 'file') return <Document {...props} />;

  return null;
}

function Photo({ message, onError, onLongPress }: AttachmentProps) {
  const [uri, setUri] = useState(message.attachment_url ?? null);
  const [retried, setRetried] = useState(false);
  const [open, setOpen] = useState(false);
  // The signed link changes on every fetch; the id keeps one cached copy.
  const source = uri ? { uri, cacheKey: `dm-${message.id}` } : null;

  async function refresh() {
    if (retried) return;
    setRetried(true);
    try {
      setUri(await freshLink(message.id));
    } catch {
      onError('That photo could not be loaded.');
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel="Photo"
        onPress={() => setOpen(true)}
        onLongPress={onLongPress}
        delayLongPress={300}>
        <Image source={source} style={styles.photo} contentFit="cover" onError={refresh} transition={150} />
      </Pressable>
      <Modal visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.viewer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            onPress={() => setOpen(false)}
            style={styles.close}>
            <ThemedText style={styles.light}>Close</ThemedText>
          </Pressable>
          <Image source={source} style={styles.fill} contentFit="contain" />
        </SafeAreaView>
      </Modal>
    </>
  );
}

function Document({ message, onError, onLongPress }: AttachmentProps) {
  const theme = useTheme();
  const [opening, setOpening] = useState(false);

  async function open() {
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(await freshLink(message.id));
    } catch {
      onError('That file could not be opened. Please try again.');
    } finally {
      setOpening(false);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${message.attachment_name ?? 'file'}`}
      onPress={open}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={styles.row}>
      {opening ? (
        <ActivityIndicator color={message.is_mine ? '#fff' : undefined} />
      ) : (
        <SymbolView name="doc.fill" tintColor={message.is_mine ? '#fff' : theme.textSecondary} size={20} />
      )}
      <ThemedText numberOfLines={2} style={[styles.shrink, message.is_mine && styles.light]}>
        {message.attachment_name ?? 'File'}
      </ThemedText>
    </Pressable>
  );
}

function VoiceNote({ message, onError, onLongPress }: AttachmentProps) {
  const theme = useTheme();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const total = message.attachment_duration ?? 0;
  const playing = status.playing;

  async function toggle() {
    if (playing) return player.pause();
    try {
      if (!loaded) {
        setLoading(true);
        await setAudioModeAsync({ playsInSilentMode: true });
        player.replace({ uri: await freshLink(message.id) });
        setLoaded(true);
      } else if (status.didJustFinish || (status.duration && status.currentTime >= status.duration)) {
        await player.seekTo(0);
      }
      player.play();
    } catch {
      onError('That voice message could not be played.');
    } finally {
      setLoading(false);
    }
  }

  const shown = playing || status.currentTime > 0 ? status.currentTime : total;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause voice message' : 'Play voice message'}
      onPress={toggle}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={styles.row}>
      {loading ? (
        <ActivityIndicator color={message.is_mine ? '#fff' : undefined} />
      ) : (
        <SymbolView
          name={playing ? 'pause.fill' : 'play.fill'}
          tintColor={message.is_mine ? '#fff' : theme.text}
          size={18}
        />
      )}
      <ThemedText
        style={message.is_mine ? styles.light : undefined}>{`Voice message · ${formatDuration(shown)}`}</ThemedText>
    </Pressable>
  );
}

type Action = { label: string; onPress: () => void; destructive?: boolean };

/** A bottom menu: what a long press on a message offers, or the attach choices. */
export function ActionSheet({
  visible,
  actions,
  reactions,
  onReact,
  onClose,
}: {
  visible: boolean;
  actions: Action[];
  reactions?: string[];
  onReact?: (emoji: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close menu" style={styles.backdrop} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          {reactions && onReact ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reactions}>
              {reactions.map((emoji) => (
                <Pressable
                  key={emoji}
                  accessibilityRole="button"
                  accessibilityLabel={`React ${emoji}`}
                  onPress={() => onReact(emoji)}
                  style={styles.emojiKey}>
                  <ThemedText style={styles.reaction}>{emoji}</ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={action.onPress}
              style={({ pressed }) => [styles.action, pressed && { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={action.destructive ? styles.destructive : undefined}>{action.label}</ThemedText>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  light: { color: '#fff' },
  shrink: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 32 },
  photo: { width: 220, height: 220, borderRadius: 12 },
  viewer: { flex: 1, backgroundColor: '#000' },
  close: { alignSelf: 'flex-end', padding: Spacing.three, minHeight: 44 },
  tray: { flexDirection: 'row', flexWrap: 'wrap', padding: Spacing.one, borderRadius: 12 },
  emojiKey: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 26, lineHeight: 32 },
  reaction: { fontSize: 30, lineHeight: 36 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: Spacing.two,
    paddingBottom: Spacing.five,
  },
  reactions: { paddingHorizontal: Spacing.two, gap: Spacing.one },
  action: { paddingHorizontal: Spacing.four, minHeight: 48, justifyContent: 'center' },
  destructive: { color: '#DC2626' },
});
