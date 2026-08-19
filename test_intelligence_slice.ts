// ════════════════════════════════════════════════════════════════════════
//  test_intelligence_slice.ts — the change-radar vertical slice.
//
//  Proves SOURCE → CHANGE → BLAST RADIUS → IMPACT → ACTION end to end, and
//  guards the properties that make the score trustworthy rather than merely
//  present: novelty must not score, dependency must, and an unmapped
//  resource must never read as a non-dependency.
// ════════════════════════════════════════════════════════════════════════
import { analyzePlatformChange, type PlatformChange } from './src/intelligence/platformChange';
import { resolveBlastRadius, PRODUCT_FEATURES, META_RESOURCES } from './src/intelligence/metaDependencyGraph';

let failed = 0; let passed = 0;
const ok = (m: string) => { console.log('  ✓ ' + m); passed++; };
const bad = (m: string) => { console.error('  ✗ ' + m); failed++; };

const change = (o: Partial<PlatformChange>): PlatformChange => ({
  id: 'c1', source: 'developers.facebook.com', sourceType: 'CHANGELOG',
  title: 't', summary: 's', detectedAt: new Date().toISOString(),
  category: 'API', affectedResources: [], affectedApiVersions: [],
  evidenceUrls: ['https://developers.facebook.com/docs/graph-api/changelog'],
  status: 'VERIFIED', ...o,
});

function main() {
  console.log('\n── 1. the registry is grounded in real code ──');
  {
    const bogus = META_RESOURCES.filter((r) => !r.declaredIn || r.declaredIn.length < 5);
    if (bogus.length) bad(`${bogus.length} resource(s) declare no source location`);
    else ok(`all ${META_RESOURCES.length} resources name where they are declared`);

    const ids = new Set(META_RESOURCES.map((r) => r.id));
    const dangling = PRODUCT_FEATURES.flatMap((f) => f.dependsOn.filter((d) => !ids.has(d)));
    if (dangling.length) bad(`features depend on unregistered resources: ${dangling.join(', ')}`);
    else ok(`all ${PRODUCT_FEATURES.length} features depend only on registered resources`);
  }

  console.log('\n── 2. blast radius answers "what breaks?" ──');
  {
    const b = resolveBlastRadius(['frequency']);
    if (!b.features.some((f) => f.id === 'feat:frequency')) bad('frequency change does not reach the frequency feature');
    else ok(`frequency → ${b.features.length} feature(s): ${b.features.map((f) => f.id).join(', ')}`);
    if (!b.implementationSites.some((s) => s.includes('detectHighFrequency'))) {
      bad('blast radius does not point at the HIGH_FREQUENCY gate');
    } else ok('blast radius names the exact implementation sites');

    // The three-way split: used / unused / unknown must stay distinct.
    const u = resolveBlastRadius(['some_field_meta_invented_today']);
    if (u.unknownResourceIds.length !== 1 || u.features.length) {
      bad('an unmapped resource was not reported as unknown');
    } else ok('an unmapped resource reads UNKNOWN, not "we do not use it"');
  }

  console.log('\n── 3. impact comes from dependency, never novelty ──');
  {
    // A loud change touching nothing we consume.
    const loud = analyzePlatformChange(change({
      id: 'loud', category: 'AI', title: 'Meta launches a major new AI ads product',
      affectedResources: [], sourceType: 'META_OFFICIAL',
    }));
    // A quiet deprecation behind a headline number.
    const quiet = analyzePlatformChange(change({
      id: 'quiet', category: 'REPORTING', title: 'field deprecated',
      affectedResources: ['spend'], status: 'DEPRECATED',
    }));
    if (loud.impactScore >= quiet.impactScore) {
      bad(`novelty outscored dependency — loud=${loud.impactScore} quiet=${quiet.impactScore}`);
    } else ok(`dependency outranks novelty — loud=${loud.impactScore}, quiet spend-deprecation=${quiet.impactScore}`);

    if (!quiet.classifications.includes('MEASUREMENT_RISK')) bad('a spend deprecation is not flagged as a measurement risk');
    else ok('silent-corruption features raise MEASUREMENT_RISK');
    if (!quiet.engineeringActions.some((a) => a.includes('لا صفر'))) {
      bad('the engineering action does not forbid the zero fallback');
    } else ok('engineering action explicitly forbids substituting zero for missing');
  }

  console.log('\n── 4. urgency is time, kept separate from impact ──');
  {
    const soon = analyzePlatformChange(change({ affectedResources: ['ctr'], effectiveAt: new Date(Date.now() + 3 * 864e5).toISOString() }));
    const later = analyzePlatformChange(change({ affectedResources: ['ctr'], effectiveAt: new Date(Date.now() + 200 * 864e5).toISOString() }));
    if (soon.impactScore !== later.impactScore) bad('urgency leaked into the impact score');
    else ok(`same change, same impact (${soon.impactScore}) regardless of date`);
    if (soon.urgencyScore <= later.urgencyScore) bad('urgency does not rise as the date approaches');
    else ok(`urgency separates them: ${soon.urgencyScore} vs ${later.urgencyScore}`);

    const undated = analyzePlatformChange(change({ affectedResources: ['ctr'] }));
    if (undated.urgencyScore === 0) bad('a missing effective date became urgency zero — absence of a date is not evidence of distance');
    else ok(`no effective date → urgency ${undated.urgencyScore}, not 0`);
  }

  console.log('\n── 5. source quality moves confidence, not impact ──');
  {
    const official = analyzePlatformChange(change({ affectedResources: ['spend'], sourceType: 'META_OFFICIAL' }));
    const rumour = analyzePlatformChange(change({ affectedResources: ['spend'], sourceType: 'OBSERVED', status: 'UNVERIFIED', evidenceUrls: [] }));
    if (official.impactScore !== rumour.impactScore) bad('source quality changed the impact score — a real dependency is real whoever reported it');
    else ok(`impact identical (${official.impactScore}) across source tiers`);
    if (rumour.analysisConfidence >= official.analysisConfidence) bad('an unverified rumour is not less confident');
    else ok(`confidence separates them: official ${official.analysisConfidence} vs unverified ${rumour.analysisConfidence}`);
    if (!rumour.openQuestions.length) bad('an unverified change raises no open question');
    else ok('unverified changes queue a verification question instead of an action');
  }

  console.log('\n── 6. every score is arguable ──');
  {
    const a = analyzePlatformChange(change({ affectedResources: ['actions', 'frequency'], category: 'MEASUREMENT' }));
    if (a.reasoning.length < 3) bad('the score arrives with too little reasoning to check');
    else ok(`${a.reasoning.length} reasoning steps accompany the score`);
    const numbered = a.reasoning.filter((r) => /\+\d+/.test(r)).length;
    if (!numbered) bad('no reasoning line shows its arithmetic contribution');
    else ok(`${numbered} step(s) state their own point contribution`);
  }

  console.log(`\n════ ${failed === 0 ? `${passed} passed, 0 failed` : `${failed} FAILURES`} ════\n`);
  process.exit(failed ? 1 : 0);
}

main();
