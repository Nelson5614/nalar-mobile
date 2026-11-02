import { router } from 'expo-router';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { api } from '@/lib/session';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');

  async function submit() {
    setBusy(true);
    setNotice('');
    setError('');
    setFieldError('');
    try {
      const response = await api.post<{ message: string }>('/api/v1/auth/forgot-password', { email: email.trim() });
      setNotice(response.message);
    } catch (e) {
      const apiError = e instanceof ApiError ? e : null;
      if (apiError?.fieldErrors.email) {
        setFieldError(apiError.fieldErrors.email);
      } else {
        setError(apiError?.message ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen centered>
      <ThemedText type="subtitle">Reset your password</ThemedText>
      <ThemedText themeColor="textSecondary">
        Enter the email you signed up with. We’ll send you a link to choose a new password.
      </ThemedText>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        onSubmitEditing={submit}
        error={fieldError}
      />
      {notice ? <ThemedText>{notice}</ThemedText> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Send reset link" busy={busy} disabled={!email.trim()} onPress={submit} />
      <Button label="Back to sign in" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
