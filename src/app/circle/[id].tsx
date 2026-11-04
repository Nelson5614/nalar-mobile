import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CircleCover } from '@/components/circles';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { circleMeta } from '@/lib/circles';
import { API_URL, PLATFORM } from '@/lib/config';
import { api, useSession } from '@/lib/session';
import { shortDate } from '@/lib/time';
import type { CircleDetail, CircleSession } from '@/lib/types';

type Loaded = { detail: CircleDetail; sessions: CircleSession[] } | { error: string };

const failure = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

const sessionTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

async function load(id: string): Promise<Loaded> {
  try {
    const [detail, sessions] = await Promise.all([
      api.get<CircleDetail>(`/api/v1/circles/${encodeURIComponent(id)}`),
      api
        .get<{ data: CircleSession[] }>(`/api/v1/circles/${encodeURIComponent(id)}/sessions`)
        .catch(() => ({ data: [] as CircleSession[] })),
    ]);

    return { detail, sessions: sessions.data.filter((s) => s.status === 'scheduled' || s.status === 'live') };
  } catch (e) {
    return { error: failure(e) };
  }
}

/**
 * A circle, as its web page lays it out: who runs it, what it costs, where my
 * membership stands, the chat, and the sessions coming up.
 */
export default function CircleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { reload } = useSession();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    load(id).then((result) => !cancelled && setLoaded(result));

    return () => {
      cancelled = true;
    };
  }, [id]);

  // A join or reactivation spent credits, so Me shows the new balance too.
  const afterChange = useCallback(async () => {
    await reload();
    setLoaded(await load(id));
  }, [id, reload]);

  const detail = loaded && 'detail' in loaded ? loaded.detail : null;
  const creator = detail?.circle.creator;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: '', headerBackTitle: 'Back' }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}>
        {!loaded ? (
          <ActivityIndicator style={styles.spinner} />
        ) : 'error' in loaded ? (
          <View style={styles.padded}>
            <ErrorText>{loaded.error}</ErrorText>
          </View>
        ) : (
          <>
            <CircleCover circle={loaded.detail.circle} style={styles.cover} />
            <View style={styles.padded}>
              <ThemedText style={styles.title}>{loaded.detail.circle.title}</ThemedText>
              {creator ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={creator.name}
                  onPress={() =>
                    router.push({ pathname: '/creator/[id]', params: { id: creator.public_id ?? String(creator.id) } })
                  }
                  style={styles.by}>
                  <Avatar uri={creator.profile_photo_url} name={creator.name} size={28} />
                  <ThemedText type="smallBold">{creator.name}</ThemedText>
                </Pressable>
              ) : null}
              <ThemedText type="small" themeColor="textSecondary">
                {circleMeta(loaded.detail.circle)}
              </ThemedText>
              {loaded.detail.circle.description ? <ThemedText>{loaded.detail.circle.description}</ThemedText> : null}

              <Membership detail={loaded.detail} onChanged={afterChange} />
            </View>

            <Sessions circleId={loaded.detail.circle.id} sessions={loaded.sessions} />
          </>
        )}
      </ScrollView>
    </>
  );
}

/**
 * Join, open the chat, leave, or reactivate, depending on where I stand. The
 * server is the authority on price and balance; the check here only decides
 * whether to offer Join or a top-up, and a refusal is shown as the server words it.
 */
function Membership({ detail, onChanged }: { detail: CircleDetail; onChanged: () => Promise<void> }) {
  const theme = useTheme();
  const { launch } = useSession();
  const signedIn = launch?.route === 'home' ? launch : null;
  const balance = signedIn?.me.credit_balance ?? 0;
  const topUpUrl = signedIn?.config.top_up?.link_enabled?.[PLATFORM] ? signedIn.config.top_up.url : undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { circle, membership } = detail;
  const price = circle.monthly_price_credits ?? 0;

  async function act(request: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await request();
      await onChanged();
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }

  const join = () => act(() => api.post(`/api/v1/circles/${circle.id}/join`));

  function confirmJoin() {
    if (circle.is_free) return join();
    Alert.alert(`Join ${circle.title}?`, `This uses ${price} of your ${balance} credits now, and renews monthly.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Join', onPress: join },
    ]);
  }

  function confirmLeave() {
    Alert.alert('Leave this circle?', 'You keep access until the end of the month you paid for.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => act(() => api.delete(`/api/v1/circle-memberships/${membership!.id}`)),
      },
    ]);
  }

  function confirmReactivate() {
    Alert.alert('Reactivate your membership?', `This uses ${price} of your ${balance} credits now.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reactivate',
        onPress: () => act(() => api.post(`/api/v1/circle-memberships/${membership!.id}/reactivate`)),
      },
    ]);
  }

  const openChat = () =>
    router.push({ pathname: '/circle/chat', params: { id: String(circle.id), title: circle.title } });
  const renews = shortDate(membership?.renews_at);
  const shortBy = circle.is_free ? 0 : price - balance;

  let body: React.ReactNode;

  if (detail.is_creator) {
    body = (
      <>
        <ThemedText type="smallBold">This is your circle.</ThemedText>
        <Button label="Open chat" onPress={openChat} />
      </>
    );
  } else if (membership?.status === 'active') {
    body = (
      <>
        <ThemedText type="smallBold">{renews ? `You’re a member · renews ${renews}` : 'You’re a member'}</ThemedText>
        <Button label="Open chat" onPress={openChat} />
        <Button label="Leave circle" variant="secondary" busy={busy} onPress={confirmLeave} />
      </>
    );
  } else if (membership?.status === 'paused') {
    body = (
      <>
        <ThemedText type="smallBold">Your membership is paused because a renewal could not be paid.</ThemedText>
        <Button label="Open chat" variant="secondary" onPress={openChat} />
        {balance >= price ? (
          <Button label={`Reactivate for ${price} credits`} busy={busy} onPress={confirmReactivate} />
        ) : (
          <ShortOf amount={price - balance} topUpUrl={topUpUrl} verb="reactivate" />
        )}
      </>
    );
  } else {
    // Never joined, or left. Rejoining inside a paid month costs nothing (RENEW-03).
    body = (
      <>
        {membership?.status === 'cancelled' ? (
          <ThemedText type="small">
            {renews ? `You left this circle. Your access runs until ${renews}.` : 'You left this circle.'}
          </ThemedText>
        ) : null}
        {shortBy > 0 ? (
          <ShortOf amount={shortBy} topUpUrl={topUpUrl} verb="join" />
        ) : (
          <Button
            label={circle.is_free ? 'Join for free' : `Join for ${price} credits a month`}
            busy={busy}
            onPress={confirmJoin}
          />
        )}
      </>
    );
  }

  return (
    <View style={[styles.panel, { backgroundColor: theme.backgroundElement }]}>
      {body}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

function ShortOf({ amount, topUpUrl, verb }: { amount: number; topUpUrl?: string; verb: string }) {
  return (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        You need {amount} more credits to {verb}.
      </ThemedText>
      {topUpUrl ? <Button label="Buy credits" onPress={() => WebBrowser.openBrowserAsync(topUpUrl)} /> : null}
    </>
  );
}

/**
 * What is coming up. A live session opens the web's room: Expo Go has no
 * LiveKit, so joining inside the app waits for the development build.
 */
function Sessions({ circleId, sessions }: { circleId: number; sessions: CircleSession[] }) {
  const theme = useTheme();
  if (sessions.length === 0) return null;

  return (
    <View style={styles.sessions}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        Sessions
      </ThemedText>
      {sessions.map((session) => {
        const live = session.status === 'live';

        return (
          <View key={session.id} style={[styles.session, { borderColor: theme.backgroundElement }]}>
            <View style={[styles.sessionIcon, { backgroundColor: live ? '#dc2626' : theme.backgroundElement }]}>
              <SymbolView
                name={live ? 'dot.radiowaves.left.and.right' : 'calendar'}
                size={18}
                tintColor={live ? '#fff' : theme.text}
              />
            </View>
            <View style={styles.sessionText}>
              <ThemedText type="smallBold">{session.title}</ThemedText>
              <ThemedText type="small" themeColor={live ? 'primary' : 'textSecondary'}>
                {live ? 'Live now' : `${sessionTime(session.scheduled_for)} · ${session.duration_minutes} min`}
              </ThemedText>
            </View>
            {live ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Join ${session.title} on the web`}
                onPress={() =>
                  WebBrowser.openBrowserAsync(`${API_URL}/circles/${circleId}/sessions/${session.id}/live`)
                }
                style={[styles.joinLive, { backgroundColor: theme.primary }]}>
                <ThemedText type="smallBold" style={styles.onDark}>
                  Join
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: Spacing.five },
  spinner: { marginTop: Spacing.five },
  cover: { width: '100%', aspectRatio: 16 / 9 },
  padded: { padding: Spacing.three, gap: Spacing.two },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  by: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  panel: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two, marginTop: Spacing.two },
  sessions: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  session: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
  },
  sessionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sessionText: { flex: 1, gap: 2 },
  joinLive: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: 6 },
  onDark: { color: '#fff' },
});
