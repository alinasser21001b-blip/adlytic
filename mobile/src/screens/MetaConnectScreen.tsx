// ════════════════════════════════════════════════════════════════════════
//  src/screens/MetaConnectScreen.tsx
//
//  APP → META LOGIN → CALLBACK → ADLYTIC → APP (ALPHA rule 13).
//
//  Meta refuses logins started inside an app-embedded WebView, so this uses
//  expo-web-browser's openAuthSessionAsync — the ASWebAuthenticationSession
//  wrapper Apple expects for third-party OAuth. It follows the SAME
//  server-owned redirect chain the web client uses (Meta → our callback →
//  our redirect); the only difference is the final hop targets this app's
//  own URL scheme instead of a browser page. See src/lib/mobileClient.ts
//  server-side for why the app never gets to choose that destination.
//
//  The Meta access token NEVER reaches this device: /api/meta/oauth/start
//  and /accounts/:sessionId hand back only a one-time, server-side session
//  id, and /connect exchanges it for an AdAccount link without the token
//  ever crossing the wire to the client.
// ════════════════════════════════════════════════════════════════════════
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { ErrorState } from '../components/States';
import { api } from '../api/client';
import { API_BASE_URL, APP_SCHEME } from '../api/config';
import { useWorkspace } from '../auth/WorkspaceContext';
import { ApiError } from '../api/errors';
import type { MetaAdAccountInfo, MetaOAuthAccountsResponse, MetaOAuthStartResponse } from '../api/types';
import { ar } from '../i18n/ar';
import { logEvent } from '../observability/log';
import { brand, surface, text as textColor, semantic, fontSize, space, radius, a11y } from '../theme/tokens';

type Phase =
  | { step: 'idle' }
  | { step: 'starting' }
  | { step: 'awaiting_browser' }
  | { step: 'choosing'; accounts: MetaAdAccountInfo[]; sessionId: string }
  | { step: 'linking' }
  | { step: 'done' }
  | { step: 'error'; messageAr: string };

function absoluteUrl(u: string): string {
  return u.startsWith('http') ? u : `${API_BASE_URL}${u}`;
}

export function MetaConnectScreen(): React.ReactElement {
  const { workspaceId } = useWorkspace();
  const nav = useNavigation();
  const [phase, setPhase] = useState<Phase>({ step: 'idle' });

  const fetchAccounts = useCallback(async (sessionId: string) => {
    const res = await api.get<MetaOAuthAccountsResponse>(`/api/meta/oauth/accounts/${sessionId}`);
    if (res.accounts.length === 0) {
      setPhase({ step: 'error', messageAr: ar.metaNoAccounts });
      return;
    }
    setPhase({ step: 'choosing', accounts: res.accounts, sessionId });
  }, []);

  const start = useCallback(async () => {
    if (!workspaceId) return;
    setPhase({ step: 'starting' });
    logEvent({ kind: 'meta_reconnect_start' });
    let res: MetaOAuthStartResponse;
    try {
      res = await api.get<MetaOAuthStartResponse>(
        `/api/meta/oauth/start?workspaceId=${encodeURIComponent(workspaceId)}&client=ios`,
      );
    } catch (e) {
      const kind = e instanceof ApiError ? e.kind : 'UNKNOWN';
      setPhase({ step: 'error', messageAr: kind === 'OFFLINE' ? ar.offline : ar.serverDown });
      logEvent({ kind: 'meta_reconnect_result', ok: false });
      return;
    }
    if (!res.configured) {
      setPhase({ step: 'error', messageAr: res.message ?? ar.metaUnavailable });
      logEvent({ kind: 'meta_reconnect_result', ok: false });
      return;
    }
    // Dialog-skipping paths (direct-token / system-user env token) hand back
    // a session id directly — nothing to open a browser for.
    if (res.sessionId) {
      await fetchAccounts(res.sessionId);
      return;
    }
    if (!res.url) {
      setPhase({ step: 'error', messageAr: ar.metaUnavailable });
      return;
    }
    setPhase({ step: 'awaiting_browser' });
    const result = await WebBrowser.openAuthSessionAsync(absoluteUrl(res.url), `${APP_SCHEME}://meta`);
    if (result.type !== 'success' || !result.url) {
      // User closed the sheet, or backgrounded the app mid-flow. Not an
      // error — the merchant simply did not finish. See ALPHA rule 13:
      // "cancelled authorization" must have its own honest state, not an
      // error toast.
      setPhase({ step: 'error', messageAr: ar.metaCancelled });
      logEvent({ kind: 'meta_reconnect_result', ok: false });
      return;
    }
    // adlytic://meta/connected?session=... or adlytic://meta/error?reason=...
    // (src/lib/mobileClient.ts server-side). Parsed with expo-linking rather
    // than the global URL — more reliably available across Hermes builds for
    // a non-http scheme, and it is what the rest of the app already depends
    // on for Linking.
    const returned = Linking.parse(result.url);
    const path = returned.path ?? '';
    if (path.includes('error')) {
      const reason = String(returned.queryParams?.reason ?? '');
      const denied = /denied|declined/i.test(reason);
      setPhase({ step: 'error', messageAr: denied ? ar.metaDenied : ar.metaUnavailable });
      logEvent({ kind: 'meta_reconnect_result', ok: false });
      return;
    }
    const sessionId = returned.queryParams?.session;
    if (!sessionId || typeof sessionId !== 'string') {
      setPhase({ step: 'error', messageAr: ar.metaUnavailable });
      return;
    }
    logEvent({ kind: 'meta_reconnect_result', ok: true });
    await fetchAccounts(sessionId);
  }, [workspaceId, fetchAccounts]);

  const linkAccount = useCallback(async (sessionId: string, externalAccountId: string) => {
    if (!workspaceId) return;
    setPhase({ step: 'linking' });
    try {
      await api.post('/api/meta/oauth/connect', { sessionId, externalAccountId, workspaceId });
      setPhase({ step: 'done' });
      setTimeout(() => nav.goBack(), 900);
    } catch {
      setPhase({ step: 'error', messageAr: ar.metaUnavailable });
    }
  }, [workspaceId, nav]);

  return (
    <Screen scroll={phase.step !== 'choosing'}>
      <Text style={styles.title}>{ar.metaTitle}</Text>

      {phase.step === 'idle' && (
        <Pressable style={styles.cta} onPress={start} accessibilityRole="button">
          <Text style={styles.ctaLabel}>{ar.metaConnect}</Text>
        </Pressable>
      )}

      {(phase.step === 'starting' || phase.step === 'awaiting_browser' || phase.step === 'linking') && (
        <View style={styles.center}>
          <ActivityIndicator color={brand.base} size="large" />
          <Text style={styles.centerLabel}>
            {phase.step === 'linking' ? ar.metaLinking : ar.metaConnecting}
          </Text>
        </View>
      )}

      {phase.step === 'choosing' && (
        <FlatList
          data={phase.accounts}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<Text style={styles.chooseTitle}>{ar.metaChooseAccount}</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.accountRow}
              onPress={() => linkAccount(phase.sessionId, item.id)}
              accessibilityRole="button"
            >
              <Text style={styles.accountName} numberOfLines={1}>{item.name}</Text>
              {!!item.currency && <Text style={styles.accountCurrency}>{item.currency}</Text>}
            </Pressable>
          )}
        />
      )}

      {phase.step === 'done' && (
        <View style={styles.center}>
          <Text style={styles.doneLabel}>✓ {ar.metaConnected}</Text>
        </View>
      )}

      {phase.step === 'error' && (
        <View style={styles.center}>
          <Text style={styles.errorText}>{phase.messageAr}</Text>
          <Pressable style={styles.cta} onPress={start} accessibilityRole="button">
            <Text style={styles.ctaLabel}>{ar.retry}</Text>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.h3, fontWeight: '700', color: textColor.primary, textAlign: 'right', marginBottom: space[4] },
  cta: {
    backgroundColor: brand.base, borderRadius: radius.unit, minHeight: a11y.touchMin,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[4],
  },
  ctaLabel: { color: '#FFFFFF', fontSize: fontSize.bodyLg, fontWeight: '700' },
  center: { alignItems: 'center', justifyContent: 'center', gap: space[3], paddingVertical: space[6] },
  centerLabel: { color: textColor.muted, fontSize: fontSize.body },
  list: { paddingBottom: space[5] },
  chooseTitle: { fontSize: fontSize.bodyLg, fontWeight: '700', color: textColor.primary, textAlign: 'right', marginBottom: space[3] },
  accountRow: {
    flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: surface.surface, borderWidth: 1, borderColor: surface.border,
    borderRadius: radius.unit, padding: space[3], marginBottom: space[2], minHeight: a11y.touchMin,
  },
  accountName: { flex: 1, fontSize: fontSize.body, color: textColor.primary, textAlign: 'right' },
  accountCurrency: { fontSize: fontSize.caption, color: textColor.faint, marginStart: space[2] },
  doneLabel: { fontSize: fontSize.h4, fontWeight: '700', color: semantic.good },
  errorText: { fontSize: fontSize.body, color: textColor.primary, textAlign: 'center' },
});
