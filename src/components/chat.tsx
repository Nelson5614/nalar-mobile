import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import emojiData from 'rn-emoji-keyboard/lib/commonjs/assets/emojis.json';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { freshLink } from '@/lib/chat-media';
import type { ChatMessage } from '@/lib/types';

/**
 * Where a thread renews an expired file link. Direct messages and circles
 * keep their files apart and their ids overlap, so each keys its own cache.
 */
export const AttachmentLinks = createContext<{ renew: (messageId: number) => Promise<string>; cachePrefix: string }>({
  renew: freshLink,
  cachePrefix: 'dm',
});

export const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

type EmojiEntry = { emoji: string; name: string; keywords?: string[] };

// Category order and icons for the sheet's tabs. The data is the full Unicode
// set that ships with rn-emoji-keyboard; its own picker calls an API React
// Native has removed, so the sheet is drawn here.
const EMOJI_TABS: { key: string; label: string; icon: SymbolViewProps['name'] }[] = [
  { key: 'smileys_emotion', label: 'Smileys', icon: 'face.smiling' },
  { key: 'people_body', label: 'People', icon: 'person.2' },
  { key: 'animals_nature', label: 'Animals and nature', icon: 'leaf' },
  { key: 'food_drink', label: 'Food and drink', icon: 'fork.knife' },
  { key: 'travel_places', label: 'Travel and places', icon: 'car' },
  { key: 'activities', label: 'Activities', icon: 'soccerball' },
  { key: 'objects', label: 'Objects', icon: 'lightbulb' },
  { key: 'symbols', label: 'Symbols', icon: 'heart' },
  { key: 'flags', label: 'Flags', icon: 'flag' },
];
const EMOJIS_BY_CATEGORY = new Map(
  (emojiData as { title: string; data: EmojiEntry[] }[]).map((c) => [c.title, c.data]),
);
const ALL_EMOJIS = [...EMOJIS_BY_CATEGORY.values()].flat();
const EMOJI_COLUMNS = 8;
const RECENT_LIMIT = 24;

export function searchEmojis(query: string): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return ALL_EMOJIS.filter((e) => e.name.includes(q) || e.keywords?.some((k) => k.includes(q))).slice(0, 200);
}

/** Every emoji, by category, with search and the ones used recently. */
export function EmojiSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
}) {
  const theme = useTheme();
  const [tab, setTab] = useState('smileys_emotion');
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<EmojiEntry[]>([]);

  const shown = query.trim() ? searchEmojis(query) : tab === 'recent' ? recent : (EMOJIS_BY_CATEGORY.get(tab) ?? []);

  function pick(entry: EmojiEntry) {
    onPick(entry.emoji);
    setRecent((current) => [entry, ...current.filter((e) => e.emoji !== entry.emoji)].slice(0, RECENT_LIMIT));
  }

  const tabs = recent.length
    ? [{ key: 'recent', label: 'Recently used', icon: 'clock' as SymbolViewProps['name'] }, ...EMOJI_TABS]
    : EMOJI_TABS;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityLabel="Close emoji" style={styles.emojiBackdrop} onPress={onClose} />
        <SafeAreaView edges={['bottom']} style={[styles.emojiSheet, { backgroundColor: theme.background }]}>
          <View style={styles.emojiHeader}>
            <TextInput
              accessibilityLabel="Search emoji"
              placeholder="Search emoji"
              placeholderTextColor={theme.textSecondary}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              style={[styles.emojiSearch, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={onClose} style={styles.emojiDone}>
              <ThemedText type="smallBold" themeColor="primary">
                Done
              </ThemedText>
            </Pressable>
          </View>
          {!query.trim() ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiTabs}>
              {tabs.map((t) => (
                <Pressable
                  key={t.key}
                  accessibilityRole="tab"
                  accessibilityLabel={t.label}
                  accessibilityState={{ selected: tab === t.key }}
                  onPress={() => setTab(t.key)}
                  style={[styles.emojiTab, tab === t.key && { backgroundColor: theme.backgroundElement }]}>
                  <SymbolView name={t.icon} tintColor={tab === t.key ? theme.primary : theme.textSecondary} size={20} />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <FlatList
            key={query.trim() ? 'search' : tab}
            data={shown}
            numColumns={EMOJI_COLUMNS}
            keyExtractor={(e) => e.emoji}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={64}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.name}
                onPress={() => pick(item)}
                style={styles.emojiCell}>
                <ThemedText style={styles.emojiGlyph}>{item.emoji}</ThemedText>
              </Pressable>
            )}
            ListEmptyComponent={
              <ThemedText themeColor="textSecondary" style={styles.emojiEmpty}>
                {query.trim() ? 'No emoji match that.' : 'Nothing here yet.'}
              </ThemedText>
            }
          />
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
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
  const links = useContext(AttachmentLinks);
  // The signed link changes on every fetch; the id keeps one cached copy.
  const source = uri ? { uri, cacheKey: `${links.cachePrefix}-${message.id}` } : null;

  async function refresh() {
    if (retried) return;
    setRetried(true);
    try {
      setUri(await links.renew(message.id));
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
  const links = useContext(AttachmentLinks);

  async function open() {
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(await links.renew(message.id));
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
  const links = useContext(AttachmentLinks);
  const total = message.attachment_duration ?? 0;
  const playing = status.playing;

  async function toggle() {
    if (playing) return player.pause();
    try {
      if (!loaded) {
        setLoading(true);
        await setAudioModeAsync({ playsInSilentMode: true });
        player.replace({ uri: await links.renew(message.id) });
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
  emojiBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  emojiSheet: { height: '55%', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: Spacing.two },
  emojiHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three },
  emojiSearch: { flex: 1, minHeight: 40, borderRadius: 10, paddingHorizontal: Spacing.three, fontSize: 16 },
  emojiDone: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.one },
  emojiTabs: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, gap: Spacing.one },
  emojiTab: { width: 40, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  emojiCell: { flex: 1 / EMOJI_COLUMNS, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  emojiGlyph: { fontSize: 30, lineHeight: 38 },
  emojiEmpty: { padding: Spacing.three },
  fill: { flex: 1 },
  light: { color: '#fff' },
  shrink: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 32 },
  photo: { width: 220, height: 220, borderRadius: 12 },
  viewer: { flex: 1, backgroundColor: '#000' },
  close: { alignSelf: 'flex-end', padding: Spacing.three, minHeight: 44 },
  emojiKey: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
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
