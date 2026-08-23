import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/errors';
import { ar } from '../i18n/ar';
import { brand, surface, text as textColor, fontSize, space, radius, a11y, semantic } from '../theme/tokens';

const ERROR_TEXT: Record<string, string> = {
  UNAUTHORIZED: ar.wrongCredentials,
  RATE_LIMITED: ar.tooManyAttempts,
  OFFLINE: ar.offline,
  SERVER_DOWN: ar.serverDown,
};

export function LoginScreen(): React.ReactElement {
  const { login, endedReason, clearEndedReason } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    endedReason ? ar.sessionExpired : null,
  );

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    clearEndedReason();
    try {
      await login(email.trim(), password);
    } catch (e) {
      if (e instanceof Error && e.message === 'ACCOUNT_INACTIVE') {
        setError(ar.accountInactive);
      } else if (e instanceof ApiError) {
        setError(ERROR_TEXT[e.kind] ?? ar.unexpected);
      } else {
        setError(ar.unexpected);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.content}>
          <Text style={styles.brandTitle}>{ar.appName}</Text>

          <View style={styles.field}>
            <Text style={styles.label}>{ar.email}</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@example.com"
              placeholderTextColor={textColor.faint}
              editable={!busy}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{ar.password}</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              placeholder="••••••••"
              placeholderTextColor={textColor.faint}
              editable={!busy}
              onSubmitEditing={submit}
              returnKeyType="go"
            />
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={[styles.submit, !canSubmit && styles.submitDisabled]}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitLabel}>{ar.signIn}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: surface.ground },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: space[5], gap: space[3] },
  brandTitle: {
    fontSize: fontSize.h1, fontWeight: '800', color: brand.base, textAlign: 'center', marginBottom: space[5],
  },
  field: { gap: 6 },
  label: { color: textColor.muted, fontSize: fontSize.bodySm, fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: surface.borderStrong, borderRadius: radius.unit,
    paddingHorizontal: space[3], minHeight: a11y.touchMin, fontSize: fontSize.input,
    color: textColor.primary, backgroundColor: surface.surface, textAlign: 'right',
  },
  error: { color: semantic.bad, fontSize: fontSize.bodySm, textAlign: 'center' },
  submit: {
    backgroundColor: brand.base, borderRadius: radius.unit, minHeight: a11y.touchMin,
    alignItems: 'center', justifyContent: 'center', marginTop: space[2],
  },
  submitDisabled: { opacity: 0.5 },
  submitLabel: { color: '#FFFFFF', fontSize: fontSize.bodyLg, fontWeight: '700' },
});
