import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ErrorText, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { api } from '@/lib/session';
import { timeAgo } from '@/lib/time';

type Device = { id: number; name: string; current: boolean; last_used_at: string | null };

const failure = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

/** Every phone or tablet signed in to the app. Sign out any but this one. */
export default function Devices() {
  const theme = useTheme();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: Device[] }>('/api/v1/auth/devices')
      .then((r) => !cancelled && setDevices(r.data))
      .catch((e) => {
        if (cancelled) return;
        setError(failure(e));
        setDevices([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function signOut(device: Device) {
    Alert.alert(`Sign out ${device.name}?`, 'It will need your password to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/api/v1/auth/devices/${device.id}`);
            setDevices((current) => (current ?? []).filter((d) => d.id !== device.id));
          } catch (e) {
            setError(failure(e));
          }
        },
      },
    ]);
  }

  return (
    <Screen underHeader>
      <Stack.Screen options={{ headerShown: true, title: 'Signed-in devices', headerBackTitle: 'Settings' }} />
      {devices === null ? <ActivityIndicator /> : null}
      {(devices ?? []).map((device) => (
        <View key={device.id} style={[styles.row, { borderBottomColor: theme.backgroundElement }]}>
          <View style={styles.text}>
            <ThemedText type="smallBold">{device.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {device.current
                ? 'This device'
                : device.last_used_at
                  ? `Last used ${timeAgo(device.last_used_at)}`
                  : 'Not used yet'}
            </ThemedText>
          </View>
          {device.current ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Sign out ${device.name}`}
              onPress={() => signOut(device)}
              hitSlop={8}
              style={styles.signOut}>
              <ThemedText type="smallBold" style={{ color: theme.danger }}>
                Sign out
              </ThemedText>
            </Pressable>
          )}
        </View>
      ))}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    gap: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: 2 },
  signOut: { minHeight: 44, justifyContent: 'center' },
});
