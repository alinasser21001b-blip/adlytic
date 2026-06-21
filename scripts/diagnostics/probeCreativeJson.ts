// scripts/diagnostics/probeCreativeJson.ts
//
// Probe: read a small sample of Ad.creativeJson values from the live DB
// to understand what shape Meta actually returns. Result drives the
// Layer 11 (Creative Resonance) shallow heuristic in v2ContextAssembler.
//
// Run: npx tsx scripts/diagnostics/probeCreativeJson.ts

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const dbUrl = process.env['DATABASE_URL']!;
const parsed = new URL(dbUrl);
const pool = new pg.Pool({
  host: parsed.hostname,
  port: Number(parsed.port) || 5432,
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: parsed.pathname.replace(/^\//, ''),
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const SEP = '─'.repeat(78);

function summarizeKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [];
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    keys.push(path);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...summarizeKeys(v, path));
    }
  }
  return keys;
}

async function main() {
  // Tally rows.
  const totalAds = await prisma.ad.count();
  const withCreative = await prisma.ad.count({ where: { creativeJson: { not: { equals: null } } } });
  console.log(`\n${SEP}`);
  console.log(`📊  Ad table summary`);
  console.log(SEP);
  console.log(`   Total ads:                ${totalAds}`);
  console.log(`   Ads with creativeJson:    ${withCreative}`);

  // Sample up to 3 rows that have a creativeJson.
  const samples = await prisma.ad.findMany({
    where: { creativeJson: { not: { equals: null } } },
    select: { id: true, externalAdId: true, name: true, creativeJson: true, status: true },
    take: 3,
    orderBy: { updatedAt: 'desc' },
  });

  if (samples.length === 0) {
    console.log(`\n⚠️  No ads with creativeJson found — Layer 11 visualHook detection will need to default to STATIC_IMAGE.`);
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  console.log(`\n${SEP}`);
  console.log(`🔍  Showing ${samples.length} creativeJson sample(s) (most recently updated)`);
  console.log(SEP);

  for (const ad of samples) {
    console.log(`\n── Ad: ${ad.name}  (id=${ad.id.slice(0, 8)}…  externalId=${ad.externalAdId}  status=${ad.status}) ──`);

    const cj = ad.creativeJson;

    // Top-level key inventory — quick scan of what's there.
    if (cj && typeof cj === 'object') {
      const keys = summarizeKeys(cj);
      console.log('   Key paths found:');
      for (const k of keys.slice(0, 40)) console.log(`     • ${k}`);
      if (keys.length > 40) console.log(`     … (+${keys.length - 40} more)`);

      // Hint at visual format — what we'd use for Layer 11.
      const cjAny = cj as Record<string, unknown>;
      const probableFormat: string[] = [];
      if ('video_id' in cjAny || (cjAny.object_story_spec as any)?.video_data) probableFormat.push('VIDEO');
      if ('image_hash' in cjAny || 'image_url' in cjAny || (cjAny.object_story_spec as any)?.link_data?.image_hash) probableFormat.push('IMAGE');
      if ((cjAny.object_story_spec as any)?.link_data?.child_attachments) probableFormat.push('CAROUSEL');
      console.log(`   Probable format signal:   ${probableFormat.length ? probableFormat.join(', ') : 'UNKNOWN'}`);
    }

    // Full raw dump — truncated.
    const raw = JSON.stringify(cj, null, 2);
    console.log(`\n   Raw JSON (truncated to 1500 chars):`);
    console.log(raw.slice(0, 1500) + (raw.length > 1500 ? `\n   …(+${raw.length - 1500} more chars)` : ''));
  }

  console.log(`\n${SEP}\n`);
  await prisma.$disconnect();
  await pool.end();
}

main().catch(e => {
  console.error('Probe failed:', e);
  process.exit(1);
});
