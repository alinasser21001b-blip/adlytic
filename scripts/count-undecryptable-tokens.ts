// ════════════════════════════════════════════════════════════════════════
//  scripts/count-undecryptable-tokens.ts — READ-ONLY blast-radius counter
//
//  Answers one question with a number instead of a guess: how many stored
//  Meta tokens cannot be decrypted with the key this process is holding?
//
//  Run against production with the production TOKEN_ENCRYPTION_KEY:
//      DATABASE_URL=... TOKEN_ENCRYPTION_KEY=... npx tsx scripts/count-undecryptable-tokens.ts
//
//  SAFETY — this script is deliberately incapable of damage:
//    · it issues SELECTs only; there is no update/delete/upsert anywhere
//    · it never prints a token, a plaintext, or the key — only lengths,
//      envelope shapes, and the key's public 8-char fingerprint
//    · it does not call the Meta API, so it cannot spend a customer's
//      call budget or touch a live ad account
//
//  WHY IT EXISTS
//  Both token tables now carry access_token_key_version, but rows written
//  before it existed are NULL — generation 1 by assumption — and a stamp is
//  only a claim until a decryption confirms it. So the count still comes from
//  attempting every decryption; the stamp tells you which population each
//  failure belongs to, which is what makes a rotation finishable.
//
//  Read it during a rotation as: `gen N` should grow and `gen N-1` should
//  shrink to zero. When it does, TOKEN_ENCRYPTION_KEY_PREVIOUS can be
//  removed. `DECRYPT FAILED` must be zero throughout — anything else means a
//  row neither key can open.
// ════════════════════════════════════════════════════════════════════════
import { PrismaClient } from '@prisma/client';
import { config } from '../src/config';
import { decryptToken, isEncryptedToken, TOKEN_KEY_VERSION, TokenDecryptError } from '../src/services/tokenEncryption';

type Tally = {
  rows: number;
  empty: number;
  plaintext: number;
  decrypted: number;
  failed: number;
  failedIds: string[];
  /** Rows per stamped key generation; `null` = written before versioning. */
  byVersion: Map<number | null, number>;
  /** Stamped as generation N but only opened by another key — a stale stamp. */
  mismatched: number;
};

const blank = (): Tally => ({
  rows: 0, empty: 0, plaintext: 0, decrypted: 0, failed: 0, failedIds: [],
  byVersion: new Map(), mismatched: 0,
});

function classify(tally: Tally, id: string, stored: string | null, keyVersion: number | null): void {
  tally.rows++;
  tally.byVersion.set(keyVersion, (tally.byVersion.get(keyVersion) ?? 0) + 1);
  if (!stored) { tally.empty++; return; }
  if (!isEncryptedToken(stored)) { tally.plaintext++; return; }
  try {
    decryptToken(stored);
    tally.decrypted++;
    // A row stamped with a generation other than the one this process writes
    // opened anyway — either the previous key is configured and rotation is
    // still in progress, or the stamp is stale. Either way it is worth
    // counting, because it is exactly the population a re-encryption pass
    // has to walk.
    if (keyVersion !== null && keyVersion !== TOKEN_KEY_VERSION) tally.mismatched++;
  } catch (err) {
    if (!(err instanceof TokenDecryptError)) throw err;
    tally.failed++;
    if (tally.failedIds.length < 200) tally.failedIds.push(id);
  }
}

function report(label: string, t: Tally): void {
  const pct = t.rows ? ((t.failed / t.rows) * 100).toFixed(1) : '0.0';
  console.log(`\n── ${label} ──`);
  console.log(`  rows with a token column : ${t.rows}`);
  console.log(`  null / empty             : ${t.empty}`);
  console.log(`  legacy plaintext         : ${t.plaintext}   (stored before the key existed)`);
  console.log(`  decrypt OK               : ${t.decrypted}`);
  console.log(`  DECRYPT FAILED           : ${t.failed}   (${pct}% of rows)`);
  const versions = [...t.byVersion.entries()].sort((a, b) => Number(a[0] ?? 0) - Number(b[0] ?? 0));
  console.log(`  by key generation        : ${versions.map(([v, n]) => `${v === null ? 'unstamped(=gen 1 by assumption)' : 'gen ' + v}=${n}`).join('  ') || '—'}`);
  if (t.mismatched) {
    console.log(`  opened but not on gen ${TOKEN_KEY_VERSION} : ${t.mismatched}   (re-encrypt these to finish the rotation)`);
  }
  if (t.failed) {
    console.log(`  affected ids             : ${t.failedIds.join(', ')}${t.failed > t.failedIds.length ? ` … +${t.failed - t.failedIds.length} more` : ''}`);
  }
}

async function main(): Promise<void> {
  const fp = config.tokenEncryption.keyFingerprint;
  console.log('\n════ stored-token decryptability ════');
  console.log(`key fingerprint in this process: ${fp ?? '<NO KEY SET — every row will read as plaintext>'}`);
  console.log(`writing key generation         : ${TOKEN_KEY_VERSION}`);
  console.log(`previous key configured        : ${config.tokenEncryption.previousKey ? 'yes — rotation in progress' : 'no'}`);
  if (!fp) {
    console.log('Without a key the script cannot distinguish "encrypted with another key"');
    console.log('from "stored as plaintext". Set TOKEN_ENCRYPTION_KEY and re-run.');
  }

  const prisma = new PrismaClient();
  try {
    const adTally = blank();
    for (const row of await prisma.adAccount.findMany({
      select: { id: true, accessTokenEncrypted: true, accessTokenKeyVersion: true },
    })) {
      classify(adTally, row.id, row.accessTokenEncrypted, row.accessTokenKeyVersion);
    }
    report('AdAccount.access_token_encrypted', adTally);

    // The second token table. Wrapped because it is a later addition and this
    // script must still run against an older database rather than crash.
    const conn = (prisma as unknown as Record<string, { findMany?: (a: unknown) => Promise<Array<{ id: string; accessTokenEncrypted: string | null; accessTokenKeyVersion: number | null }>> }>)['metaConnection'];
    if (conn?.findMany) {
      const connTally = blank();
      for (const row of await conn.findMany({ select: { id: true, accessTokenEncrypted: true, accessTokenKeyVersion: true } })) {
        classify(connTally, row.id, row.accessTokenEncrypted, row.accessTokenKeyVersion);
      }
      report('MetaConnection.access_token_encrypted', connTally);
      console.log(`\nTOTAL UNDECRYPTABLE: ${adTally.failed + connTally.failed}`);
    } else {
      console.log('\n(no MetaConnection model in this schema — skipped)');
      console.log(`\nTOTAL UNDECRYPTABLE: ${adTally.failed}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('count-undecryptable-tokens failed:', err);
  process.exit(1);
});
