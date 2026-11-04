import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { api, useSession } from '@/lib/session';

type Deletion = { can_delete: boolean; credit_balance: number; blockers: string[] };

/**
 * The server anonymises the account and keeps its payment history (AUTH-19).
 * It refuses while a payout, order or booking is open, so those are listed
 * here first rather than discovered after the password.
 */
export default function DeleteAccount() {
  const theme = useTheme();
  const { signOut } = useSession();
  const [deletion, setDeletion] = useState<Deletion | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: Deletion }>('/api/v1/account/deletion')
      .then((r) => !cancelled && setDeletion(r.data))
      .catch(
        (e) => !cancelled && setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'),
      );

    return () => {
      cancelled = true;
    };
  }, []);

  function confirm() {
    Alert.alert('Delete your account?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: remove },
    ]);
  }

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await api.delete('/api/v1/account', { password });
      await signOut();
      router.replace('/');
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (Object.values(e.fieldErrors)[0] ?? e.message)
          : 'Something went wrong. Please try again.',
      );
      setBusy(false);
    }
  }

  return (
    <Screen underHeader>
      <Stack.Screen options={{ headerShown: true, title: 'Delete account', headerBackTitle: 'Settings' }} />
      <ThemedText themeColor="textSecondary">
        Deleting your account removes your name, contact details, saved payment methods and addresses, and signs you out
        everywhere. We keep a record of your past payments and purchases, with nothing on it that says who you are,
        because our accounts need it.
      </ThemedText>

      {deletion === null && !error ? <ActivityIndicator /> : null}

      {deletion && !deletion.can_delete ? (
        <View style={[styles.box, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">Before you can delete your account</ThemedText>
          {deletion.blockers.map((blocker) => (
            <ThemedText key={blocker}>{blocker}</ThemedText>
          ))}
        </View>
      ) : null}

      {deletion?.can_delete ? (
        <>
          {deletion.credit_balance > 0 ? (
            <ThemedText type="smallBold" style={{ color: theme.danger }}>
              Your {deletion.credit_balance} unused credits will be lost.
            </ThemedText>
          ) : null}
          <Field
            label="Your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
          />
          <Button label="Delete my account" busy={busy} disabled={!password} onPress={confirm} />
        </>
      ) : null}

      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two, padding: Spacing.three, borderRadius: 12 },
});
