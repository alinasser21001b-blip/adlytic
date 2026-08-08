/**
 * P3.5 — Meta action-semantics integrity regression suite.
 *
 * Meta's `actions` array describes the SAME business event at several
 * granularities (canonical / umbrella / channel-specific) mixed with genuinely
 * different events, and nothing in the payload separates the two cases.
 * Summing it double-counts. This suite proves overlapping representations are
 * never double-counted, for every action-derived metric Adlytic reports.
 *
 * Run: npx tsx test_action_semantics.ts
 */
import assert from 'node:assert/strict';
import {
  ACTION_FAMILIES,
  allActionFamilies,
  resolveAction,
  resolveActionCount,
  resolveActionValuePairedTo,
} from './src/analytics/actionSemantics';
import { mapMetaInsight } from './src/mappers/insightMapper';

let passed = 0;
const fail: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { fail.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

const A = (t: string, v: number | string) => ({ action_type: t, value: String(v) });
/** Minimal valid insight row. */
const row = (extra: Record<string, unknown>) => ({
  date_start: '2026-08-01', spend: '1000', impressions: '10000',
  reach: '8000', clicks: '500', inline_link_clicks: '200', unique_clicks: '450',
  actions: [], ...extra,
}) as any;
const MAP = { currencyMinorFactor: 1 };

console.log('\n── Fixture 1: specific action only ──');

check('purchases: pixel-only row resolves to the pixel count', () => {
  const r = resolveActionCount([A('offsite_conversion.fb_pixel_purchase', 7)], ACTION_FAMILIES['purchases']!);
  assert.equal(r.value, 7);
  assert.equal(r.matchedType, 'offsite_conversion.fb_pixel_purchase');
  assert.equal(r.usedFallback, true, 'the canonical `purchase` was absent, so this is a fallback');
});

check('leads: instant-form-only row resolves to that count', () => {
  const r = resolveActionCount([A('leadgen.other', 12)], ACTION_FAMILIES['leads']!);
  assert.equal(r.value, 12);
  assert.equal(r.matchedType, 'leadgen.other');
});

console.log('\n── Fixture 2: umbrella action only ──');

check('purchases: omni-only row still reports a number (no silent zero)', () => {
  const r = resolveActionCount([A('omni_purchase', 9)], ACTION_FAMILIES['purchases']!);
  assert.equal(r.value, 9);
  assert.equal(r.matchedType, 'omni_purchase');
  assert.equal(r.usedFallback, true);
});

check('LPV: omni-only row reports the omni value', () => {
  const r = resolveActionCount([A('omni_landing_page_view', 55)], ACTION_FAMILIES['landing_page_views']!);
  assert.equal(r.value, 55);
});

console.log('\n── Fixture 3: specific + umbrella SIMULTANEOUSLY (the bug) ──');

check('purchases: purchase + pixel + omni counts ONCE, canonically', () => {
  // The old code summed all three: 7 + 7 + 9 = 23 purchases from 7 orders.
  const r = resolveActionCount([
    A('purchase', 7),
    A('offsite_conversion.fb_pixel_purchase', 7),
    A('omni_purchase', 9),
  ], ACTION_FAMILIES['purchases']!);
  assert.equal(r.value, 7, 'must be 7 (canonical `purchase`), not 23');
  assert.equal(r.matchedType, 'purchase');
  assert.equal(r.usedFallback, false);
  assert.equal(r.candidatesPresent.length, 3, 'all three overlapping forms were present');
});

check('leads: lead + leadgen.other + pixel_lead counts ONCE', () => {
  // Old behaviour: 10 + 6 + 4 = 20 leads from 10.
  const r = resolveActionCount([
    A('lead', 10),
    A('leadgen.other', 6),
    A('offsite_conversion.fb_pixel_lead', 4),
  ], ACTION_FAMILIES['leads']!);
  assert.equal(r.value, 10, 'must be 10 (canonical `lead`), not 20');
  assert.equal(r.matchedType, 'lead');
});

check('LPV: landing_page_view + omni counts ONCE', () => {
  const r = resolveActionCount([
    A('landing_page_view', 80),
    A('omni_landing_page_view', 80),
  ], ACTION_FAMILIES['landing_page_views']!);
  assert.equal(r.value, 80, 'must be 80, not 160');
});

console.log('\n── Fixture 4: multiple LEGITIMATE independent actions ──');

check('different business events never bleed into each other', () => {
  const actions = [
    A('purchase', 5),
    A('lead', 11),
    A('landing_page_view', 120),
    A('onsite_conversion.messaging_conversation_started_7d', 33),
    A('add_to_cart', 90),          // excluded from purchases
    A('initiate_checkout', 40),    // excluded from purchases
  ];
  assert.equal(resolveActionCount(actions, ACTION_FAMILIES['purchases']!).value, 5);
  assert.equal(resolveActionCount(actions, ACTION_FAMILIES['leads']!).value, 11);
  assert.equal(resolveActionCount(actions, ACTION_FAMILIES['landing_page_views']!).value, 120);
  assert.equal(resolveActionCount(actions, ACTION_FAMILIES['messages']!).value, 33);
});

check('earlier funnel stages never inflate purchases', () => {
  const r = resolveActionCount([A('add_to_cart', 90), A('initiate_checkout', 40)], ACTION_FAMILIES['purchases']!);
  assert.equal(r.value, 0, 'carts and checkouts are not purchases');
  assert.equal(r.matchedType, null);
});

console.log('\n── Fixture 5: empty actions ──');

check('an empty array yields 0 with no match, not a crash', () => {
  for (const f of allActionFamilies()) {
    const r = resolveActionCount([], f);
    assert.equal(r.value, 0, f.familyKey);
    assert.equal(r.matchedType, null, f.familyKey);
    assert.equal(r.candidatesPresent.length, 0, f.familyKey);
  }
});

check('null / undefined / non-array actions are handled', () => {
  assert.equal(resolveActionCount(null, ACTION_FAMILIES['purchases']!).value, 0);
  assert.equal(resolveActionCount(undefined, ACTION_FAMILIES['purchases']!).value, 0);
});

console.log('\n── Fixture 6: unknown action type ──');

check('an unrecognised action type is ignored, never counted', () => {
  const r = resolveActionCount([
    A('some_future_meta_event', 999),
    A('onsite_conversion.custom_thing', 500),
  ], ACTION_FAMILIES['purchases']!);
  assert.equal(r.value, 0);
  assert.equal(r.matchedType, null);
});

check('an unknown type alongside a known one does not disturb it', () => {
  const r = resolveActionCount([
    A('some_future_meta_event', 999),
    A('purchase', 4),
  ], ACTION_FAMILIES['purchases']!);
  assert.equal(r.value, 4);
});

console.log('\n── Fixture 7: purchase COUNT + purchase VALUE (revenue / ROAS) ──');

check('revenue pairs to the SAME representation that won the count', () => {
  // Count wins on `purchase`; revenue must read `purchase`'s value, NOT the
  // larger omni figure — otherwise ROAS divides omnichannel revenue by
  // website orders.
  const n = mapMetaInsight(row({
    spend: '100',
    actions: [A('purchase', 5), A('omni_purchase', 8)],
    action_values: [A('purchase', 500), A('omni_purchase', 900)],
  }), MAP);
  assert.equal(n.purchases, 5, 'count must be canonical, not 13');
  assert.equal(n.revenueMinor, 500, 'revenue must pair with `purchase`, not be 1400 or 900');
});

check('revenue is NOT summed across overlapping value rows', () => {
  const n = mapMetaInsight(row({
    spend: '100',
    actions: [A('purchase', 5)],
    action_values: [
      A('purchase', 500),
      A('offsite_conversion.fb_pixel_purchase', 500),
      A('omni_purchase', 700),
    ],
  }), MAP);
  assert.equal(n.revenueMinor, 500, 'the old sumActions gave 1700 from 500 of real revenue');
});

check('ROAS derived from paired revenue is not inflated', () => {
  const n = mapMetaInsight(row({
    spend: '100',
    actions: [A('purchase', 5), A('omni_purchase', 8)],
    action_values: [A('purchase', 500), A('offsite_conversion.fb_pixel_purchase', 500), A('omni_purchase', 900)],
  }), MAP);
  // spend 100, revenue 500 → computed ROAS 5.0. The old path summed revenue
  // to 1900 → ROAS 19.0, a 3.8× overstatement of the client's return.
  assert.equal(n.revenueMinor, 500);
  assert.equal(n.roas, 5, `expected 5.0, got ${n.roas}`);
});

check("Meta's own purchase_roas still wins when present, and is picked not summed", () => {
  const n = mapMetaInsight(row({
    spend: '100',
    actions: [A('purchase', 5)],
    action_values: [A('purchase', 500)],
    purchase_roas: [A('purchase', 4.2), A('omni_purchase', 6.1)],
  }), MAP);
  assert.equal(n.roas, 4.2, 'Meta attribution preferred; overlapping entries never summed to 10.3');
});

check('value falls back down the list when the count type has no value row', () => {
  const r = resolveActionValuePairedTo(
    [A('omni_purchase', 900)],
    ACTION_FAMILIES['purchases']!,
    'purchase',
  );
  assert.equal(r.value, 900);
  assert.equal(r.pairedWithCount, false, 'must be flagged as unpaired, not silently trusted');
});

console.log('\n── Fixture 8: lead count through the mapper ──');

check('mapper reports leads once from overlapping representations', () => {
  const n = mapMetaInsight(row({
    actions: [A('lead', 10), A('leadgen.other', 6), A('offsite_conversion.fb_pixel_lead', 4)],
  }), MAP);
  assert.equal(n.leads, 10, 'was 20 before the fix');
});

check('complete_registration never inflates the lead count', () => {
  const n = mapMetaInsight(row({ actions: [A('lead', 3), A('complete_registration', 25)] }), MAP);
  assert.equal(n.leads, 3);
});

console.log('\n── Fixture 9: LPV overlap through the mapper ──');

check('mapper reports LPV once from overlapping representations', () => {
  const n = mapMetaInsight(row({
    actions: [A('landing_page_view', 95), A('omni_landing_page_view', 95)],
  }), MAP);
  assert.equal(n.landingPageViews, 95);
});

check('link_click never leaks into landing page views', () => {
  const n = mapMetaInsight(row({
    actions: [A('link_click', 200), A('landing_page_view', 95)],
  }), MAP);
  assert.equal(n.landingPageViews, 95, 'the click/arrival gap is the traffic funnel signal');
});

console.log('\n── Fixture 10: messaging overlap ──');

check('first_reply never inflates the conversation count', () => {
  // The original production bug: 87 conversations + 76 replies = 163 reported.
  const n = mapMetaInsight(row({
    actions: [
      A('onsite_conversion.messaging_conversation_started_7d', 87),
      A('onsite_conversion.messaging_first_reply', 76),
    ],
  }), MAP);
  assert.equal(n.messages, 87, 'must match Ads Manager, not 163');
});

check('total_messaging_connection is fallback-only, never additive', () => {
  const n = mapMetaInsight(row({
    actions: [
      A('onsite_conversion.messaging_conversation_started_7d', 40),
      A('onsite_conversion.total_messaging_connection', 55),
    ],
  }), MAP);
  assert.equal(n.messages, 40, 'a connection contains the start; summing double-counts');
});

check('total_messaging_connection IS used when it is the only signal', () => {
  const n = mapMetaInsight(row({
    actions: [A('onsite_conversion.total_messaging_connection', 55)],
  }), MAP);
  assert.equal(n.messages, 55, 'click-to-WhatsApp accounts report only this');
});

check('cost per message resolves through the same preference order', () => {
  const n = mapMetaInsight(row({
    actions: [A('onsite_conversion.messaging_conversation_started_7d', 40)],
    cost_per_action_type: [
      A('onsite_conversion.messaging_conversation_started_7d', 25),
      A('onsite_conversion.messaging_first_reply', 13),
    ],
  }), MAP);
  assert.equal(n.costPerMessage, 25, 'cost must describe the same event as the count');
});

console.log('\n── Family invariants ──');

check('every family picks, never sums', () => {
  for (const f of allActionFamilies()) {
    assert.equal(f.aggregationRule, 'PICK_FIRST_PRESENT', f.familyKey);
  }
});

check('every family declares a canonical first preference', () => {
  for (const f of allActionFamilies()) {
    assert.ok(f.preference.length > 0, `${f.familyKey}: empty preference list`);
    assert.equal(f.preference[0]!.behavior, 'CANONICAL',
      `${f.familyKey}: rank 0 must be the representation Ads Manager reports`);
  }
});

check('no action type appears in two families', () => {
  // A type serving two business events would make one of them wrong.
  const seen = new Map<string, string>();
  for (const f of allActionFamilies()) {
    for (const p of f.preference) {
      const prior = seen.get(p.actionType);
      assert.equal(prior, undefined,
        `${p.actionType} is claimed by both ${prior} and ${f.familyKey}`);
      seen.set(p.actionType, f.familyKey);
    }
  }
});

check('every preference and exclusion carries a documented reason', () => {
  for (const f of allActionFamilies()) {
    for (const p of [...f.preference, ...f.excluded]) {
      assert.ok(p.note && p.note.length > 20,
        `${f.familyKey}/${p.actionType}: needs a note explaining its rank`);
    }
  }
});

check('excluded types are never resolvable by their family', () => {
  for (const f of allActionFamilies()) {
    for (const ex of f.excluded) {
      const r = resolveActionCount([A(ex.actionType, 500)], f);
      assert.equal(r.value, 0, `${f.familyKey} must not count ${ex.actionType}`);
    }
  }
});

check('overlap is observable: candidatesPresent exposes what arrived', () => {
  const r = resolveAction([
    A('purchase', 7), A('omni_purchase', 9),
  ], ACTION_FAMILIES['purchases']!);
  assert.deepEqual(r.candidatesPresent, ['purchase', 'omni_purchase']);
});

console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
if (fail.length > 0) {
  console.error('failed: ' + fail.join(', '));
  process.exit(1);
}
