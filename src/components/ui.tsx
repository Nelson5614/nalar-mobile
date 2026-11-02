import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Screen({ children, centered = false }: PropsWithChildren<{ centered?: boolean }>) {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, centered && styles.centered]}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  busy?: boolean;
  disabled?: boolean;
};

export function Button({ label, onPress, variant = 'primary', busy = false, disabled = false }: ButtonProps) {
  const theme = useTheme();
  const primary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: theme.primary } : { borderColor: theme.primary, borderWidth: 1 },
        (pressed || disabled) && { opacity: 0.6 },
      ]}>
      {busy ? (
        <ActivityIndicator color={primary ? '#fff' : theme.primary} />
      ) : (
        <ThemedText type="smallBold" style={{ color: primary ? '#fff' : theme.primary }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

export function Field({ label, error, ...input }: TextInputProps & { label: string; error?: string }) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <ThemedText type="small">{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: error ? theme.danger : 'transparent' },
        ]}
        {...input}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

type CheckboxProps = { label: string; checked: boolean; onChange: (checked: boolean) => void; error?: string };

export function Checkbox({ label, checked, onChange, error }: CheckboxProps) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked }}
        onPress={() => onChange(!checked)}
        style={styles.checkRow}>
        <View
          style={[
            styles.box,
            { borderColor: error ? theme.danger : theme.primary },
            checked && { backgroundColor: theme.primary },
          ]}>
          {checked ? (
            <ThemedText type="smallBold" style={{ color: '#fff' }}>
              ✓
            </ThemedText>
          ) : null}
        </View>
        <ThemedText type="small" style={styles.checkLabel}>
          {label}
        </ThemedText>
      </Pressable>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

export function ErrorText({ children }: PropsWithChildren) {
  return (
    <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.four, gap: Spacing.three },
  centered: { justifyContent: 'center' },
  button: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  field: { gap: Spacing.one },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: Spacing.three, fontSize: 16 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkLabel: { flex: 1 },
});
