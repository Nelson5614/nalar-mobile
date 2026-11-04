import { Stack } from 'expo-router';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { api } from '@/lib/session';

type Errors = Partial<Record<'current_password' | 'password' | 'password_confirmation', string>>;

/** Other devices are signed out by the server; this phone stays signed in. */
export default function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function submit() {
    setBusy(true);
    setErrors({});
    setError('');
    setDone('');
    try {
      const result = await api.put<{ message: string }>('/api/v1/account/password', {
        current_password: current,
        password: next,
        password_confirmation: confirm,
      });
      setDone(result.message);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length) {
        setErrors(e.fieldErrors);
      } else {
        setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen underHeader>
      <Stack.Screen options={{ headerShown: true, title: 'Change password', headerBackTitle: 'Settings' }} />
      <ThemedText themeColor="textSecondary">
        Changing your password signs you out everywhere else. You stay signed in on this phone.
      </ThemedText>
      <Field
        label="Current password"
        value={current}
        onChangeText={setCurrent}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        error={errors.current_password}
      />
      <Field
        label="New password"
        value={next}
        onChangeText={setNext}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        error={errors.password}
      />
      <Field
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        error={errors.password_confirmation}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {done ? <ThemedText>{done}</ThemedText> : null}
      <Button label="Change password" busy={busy} disabled={!current || !next || !confirm} onPress={submit} />
    </Screen>
  );
}
