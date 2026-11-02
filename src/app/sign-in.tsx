import * as Device from 'expo-device';
import { router } from 'expo-router';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { api, useSession } from '@/lib/session';
import type { LoginResponse } from '@/lib/types';

export const deviceName = () => Device.modelName ?? 'Nalar app';

export default function SignIn() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit() {
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      const response = await api.post<LoginResponse>('/api/v1/auth/login', {
        email: email.trim(),
        password,
        device_name: deviceName(),
      });

      if ('two_factor' in response) {
        router.push({ pathname: '/two-factor', params: { challenge: response.challenge_id } });
      } else {
        await signIn(response);
        router.replace('/');
      }
    } catch (e) {
      const apiError = e instanceof ApiError ? e : null;
      setFieldErrors(apiError?.fieldErrors ?? {});
      if (!apiError || Object.keys(apiError.fieldErrors).length === 0) {
        setError(apiError?.message ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen centered>
      <ThemedText type="subtitle">Sign in</ThemedText>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        error={fieldErrors.email}
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
        error={fieldErrors.password}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Sign in" busy={busy} disabled={!email || !password} onPress={submit} />
      <ThemedText type="linkPrimary" accessibilityRole="link" onPress={() => router.push('/forgot-password')}>
        Forgot your password?
      </ThemedText>
      <Button label="Back" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
