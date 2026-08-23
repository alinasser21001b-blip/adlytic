// ════════════════════════════════════════════════════════════════════════
//  src/auth/AuthContext.tsx
//
//  Owns: the token's lifecycle in memory, restoring it at cold start,
//  clearing it on logout OR on any 401 the API client reports (a revoked
//  token, an expired one, tokenVersion bumped by a password change — the
//  server does not distinguish these to the client, and the client should
//  not guess; it just stops trusting the token and asks to sign in again).
//
//  Does NOT own: what a workspace is, what a campaign is. That is
//  WorkspaceContext, built on top of this.
// ════════════════════════════════════════════════════════════════════════
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, configureApiClient } from '../api/client';
import { clearToken, readToken, saveToken } from './session';
import type { AuthUser, LoginResponse, MeResponse } from '../api/types';
import { ApiError } from '../api/errors';
import { logEvent } from '../observability/log';

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  workspaces: MeResponse['memberships'];
  /** Present only while `status === 'signedOut'` after an active session ended without the user choosing to log out. */
  endedReason: 'expired' | 'revoked' | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearEndedReason: () => void;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [workspaces, setWorkspaces] = useState<MeResponse['memberships']>([]);
  const [endedReason, setEndedReason] = useState<'expired' | 'revoked' | null>(null);
  // Kept outside React state: the API client's onUnauthorized callback fires
  // from a fetch resolution, not a render, and must read the CURRENT token
  // without a stale closure over an old `status`.
  const tokenRef = React.useRef<string | null>(null);

  const forceSignOut = useCallback(async (reason: 'expired' | 'revoked') => {
    tokenRef.current = null;
    await clearToken();
    setUser(null);
    setWorkspaces([]);
    setEndedReason(reason);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    configureApiClient({
      getToken: async () => tokenRef.current,
      onUnauthorized: () => { void forceSignOut('expired'); },
    });
  }, [forceSignOut]);

  const hydrateMe = useCallback(async () => {
    const me = await api.get<MeResponse>('/api/auth/me');
    if (!me.isActive) {
      // Inactive account (pending manual activation). Distinct from a
      // revoked/expired session — the token is fine, the account is not
      // usable yet. Surfaced to the caller via the thrown error's message;
      // LoginScreen and the app-start guard both check `isActive` before
      // trusting `me`.
      throw new Error('ACCOUNT_INACTIVE');
    }
    setUser({ id: me.id, email: me.email, name: me.name });
    setWorkspaces(me.memberships);
  }, []);

  // Cold start: try to restore a Keychain session.
  useEffect(() => {
    (async () => {
      logEvent({ kind: 'app_launch' });
      const token = await readToken();
      if (!token) { setStatus('signedOut'); return; }
      tokenRef.current = token;
      try {
        await hydrateMe();
        setStatus('signedIn');
      } catch {
        // A stored token that no longer resolves (revoked, expired, or the
        // account is inactive) is exactly a signed-out state — not a crash,
        // not a retry loop.
        await forceSignOut('expired');
      }
    })();
  }, [hydrateMe, forceSignOut]);

  const login = useCallback(async (email: string, password: string) => {
    let res: LoginResponse;
    try {
      res = await api.post<LoginResponse>('/api/auth/login', { email, password }, { anonymous: true });
    } catch (e) {
      logEvent({ kind: 'login_failure', reason: e instanceof ApiError ? e.kind : 'UNKNOWN' });
      throw e;
    }
    tokenRef.current = res.token;
    await saveToken(res.token);
    try {
      await hydrateMe();
    } catch (e) {
      // Login succeeded but the account is inactive (or /me otherwise
      // rejects it). Keep the token — activation happens without a new
      // login — but do not present the app as signed in.
      tokenRef.current = null;
      await clearToken();
      throw e;
    }
    logEvent({ kind: 'login_success' });
    setEndedReason(null);
    setStatus('signedIn');
  }, [hydrateMe]);

  const logout = useCallback(async () => {
    // Best-effort: the cookie this clears is irrelevant to a bearer client,
    // but calling it keeps behaviour identical to the web client's logout
    // and costs nothing when it fails.
    await api.post('/api/auth/logout').catch(() => {});
    tokenRef.current = null;
    await clearToken();
    setUser(null);
    setWorkspaces([]);
    setEndedReason(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo<AuthState>(() => ({
    status, user, workspaces, endedReason,
    login, logout,
    clearEndedReason: () => setEndedReason(null),
  }), [status, user, workspaces, endedReason, login, logout]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth() outside <AuthProvider>');
  return ctx;
}
