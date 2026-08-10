// ════════════════════════════════════════════════════════════════════════
//  test_no_english_in_ar_pages.mjs — an Arabic page may not serve English.
//
//  WHY THIS EXISTS
//  Adlytic is Arabic-first: `<html lang="ar" dir="rtl">`, locale defaults to
//  AR, and every customer is an Iraqi SMB owner. Yet the audit found 38
//  English text nodes in the SERVED HTML, including the entire /welcome
//  landing page — the first screen a new customer ever sees.
//
//  The strings were not untranslated. /welcome carries a complete AR
//  dictionary for all 21 of them. The bug is subtler and worse: the static
//  markup shipped the EN variant and JavaScript swapped in AR after load.
//  So the product is Arabic only while its JavaScript is working — and on a
//  slow Baghdad connection, on first paint, or in exactly the failure state
//  an error banner exists to report, the customer reads English.
//
//  That is why this test measures the RENDERED HTML rather than grepping the
//  source for missing keys: the defect is invisible in the source, where the
//  translation is right there in the file.
//
//  RULE: any text node served by a `lang="ar"` page must contain Arabic, be
//  a proper noun, or be listed below with a reason.
//
//  Prereq: pages rendered via `npx tsx scripts/render-pages.mts`.
// ════════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync } from 'node:fs';

// Brand names, units, and technical identifiers a merchant reads as symbols
// rather than as English words.
const ALLOWED_TOKENS = new Set([
  'Adlytic', 'Meta', 'META', 'WhatsApp', 'Instagram', 'Facebook', 'Stripe',
  'AI', 'API', 'CTR', 'CPC', 'CPM', 'CPA', 'ROAS', 'KPI', 'CSV', 'PDF', 'URL',
  'UTM', 'OK', 'ID', 'IQD', 'USD', 'EUR', 'SAR', 'AED', 'Pro', 'CMO', 'SDK',
]);

// Whole strings that are allowed as-is, each with the reason it is exempt.
const ALLOWED_STRINGS = new Map([
  ['English', 'the label of the English option in the locale picker — it must read English'],
  ['Adlytic Ads Intelligence Platform', 'the product wordmark, used as a signature'],
  ['Adlytic CMO', 'the assistant’s product name'],
  ['act_', 'the literal Meta ad-account id prefix, shown as an input example'],
  ['lytic', 'a fragment of the wordmark split by the tag-stripping in this test'],
]);

let bad = 0;
let scanned = 0;

for (const f of readdirSync('.mobile-pages').filter((n) => n.endsWith('.html'))) {
  const raw = readFileSync('.mobile-pages/' + f, 'utf8');

  // Only Arabic pages are in scope. /admin/observability and
  // /admin/meta-readiness are lang="en" operator consoles — English there is
  // correct, and flagging it would train people to ignore this test.
  if (!/<html[^>]*lang="ar"/.test(raw)) continue;
  scanned++;

  const html = raw
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  for (const node of html.split(/<[^>]+>/).map((s) => s.trim()).filter(Boolean)) {
    if (node.length < 4) continue;
    if (/[؀-ۿ]/.test(node)) continue;            // contains Arabic
    if (ALLOWED_STRINGS.has(node)) continue;

    const words = (node.match(/[A-Za-z][A-Za-z'’]{2,}/g) || [])
      .filter((w) => !ALLOWED_TOKENS.has(w));
    if (words.length === 0) continue;

    console.error(`✗ ${f}: English in an Arabic page — "${node.slice(0, 78)}"`);
    bad++;
  }
}

console.log(
  bad
    ? `\n${bad} English text node(s) served by Arabic pages`
    : `\nno English served by any of the ${scanned} Arabic pages`,
);
process.exit(bad ? 1 : 0);
