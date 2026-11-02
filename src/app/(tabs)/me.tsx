import { Redirect, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { PLATFORM } from '@/lib/config';
import { useSession } from '@/lib/session';

export default function Me() {
  const { launch, reload, signOut } = useSession();

  // Credits are bought on the web. Coming back to the app is the signal to
  // pick up the new balance.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') reload();
    });

    return () => subscription.remove();
  }, [reload]);

  if (launch?.route !== 'home') return <Redirect href="/" />;

  const { me, config } = launch;

  return (
    <Screen>
      <ThemedText type="subtitle">Hi, {me.name}</ThemedText>
      <ThemedText themeColor="textSecondary">Credit balance</ThemedText>
      <ThemedText type="title">{me.credit_balance}</ThemedText>
      {config.top_up?.link_enabled?.[PLATFORM] ? (
        <Button label="Buy credits" onPress={() => WebBrowser.openBrowserAsync(config.top_up.url)} />
      ) : null}
      <Button label="My consultations" variant="secondary" onPress={() => router.push('/consultations/mine')} />
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
