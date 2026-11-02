import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Field } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { PLATFORM } from '@/lib/config';
import { api, useSession } from '@/lib/session';

// The server's own floor for the topic, so the button never offers a booking
// it will refuse.
const MIN_TOPIC = 10;

type Slots = { slots: string[] } | { error: string };

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

export const slotLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

// Slots come every few minutes for weeks ahead, so the screen shows one day's
// times at a time instead of hundreds of buttons.
const dayKey = (iso: string) => new Date(iso).toDateString();
const daysOf = (slots: string[]) => [...new Set(slots.map(dayKey))];
const dayLabel = (key: string) =>
  new Date(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

// Times sit in equal columns so the grid lines up on any screen: three on a
// phone, more on a tablet, each wide enough for "12:45 PM".
const MIN_TIME_WIDTH = 96;
const timeColumns = (screenWidth: number) => {
  const inner = Math.min(screenWidth, MaxContentWidth) - Spacing.three * 2;
  const columns = Math.max(3, Math.floor((inner + Spacing.two) / (MIN_TIME_WIDTH + Spacing.two)));
  return { columns, width: (inner - Spacing.two * (columns - 1)) / columns };
};

export default function BookConsultation() {
  const { offering, title, price, creator } = useLocalSearchParams<{
    offering: string;
    title: string;
    price: string;
    creator: string;
  }>();
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const timeWidth = timeColumns(screenWidth).width;
  const { launch, reload } = useSession();
  const signedIn = launch?.route === 'home' ? launch : null;
  const balance = signedIn?.me.credit_balance ?? 0;
  const topUpUrl = signedIn?.config.top_up?.link_enabled?.[PLATFORM] ? signedIn.config.top_up.url : undefined;
  const credits = Number(price);
  const shortBy = credits - balance;

  const [slots, setSlots] = useState<Slots | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: string[] }>(`/api/v1/consultations/offerings/${offering}/slots`)
      .then((response) => !cancelled && setSlots({ slots: response.data }))
      .catch((e) => !cancelled && setSlots({ error: messageOf(e) }));

    return () => {
      cancelled = true;
    };
  }, [offering]);

  // The server is the authority on price, balance and whether the time is still
  // free; a refusal from it is shown as is.
  async function book() {
    if (!picked) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/api/v1/consultations/bookings', {
        consultation_offering_id: Number(offering),
        scheduled_for: picked,
        topic: topic.trim(),
      });
      await reload();
      router.replace('/consultations/mine');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    Alert.alert('Book this consultation?', `This uses ${credits} of your ${balance} credits.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Book', onPress: book },
    ]);
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: true, title: 'Book', headerBackTitle: 'Back' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">{title}</ThemedText>
        <ThemedText themeColor="textSecondary">{`With ${creator} · ${credits} credits`}</ThemedText>

        <ThemedText type="smallBold">Pick a time</ThemedText>
        {!slots ? (
          <ActivityIndicator />
        ) : 'error' in slots ? (
          <ErrorText>{slots.error}</ErrorText>
        ) : slots.slots.length === 0 ? (
          <ThemedText themeColor="textSecondary">No open times in the next few weeks.</ThemedText>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.dayStrip}
              contentContainerStyle={styles.days}>
              {daysOf(slots.slots).map((key) => {
                const selected = key === (day ?? daysOf(slots.slots)[0]);
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="tab"
                    accessibilityLabel={dayLabel(key)}
                    accessibilityState={{ selected }}
                    onPress={() => setDay(key)}
                    style={[
                      styles.slot,
                      { borderColor: theme.primary },
                      selected && { backgroundColor: theme.primary },
                    ]}>
                    <ThemedText type="small" style={selected ? styles.selectedText : undefined}>
                      {dayLabel(key)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.slots}>
              {slots.slots
                .filter((slot) => dayKey(slot) === (day ?? daysOf(slots.slots)[0]))
                .map((slot) => {
                  const selected = picked === slot;
                  return (
                    <Pressable
                      key={slot}
                      accessibilityRole="radio"
                      accessibilityLabel={slotLabel(slot)}
                      accessibilityState={{ checked: selected }}
                      onPress={() => setPicked(slot)}
                      style={[
                        styles.slot,
                        styles.time,
                        { width: timeWidth, borderColor: theme.primary },
                        selected && { backgroundColor: theme.primary },
                      ]}>
                      <ThemedText type="small" numberOfLines={1} style={selected ? styles.selectedText : undefined}>
                        {timeLabel(slot)}
                      </ThemedText>
                    </Pressable>
                  );
                })}
            </View>
          </>
        )}

        <Field
          label="What would you like to cover?"
          value={topic}
          onChangeText={setTopic}
          multiline
          maxLength={2000}
          placeholder="A sentence or two helps them prepare."
        />

        {shortBy > 0 ? (
          <>
            <ThemedText themeColor="textSecondary">{`You need ${shortBy} more credits to book this.`}</ThemedText>
            {topUpUrl ? <Button label="Buy credits" onPress={() => WebBrowser.openBrowserAsync(topUpUrl)} /> : null}
          </>
        ) : (
          <Button
            label={`Book for ${credits} credits`}
            busy={busy}
            disabled={!picked || topic.trim().length < MIN_TOPIC}
            onPress={confirm}
          />
        )}
        {error ? <ErrorText>{error}</ErrorText> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  // The strip runs to the screen edges so a cut-off chip reads as "scroll for more".
  dayStrip: { marginHorizontal: -Spacing.three },
  days: { gap: Spacing.two, paddingHorizontal: Spacing.three },
  time: { paddingHorizontal: 0, alignItems: 'center' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  slot: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
  },
  selectedText: { color: '#fff' },
});
