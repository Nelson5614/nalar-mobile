import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { api, useSession } from '@/lib/session';

export default function VerifyEmail() {
  const { launch, reload, signOut } = useSession();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'resend' | 'check' | null>(null);
  const email = launch?.route === 'verify-email' ? launch.me.email : undefined;

  // Anything other than "still unverified" (verified, signed out, offline) is
  // the launch gate's call, so hand over to it.
  const check = useCallback(async () => {
    const next = await reload();
    if (next.route !== 'verify-email') router.replace('/');

    return next.route === 'verify-email';
  }, [reload]);

  // The link is opened in the mail app or browser, so returning to the app is
  // the moment the account is most likely to have just been verified.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });

    return () => subscription.remove();
  }, [check]);

  return (
    <Screen centered>
      <ThemedText type="subtitle">Check your email</ThemedText>
      <ThemedText themeColor="textSecondary">
        We sent a link to {email ?? 'your email address'}. Open it to finish setting up your account, then come back
        here.
      </ThemedText>
      {notice ? <ThemedText>{notice}</ThemedText> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label="I’ve verified my email"
        busy={busy === 'check'}
        onPress={async () => {
          setBusy('check');
          setNotice('');
          if (await check()) {
            setNotice('We haven’t seen your confirmation yet. Open the link in the email, then try again.');
          }
          setBusy(null);
        }}
      />
      <Button
        label="Send the link again"
        variant="secondary"
        busy={busy === 'resend'}
        onPress={async () => {
          setBusy('resend');
          setError('');
          try {
            await api.post('/api/v1/auth/email/resend');
            setNotice('Sent. Check your inbox and spam folder.');
          } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
          } finally {
            setBusy(null);
          }
        }}
      />
      <Button
        label="Sign out"
        variant="secondary"
        onPress={async () => {
          await signOut();
          router.replace('/');
        }}
      />
    </Screen>
  );
}
