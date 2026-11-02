import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { api, useSession } from '@/lib/session';
import type { IssuedToken } from '@/lib/types';

export default function TwoFactor() {
  const { challenge } = useLocalSearchParams<{ challenge: string }>();
  const { signIn } = useSession();
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const issued = await api.post<IssuedToken>('/api/v1/auth/two-factor', {
        challenge_id: challenge,
        ...(useRecovery ? { recovery_code: value.trim() } : { code: value.trim() }),
      });
      await signIn(issued);
      router.replace('/');
    } catch (e) {
      if (e instanceof ApiError) {
        const field = Object.values(e.fieldErrors)[0];
        setError(field ?? e.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen centered>
      <ThemedText type="subtitle">Two-step check</ThemedText>
      <ThemedText themeColor="textSecondary">
        {useRecovery
          ? 'Enter one of the recovery codes you saved when you turned on two-step sign-in.'
          : 'Enter the 6-digit code from your authenticator app.'}
      </ThemedText>
      <Field
        label={useRecovery ? 'Recovery code' : 'Code'}
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        autoComplete={useRecovery ? 'off' : 'one-time-code'}
        keyboardType={useRecovery ? 'default' : 'number-pad'}
        textContentType="oneTimeCode"
        onSubmitEditing={submit}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Continue" busy={busy} disabled={!value} onPress={submit} />
      <Button
        label={useRecovery ? 'Use my authenticator app' : 'Use a recovery code'}
        variant="secondary"
        onPress={() => {
          setUseRecovery(!useRecovery);
          setValue('');
          setError('');
        }}
      />
    </Screen>
  );
}
