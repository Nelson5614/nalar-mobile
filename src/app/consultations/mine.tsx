import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { slotLabel } from '@/app/consultations/book';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { api, useSession } from '@/lib/session';

type Booking = {
  id: number;
  status: string;
  scheduled_for: string;
  offering?: { title: string } | null;
  creator?: { name: string } | null;
  fan?: { name: string } | null;
  can_cancel: boolean;
};
type Bookings = { as_guest: Booking[]; as_host: Booking[] };
type Loaded = { bookings: Bookings } | { error: string };

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

async function load(): Promise<Loaded> {
  try {
    return { bookings: (await api.get<{ data: Bookings }>('/api/v1/consultations/bookings/mine')).data };
  } catch (e) {
    return { error: messageOf(e) };
  }
}

export default function MyConsultations() {
  const theme = useTheme();
  const { reload } = useSession();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    load().then((result) => !cancelled && setLoaded(result));

    return () => {
      cancelled = true;
    };
  }, []);

  async function cancel(booking: Booking) {
    setError('');
    try {
      const result = await api.post<{ data: { refunded_credits: number } }>(
        `/api/v1/consultations/bookings/${booking.id}/cancel`,
      );
      const refunded = result.data.refunded_credits;
      setNotice(refunded > 0 ? `Cancelled. ${refunded} credits are back in your balance.` : 'Cancelled.');
      await reload();
      setLoaded(await load());
    } catch (e) {
      setError(messageOf(e));
    }
  }

  function confirmCancel(booking: Booking) {
    Alert.alert('Cancel this booking?', 'Any refund follows the cancellation rules for this session.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel booking', style: 'destructive', onPress: () => cancel(booking) },
    ]);
  }

  const bookings = loaded && 'bookings' in loaded ? loaded.bookings : null;

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: true, title: 'My consultations', headerBackTitle: 'Back' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {notice ? <ThemedText>{notice}</ThemedText> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
        {!loaded ? (
          <ActivityIndicator />
        ) : 'error' in loaded ? (
          <ErrorText>{loaded.error}</ErrorText>
        ) : bookings && bookings.as_guest.length + bookings.as_host.length === 0 ? (
          <ThemedText themeColor="textSecondary">
            No consultations yet. Open a creator’s profile and tap Book a consultation.
          </ThemedText>
        ) : (
          <>
            {bookings?.as_guest.map((booking) => (
              <BookingRow key={`g${booking.id}`} booking={booking} other={booking.creator?.name} onCancel={confirmCancel} />
            ))}
            {bookings && bookings.as_host.length > 0 ? (
              <ThemedText type="smallBold" themeColor="textSecondary">
                People who booked you
              </ThemedText>
            ) : null}
            {bookings?.as_host.map((booking) => (
              <BookingRow key={`h${booking.id}`} booking={booking} other={booking.fan?.name} onCancel={confirmCancel} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function BookingRow({
  booking,
  other,
  onCancel,
}: {
  booking: Booking;
  other?: string | null;
  onCancel: (booking: Booking) => void;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold">{booking.offering?.title ?? 'Consultation'}</ThemedText>
      {other ? (
        <ThemedText type="small" themeColor="textSecondary">
          {`with ${other}`}
        </ThemedText>
      ) : null}
      <ThemedText type="small">{`${slotLabel(booking.scheduled_for)} · ${booking.status}`}</ThemedText>
      {booking.can_cancel ? <Button label="Cancel booking" variant="secondary" onPress={() => onCancel(booking)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  row: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one },
});
