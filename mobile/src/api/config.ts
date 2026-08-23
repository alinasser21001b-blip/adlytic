// ════════════════════════════════════════════════════════════════════════
//  src/api/config.ts — the ONE place the app names its backend.
// ════════════════════════════════════════════════════════════════════════
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string };

/**
 * Base URL of the Adlytic API. Comes from app.json's `expo.extra.apiUrl`,
 * which is the same production Railway URL every other Adlytic surface
 * points at (see DEPLOYMENT_URL.txt) — the app does not get its own backend.
 *
 * Overridable at dev-build time with EXPO_PUBLIC_API_URL so a developer can
 * point the app at a local `npm run start:dev` server without editing
 * app.json.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || extra.apiUrl || 'https://adlytic-production.up.railway.app';

/** expo.scheme in app.json. Must equal MOBILE_APP_SCHEME server-side — see test_mobile_contract.ts. */
export const APP_SCHEME = 'adlytic';
