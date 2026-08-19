// ════════════════════════════════════════════════════════════════════════
//  test_probe_security.ts — the token must never enter a URL.
//
//  A query-string token leaks along paths nobody audits: proxy access logs,
//  caches, Referer headers, APM traces — and Meta's own error payloads,
//  which echo the request URL back and which we then persist as probe
//  evidence. This gate drives the REAL runner against a stubbed fetch and
//  inspects every request it actually makes, including the three discovery
//  calls that are easy to forget because they are not probe candidates.
//
//  It asserts on observed traffic, not on a reimplementation of the URL
//  builder: a test that rebuilds the request it is checking proves only
//  that the test agrees with itself.
// ════════════════════════════════════════════════════════════════════════
import { metaGetRequest, runCapabilityProbeForWorkspace } from './src/services/metaCapabilityRunner';

const TOKEN = 'EAAtestSECRETtoken0123456789abcdefGHIJKLMNOP';

let failed = 0; let passed = 0;
const ok = (m: string) => { console.log('  ✓ ' + m); passed++; };
const bad = (m: string) => { console.error('  ✗ ' + m); failed++; };

interface Seen { url: string; auth: string | null; method: string }

function fakePrisma() {
  return {
    adAccount: {
      findFirst: async () => ({
        externalAccountId: 'act_1234567890',
        accessTokenEncrypted: 'enc', tokenSource: 'USER_OAUTH', connectionId: null,
      }),
    },
  } as never;
}

async function main() {
  console.log('\n── 1. the request builder puts the token in the header ──');
  {
    const { url, init } = metaGetRequest('https://graph.facebook.com/v20.0', '/act_1/insights', { fields: 'spend' }, TOKEN);
    if (url.includes(TOKEN)) bad('token appears in the URL');
    else ok('URL.includes(accessToken) === false');
    const h = (init.headers ?? {}) as Record<string, string>;
    if (h['Authorization'] !== `Bearer ${TOKEN}`) bad(`Authorization header missing or wrong: ${JSON.stringify(h)}`);
    else ok('Authorization: Bearer <token> present');
    if (!url.includes('fields=spend')) bad('non-secret params no longer reach the query string');
    else ok('non-secret params still travel in the query string');
    if (/access_token/i.test(url)) bad('the literal access_token parameter is still being built');
    else ok('no access_token parameter anywhere in the URL');
  }

  console.log('\n── 2. every REAL request the runner makes ──');
  {
    const seen: Seen[] = [];
    const realFetch = globalThis.fetch;
    // Stub every Meta response so the runner walks its whole path: three
    // discovery calls, then the candidate ladder.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      seen.push({ url, auth: headers['Authorization'] ?? null, method: init?.method ?? 'GET' });
      return {
        ok: true, status: 200,
        json: async () => ({ data: [{ id: '1234567890' }] }),
      } as unknown as Response;
    }) as typeof fetch;

    // decryptToken must yield our marker; stub the module boundary by
    // pointing TOKEN_ENCRYPTION_KEY-free code at a prepared value is not
    // possible here, so we assert on what DID go out: if decryption throws,
    // no request is made and the count assertion below fails loudly rather
    // than passing vacuously.
    let threw: string | null = null;
    try {
      await runCapabilityProbeForWorkspace(fakePrisma(), { workspaceId: 'w1', maxCalls: 6 });
    } catch (e) {
      threw = e instanceof Error ? e.message : String(e);
    } finally {
      globalThis.fetch = realFetch;
    }

    if (seen.length === 0) {
      // Not a pass: it means the runner never reached the network, so this
      // gate proved nothing about its traffic.
      bad(`the runner made NO requests — this gate verified nothing (reason: ${threw ?? 'unknown'})`);
    } else {
      ok(`captured ${seen.length} real outbound request(s)`);

      const leaked = seen.filter((s) => s.url.includes(TOKEN) || /access_token=/i.test(s.url));
      if (leaked.length) bad(`${leaked.length} request(s) carried a token in the URL`);
      else ok('no request URL contains a token or an access_token parameter');

      const unauth = seen.filter((s) => !s.auth || !s.auth.startsWith('Bearer '));
      if (unauth.length) bad(`${unauth.length} request(s) sent no Authorization: Bearer header`);
      else ok('every request carries Authorization: Bearer');

      const written = seen.filter((s) => s.method !== 'GET');
      if (written.length) bad(`${written.length} non-GET request(s) — the probe must stay read-only`);
      else ok('every request is GET — read-only preserved');

      // The discovery calls are the easy ones to miss: they are not probe
      // candidates and were hand-built separately from the transport.
      const disco = seen.filter((s) => /\/(campaigns|adsets|ads)\b/.test(s.url));
      if (disco.length === 0) bad('no discovery call observed — campaign/adset/ad coverage unproven');
      else {
        const discoLeak = disco.filter((s) => s.url.includes(TOKEN) || !s.auth);
        if (discoLeak.length) bad(`${discoLeak.length} discovery call(s) leaked or lacked auth`);
        else ok(`all ${disco.length} discovery call(s) (campaign/adset/ad) use the header`);
      }
    }
  }

  console.log(`\n════ ${failed === 0 ? `${passed} passed, 0 failed` : `${failed} FAILURES`} ════\n`);
  process.exit(failed ? 1 : 0);
}

main();
