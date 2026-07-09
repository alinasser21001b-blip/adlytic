// test_data_sanitizer.ts
// Run: npx tsx test_data_sanitizer.ts

import {
  scrubString,
  sanitizeObjectForLlm,
  sanitizeDashboardForLlm,
  sanitizeCmoHistoricalContext,
} from './src/lib/dataSanitizer';
import type { DashboardDTO } from './src/services/getDashboard';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ── scrubString ─────────────────────────────────────────────────────────
const scrubbed = scrubString(
  'Contact john@shop.com or +971 50 123 4567 about act_123456789012',
);
assert(scrubbed.includes('[redacted-email]'), 'email redacted');
assert(scrubbed.includes('[redacted-phone]'), 'phone redacted');
assert(scrubbed.includes('[redacted-ad-account]'), 'act id redacted');
assert(!scrubbed.includes('john@shop.com'), 'raw email removed');

// ── sanitizeObjectForLlm ────────────────────────────────────────────────
const obj = sanitizeObjectForLlm({
  campaignId: 'cm123',
  campaignName: 'Summer Sale',
  metrics: { ctr: 1.2, spend: 500 },
  owner: { email: 'owner@test.com', phone: '555-0100' },
});
assert((obj as { campaignId?: string }).campaignId === undefined, 'campaignId stripped');
assert((obj as { metrics: { ctr: number } }).metrics.ctr === 1.2, 'metrics kept');
assert((obj as { owner?: { email?: string } }).owner?.email === undefined, 'email key stripped');

// ── sanitizeDashboardForLlm ───────────────────────────────────────────────
const dto: DashboardDTO = {
  workspace: {
    id: 'ws_secret',
    name: 'Ali Ahmed Store',
    industry: 'ecommerce',
    locale: 'AR',
    currency: 'USD',
    currencyMinorFactor: 100,
    lastSyncedAt: '2026-06-01',
    activeCampaigns: 2,
  },
  health: { score: 82, band: 'good' },
  kpis: [],
  trendSeries: { dates: [], messages: [], results: [], spend: [], ctr: [], frequency: [] },
  issues: [],
  priorityAction: null,
  bestCampaign: {
    id: 'camp_1',
    name: 'act_999999999999 Promo',
    health: 90,
    band: 'excellent',
    messages: 10,
    ctr: 2,
    cpm: 5,
    frequency: 1.2,
  },
  worstCampaign: null,
};
const safe = sanitizeDashboardForLlm(dto);
assert(safe.workspace?.id === undefined, 'workspace id stripped');
assert(
  safe.bestCampaign?.name.includes('[redacted-ad-account]'),
  'campaign name scrubbed',
);
assert(safe.health.score === 82, 'health score kept');

// ── sanitizeCmoHistoricalContext ────────────────────────────────────────
const hist = sanitizeCmoHistoricalContext({
  topPerformers: [{
    name: 'Reach ali@test.com',
    objective: 'MESSAGES',
    finalRoas: 2.1,
    costPerMessage: 1.5,
    keyTrait: 'Strong CTR',
  }],
  recentFailures: [],
});
assert(hist.topPerformers[0]!.name.includes('[redacted-email]'), 'history name scrubbed');
assert(hist.topPerformers[0]!.finalRoas === 2.1, 'roas kept');

console.log('✓ data sanitizer tests passed');
