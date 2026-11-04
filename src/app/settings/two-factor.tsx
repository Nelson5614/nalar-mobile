import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Share, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { api } from '@/lib/session';

type Status = { enabled: boolean; pending: boolean };
type Setup = { setup_key: string; otpauth_url: string };
// What the password unlocks: the server asks for it before every change.
type Action = 'enable' | 'codes' | 'disable';

const failure = (e: unknown) =>
  e instanceof ApiError ? (Object.values(e.fieldErrors)[0] ?? e.message) : 'Something went wrong. Please try again.';

export default function TwoStep() {
  const theme = useTheme();
  const [status, setStatus] = useState<Status | null>(null);
  const [asking, setAsking] = useState<Action | null>(null);
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: Status }>('/api/v1/account/two-factor')
      .then((r) => !cancelled && setStatus(r.data))
      .catch((e) => !cancelled && setError(failure(e)));

    return () => {
      cancelled = true;
    };
  }, []);

  function ask(action: Action) {
    setAsking(action);
    setPassword('');
    setError('');
    setCodes(null);
  }

  async function withPassword() {
    setBusy(true);
    setError('');
    try {
      if (asking === 'enable') {
        setSetup((await api.post<{ data: Setup }>('/api/v1/account/two-factor', { password })).data);
      } else if (asking === 'codes') {
        const result = await api.post<{ data: { recovery_codes: string[] } }>(
          '/api/v1/account/two-factor/recovery-codes',
          { password },
        );
        setCodes(result.data.recovery_codes);
      } else if (asking === 'disable') {
        await api.delete('/api/v1/account/two-factor', { password });
        setStatus({ enabled: false, pending: false });
      }
      setAsking(null);
      setPassword('');
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const result = await api.post<{ data: { recovery_codes: string[] } }>('/api/v1/account/two-factor/confirm', {
        code: code.trim(),
      });
      setCodes(result.data.recovery_codes);
      setSetup(null);
      setCode('');
      setStatus({ enabled: true, pending: false });
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <Stack.Screen options={{ headerShown: true, title: 'Two-step sign-in', headerBackTitle: 'Settings' }} />
  );

  if (!status) {
    return (
      <Screen underHeader>
        {header}
        {error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator />}
      </Screen>
    );
  }

  return (
    <Screen underHeader>
      {header}
      <ThemedText type="smallBold">{status.enabled ? 'Two-step sign-in is On' : 'Two-step sign-in is Off'}</ThemedText>
      <ThemedText themeColor="textSecondary">
        When it is on, signing in also asks for a 6-digit code from an authenticator app, so your password alone is not
        enough to get into your account.
      </ThemedText>

      {codes ? (
        <View style={[styles.box, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">Your recovery codes</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Keep these somewhere safe. Each one signs you in once if you lose your phone.
          </ThemedText>
          {codes.map((c) => (
            <ThemedText key={c} selectable style={styles.mono}>
              {c}
            </ThemedText>
          ))}
          <Button
            label="Save recovery codes"
            variant="secondary"
            onPress={() => Share.share({ message: `Nalar recovery codes\n\n${codes.join('\n')}` })}
          />
        </View>
      ) : null}

      {setup ? (
        <View style={styles.steps}>
          <ThemedText>
            1. Add Nalar to your authenticator app. Open it from the button below, or type in this setup key:
          </ThemedText>
          <ThemedText selectable style={[styles.mono, styles.key]}>
            {setup.setup_key}
          </ThemedText>
          <Button
            label="Open in authenticator app"
            variant="secondary"
            onPress={() =>
              Linking.openURL(setup.otpauth_url).catch(() =>
                setError('No authenticator app opened. Type the setup key into it instead.'),
              )
            }
          />
          <ThemedText>2. Enter the 6-digit code it shows.</ThemedText>
          <Field
            label="6-digit code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
          />
          <Button label="Confirm" busy={busy} disabled={code.trim().length < 6} onPress={confirm} />
        </View>
      ) : asking ? (
        <View style={styles.steps}>
          <Field
            label="Your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={withPassword}
          />
          <Button label="Continue" busy={busy} disabled={!password} onPress={withPassword} />
          <Button label="Cancel" variant="secondary" onPress={() => setAsking(null)} />
        </View>
      ) : status.enabled ? (
        <View style={styles.steps}>
          <Button label="New recovery codes" variant="secondary" onPress={() => ask('codes')} />
          <Button label="Turn off" variant="secondary" onPress={() => ask('disable')} />
        </View>
      ) : (
        <Button label="Turn on" onPress={() => ask('enable')} />
      )}

      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  steps: { gap: Spacing.three },
  box: { gap: Spacing.two, padding: Spacing.three, borderRadius: 12 },
  mono: { fontFamily: 'Menlo', letterSpacing: 1 },
  key: { fontSize: 18 },
});
