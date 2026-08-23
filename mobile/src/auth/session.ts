// ════════════════════════════════════════════════════════════════════════
//  src/auth/session.ts — where the bearer token lives on-device.
//
//  expo-secure-store wraps iOS Keychain Services. This is the ONLY place in
//  the app that touches the token's storage; everything else asks
//  AuthContext for it. The token never reaches AsyncStorage, a log line, a
//  URL, or a Redux/Zustand store that a debugger or a crash dump could
//  serialize whole.
// ════════════════════════════════════════════════════════════════════════
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'adlytic.session.token';

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function readToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    // A Keychain read can fail (e.g. right after a device restore before the
    // user has unlocked once). Treat exactly like "no session" — never crash
    // app start over it.
    return null;
  }
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
