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
//  There is no key_version column on either token table (see AUDIT-REPORT.md
//  D-1). Without one, "which key encrypted this row" is unanswerable from the
//  data, and the only way to size a key-mismatch incident is to attempt every
//  decryption and count the failures. That is what this does.
// ════════════════════════════════════════════════════════════════════════
import { PrismaClient } from '@prisma/client';
import { config } from '../src/config';
import { decryptToken, isEncryptedToken, TokenDecryptError } from '../src/services/tokenEncryption';

type Tally = {
  rows: number;
  empty: number;
  plaintext: number;
  decrypted: number;
  failed: number;
  failedIds: string[];
};

const blank = (): Tally => ({ rows: 0, empty: 0, plaintext: 0, decrypted: 0, failed: 0, failedIds: [] });

function classify(tally: Tally, id: string, stored: string | null): void {
  tally.rows++;
  if (!stored) { tally.empty++; return; }
  if (!isEncryptedToken(stored)) { tally.plaintext++; return; }
  try {
    decryptToken(stored);
    tally.decrypted++;
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
  if (t.failed) {
    console.log(`  affected ids             : ${t.failedIds.join(', ')}${t.failed > t.failedIds.length ? ` … +${t.failed - t.failedIds.length} more` : ''}`);
  }
}

async function main(): Promise<void> {
  const fp = config.tokenEncryption.keyFingerprint;
  console.log('\n════ stored-token decryptability ════');
  console.log(`key fingerprint in this process: ${fp ?? '<NO KEY SET — every row will read as plaintext>'}`);
  if (!fp) {
    console.log('Without a key the script cannot distinguish "encrypted with another key"');
    console.log('from "stored as plaintext". Set TOKEN_ENCRYPTION_KEY and re-run.');
  }

  const prisma = new PrismaClient();
  try {
    const adTally = blank();
    for (const row of await prisma.adAccount.findMany({
      select: { id: true, accessTokenEncrypted: true },
    })) {
      classify(adTally, row.id, row.accessTokenEncrypted);
    }
    report('AdAccount.access_token_encrypted', adTally);

    // The second token table. Wrapped because it is a later addition and this
    // script must still run against an older database rather than crash.
    const conn = (prisma as unknown as Record<string, { findMany?: (a: unknown) => Promise<Array<{ id: string; accessTokenEncrypted: string | null }>> }>)['metaConnection'];
    if (conn?.findMany) {
      const connTally = blank();
      for (const row of await conn.findMany({ select: { id: true, accessTokenEncrypted: true } })) {
        classify(connTally, row.id, row.accessTokenEncrypted);
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
