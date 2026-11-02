import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { deviceName } from '@/app/sign-in';
import { ThemedText } from '@/components/themed-text';
import { Button, Checkbox, ErrorText, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { api, useSession } from '@/lib/session';
import type { IssuedToken } from '@/lib/types';

export default function Register() {
  const { signIn } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const ready = name.trim() && email.trim() && password && confirmation && ageConfirmed && terms;

  async function submit() {
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      const issued = await api.post<IssuedToken>('/api/v1/auth/register', {
        name: name.trim(),
        email: email.trim(),
        password,
        password_confirmation: confirmation,
        age_confirmed: ageConfirmed,
        terms,
        device_name: deviceName(),
      });

      // A new account is unverified, so the launch gate sends it to the
      // check-your-email screen.
      await signIn(issued);
      router.replace('/');
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
      <ThemedText type="subtitle">Create your account</ThemedText>
      <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" error={fieldErrors.name} />
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
        autoComplete="new-password"
        textContentType="newPassword"
        error={fieldErrors.password}
      />
      <Field
        label="Confirm password"
        value={confirmation}
        onChangeText={setConfirmation}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Checkbox
        label="I’m 13 years old or older."
        checked={ageConfirmed}
        onChange={setAgeConfirmed}
        error={fieldErrors.age_confirmed}
      />
      <Checkbox
        label="I agree to the Terms and Privacy Policy."
        checked={terms}
        onChange={setTerms}
        error={fieldErrors.terms}
      />
      <View style={styles.links}>
        <ThemedText
          type="linkPrimary"
          accessibilityRole="link"
          onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/terms-of-service`)}>
          Read the Terms
        </ThemedText>
        <ThemedText
          type="linkPrimary"
          accessibilityRole="link"
          onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/privacy-policy`)}>
          Read the Privacy Policy
        </ThemedText>
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Create account" busy={busy} disabled={!ready} onPress={submit} />
      <Button label="Back" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
});
