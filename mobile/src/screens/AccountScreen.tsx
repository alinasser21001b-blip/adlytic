// ════════════════════════════════════════════════════════════════════════
//  src/screens/AccountScreen.tsx — connection state, reconnect, sync
//  status, logout, account selection (ALPHA IA, section 8).
// ════════════════════════════════════════════════════════════════════════
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Linking } from 'react-native';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { LoadingState, ErrorState } from '../components/States';
import { useApiData } from '../api/useApiData';
import { api } from '../api/client';
import { API_BASE_URL } from '../api/config';
import { useAuth } from '../auth/AuthContext';
import { useWorkspace } from '../auth/WorkspaceContext';
import type { TokenHealthResponse } from '../api/types';
import { ar } from '../i18n/ar';
import { brand, surface, text as textColor, semantic, fontSize, space, radius, a11y } from '../theme/tokens';
import type { MainStackParamList } from '../navigation/types';

export function AccountScreen(): React.ReactElement {
  const { user, logout } = useAuth();
  const { workspaceId, workspaceName, options, select } = useWorkspace();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [deleting, setDeleting] = useState(false);

  const { state, reload } = useApiData<TokenHealthResponse>(
    () => api.get<TokenHealthResponse>(`/api/workspaces/${workspaceId}/token-health`).catch((e) => {
      // token-health answers 503 with a body when the connection is broken —
      // that is DATA, not a failed request. Re-synthesize it as a value.
      if (e?.status === 503 && e?.code) return { ok: false, code: e.code } as TokenHealthResponse;
      throw e;
    }),
    [workspaceId],
  );

  function confirmSignOut(): void {
    Alert.alert(ar.signOutConfirmTitle, ar.signOutConfirmBody, [
      { text: ar.cancel, style: 'cancel' },
      { text: ar.signOut, style: 'destructive', onPress: () => logout() },
    ]);
  }

  function confirmDeleteAccount(): void {
    Alert.alert(
      ar.deleteAccountTitle,
      ar.deleteAccountBody,
      [
        { text: ar.cancel, style: 'cancel' },
        {
          text: ar.deleteAccountConfirm, style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await api.del('/api/auth/account');
              await logout();
            } catch {
              setDeleting(false);
              Alert.alert(ar.unexpected, '');
            }
          },
        },
      ],
    );
  }

  const connectionOk = state.phase === 'ready' && state.data.ok === true;
  const connectionBroken = state.phase === 'ready' && state.data.ok === false;

  return (
    <Screen>
      <Text style={styles.title}>{ar.accountTitle}</Text>

      <View style={styles.card}>
        <Text style={styles.email}>{user?.email}</Text>
        {!!workspaceName && <Text style={styles.workspace}>{ar.workspaceLabel}: {workspaceName}</Text>}
      </View>

      {options.length > 1 && (
        <View style={styles.card}>
          {options.map((o) => (
            <Pressable key={o.id} style={styles.wsRow} onPress={() => select(o.id)}>
              <Text style={[styles.wsName, o.id === workspaceId && styles.wsNameActive]}>{o.name}</Text>
              {o.id === workspaceId && <Text style={styles.wsCheck}>✓</Text>}
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>{ar.metaTitle}</Text>
        {state.phase === 'loading' && <LoadingState label={ar.loading} />}
        {state.phase === 'error' && <ErrorState kind={state.kind} onRetry={reload} />}
        {connectionOk && <Text style={styles.metaOk}>✓ {ar.metaConnected}</Text>}
        {connectionBroken && <Text style={styles.metaBroken}>{ar.metaExpired}</Text>}
        <Pressable style={styles.reconnectBtn} onPress={() => nav.navigate('MetaConnect')} accessibilityRole="button">
          <Text style={styles.reconnectLabel}>{connectionOk ? ar.metaReconnect : ar.metaConnect}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Pressable style={styles.linkRow} onPress={() => Linking.openURL(`${API_BASE_URL}/privacy`)}>
          <Text style={styles.linkLabel}>{ar.privacyPolicy}</Text>
        </Pressable>
        <Pressable style={styles.linkRow} onPress={() => Linking.openURL(`${API_BASE_URL}/data-deletion`)}>
          <Text style={styles.linkLabel}>{ar.dataDeletion}</Text>
        </Pressable>
      </View>

      <Pressable style={styles.signOutBtn} onPress={confirmSignOut} accessibilityRole="button">
        <Text style={styles.signOutLabel}>{ar.signOut}</Text>
      </Pressable>

      <Pressable style={styles.deleteBtn} onPress={confirmDeleteAccount} disabled={deleting} accessibilityRole="button">
        <Text style={styles.deleteLabel}>{deleting ? ar.loading : ar.deleteAccount}</Text>
      </Pressable>

      <Text style={styles.build}>
        {ar.buildLabel}: {Constants.expoConfig?.version}+{Constants.expoConfig?.ios?.buildNumber}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.h3, fontWeight: '700', color: textColor.primary, textAlign: 'right', marginBottom: space[3] },
  card: {
    backgroundColor: surface.surface, borderRadius: radius.unit, borderWidth: 1, borderColor: surface.border,
    padding: space[4], marginBottom: space[3],
  },
  cardLabel: { fontSize: fontSize.bodySm, fontWeight: '700', color: textColor.muted, textAlign: 'right', marginBottom: space[2] },
  email: { fontSize: fontSize.bodyLg, fontWeight: '700', color: textColor.primary, textAlign: 'right' },
  workspace: { fontSize: fontSize.bodySm, color: textColor.muted, textAlign: 'right', marginTop: 4 },
  wsRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space[2] },
  wsName: { fontSize: fontSize.body, color: textColor.muted },
  wsNameActive: { color: textColor.primary, fontWeight: '700' },
  wsCheck: { color: brand.base, fontWeight: '700' },
  metaOk: { color: semantic.good, fontWeight: '700', textAlign: 'right', marginBottom: space[2] },
  metaBroken: { color: semantic.bad, textAlign: 'right', marginBottom: space[2] },
  reconnectBtn: {
    backgroundColor: brand.base, borderRadius: radius.unit, minHeight: a11y.touchMin,
    alignItems: 'center', justifyContent: 'center',
  },
  reconnectLabel: { color: '#FFFFFF', fontWeight: '700', fontSize: fontSize.body },
  linkRow: { paddingVertical: space[3], borderTopWidth: 1, borderTopColor: surface.border },
  linkLabel: { fontSize: fontSize.body, color: brand.base, textAlign: 'right', fontWeight: '600' },
  signOutBtn: {
    borderWidth: 1, borderColor: surface.borderStrong, borderRadius: radius.unit, minHeight: a11y.touchMin,
    alignItems: 'center', justifyContent: 'center', marginTop: space[2],
  },
  signOutLabel: { color: textColor.primary, fontWeight: '700', fontSize: fontSize.body },
  deleteBtn: { alignItems: 'center', justifyContent: 'center', marginTop: space[4], minHeight: a11y.touchMin },
  deleteLabel: { color: semantic.bad, fontWeight: '600', fontSize: fontSize.bodySm },
  build: { textAlign: 'center', color: textColor.faint, fontSize: fontSize.caption, marginTop: space[4] },
});
