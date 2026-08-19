// ════════════════════════════════════════════════════════════════════════
//  test_dependency_drift.ts — the registry must not silently go stale.
//
//  metaDependencyGraph.ts is hand-declared. A hand-declared map of what we
//  depend on is worth exactly as much as its freshness: the moment a
//  production field is added and not registered, the change radar answers
//  "we do not depend on that" about something we do depend on — and it
//  answers it confidently, which is worse than not answering.
//
//  This gate compares the registry against the EXPORTED CONSTANTS that
//  production actually requests, plus the filesystem for implementation
//  paths. No AST parsing: the constants are already exported, so importing
//  them is both simpler and more truthful than re-deriving them.
// ════════════════════════════════════════════════════════════════════════
import { existsSync } from 'node:fs';

import { DEFAULT_INSIGHT_FIELDS, AD_RELEVANCE_FIELDS } from './src/services/metaClient';
import { META_RESOURCES, PRODUCT_FEATURES } from './src/intelligence/metaDependencyGraph';
import { config } from './src/config';

let failed = 0; let passed = 0;
const ok = (m: string) => { console.log('  ✓ ' + m); passed++; };
const bad = (m: string) => { console.error('  ✗ ' + m); failed++; };

function main() {
  const registeredFields = new Set(
    META_RESOURCES.filter((r) => r.kind === 'FIELD').map((r) => r.name),
  );
  const production = new Set<string>([...DEFAULT_INSIGHT_FIELDS, ...AD_RELEVANCE_FIELDS]);

  console.log('\n── 1. every production field is registered ──');
  {
    const missing = [...production].filter((f) => !registeredFields.has(f));
    if (missing.length) {
      bad(`production requests ${missing.length} field(s) the registry never heard of: ${missing.join(', ')}`
        + ' — the radar would answer "we do not depend on that" about a live dependency');
    } else ok(`all ${production.size} production fields appear in META_RESOURCES`);
  }

  console.log('\n── 2. every registered field is real ──');
  {
    // A registry entry for a field production does not request is allowed
    // ONLY when it declares itself as such. Otherwise it is a phantom
    // dependency that inflates every blast radius it appears in.
    const phantom = META_RESOURCES.filter(
      // The rule is that an unrequested entry DECLARES itself; the earlier
      // pattern demanded the exact words "not requested" and so rejected the
      // more honest "proven available, not yet requested".
      (r) => r.kind === 'FIELD' && !production.has(r.name) && !/not\s+(yet\s+)?requested/i.test(r.declaredIn),
    );
    if (phantom.length) {
      bad(`registry declares ${phantom.length} field(s) production never requests, without saying so: `
        + phantom.map((r) => r.name).join(', '));
    } else ok('no phantom fields — unrequested entries declare themselves explicitly');
  }

  console.log('\n── 3. structural integrity ──');
  {
    const ids = META_RESOURCES.map((r) => r.id);
    const dupR = [...new Set(ids.filter((v, i, a) => a.indexOf(v) !== i))];
    if (dupR.length) bad(`duplicate resource ids: ${dupR.join(', ')}`);
    else ok(`${ids.length} resource ids, none duplicated`);

    const fids = PRODUCT_FEATURES.map((f) => f.id);
    const dupF = [...new Set(fids.filter((v, i, a) => a.indexOf(v) !== i))];
    if (dupF.length) bad(`duplicate feature ids: ${dupF.join(', ')}`);
    else ok(`${fids.length} feature ids, none duplicated`);

    const known = new Set(ids);
    const dangling = PRODUCT_FEATURES.flatMap((f) =>
      f.dependsOn.filter((d) => !known.has(d)).map((d) => `${f.id} → ${d}`));
    if (dangling.length) bad(`dependsOn points at unregistered resources: ${dangling.join(', ')}`);
    else ok('every dependsOn resolves to a registered resource');
  }

  console.log('\n── 4. implementation paths exist on disk ──');
  {
    // A blast radius that names a moved or deleted file sends the engineer
    // to a dead end at exactly the moment they are under time pressure.
    const broken: string[] = [];
    for (const f of PRODUCT_FEATURES) {
      for (const p of f.implementedIn) {
        // Parenthesised entries are deliberate prose ("blocked — …"), not paths.
        if (p.startsWith('(')) continue;
        if (!existsSync(p)) broken.push(`${f.id} → ${p}`);
      }
    }
    if (broken.length) bad(`implementation paths that do not exist: ${broken.join(', ')}`);
    else ok('every implementedIn path exists on disk');

    const badDecl = META_RESOURCES.filter((r) => {
      if (r.declaredIn.startsWith('(')) return false;
      return !existsSync(r.declaredIn.split(':')[0]);
    });
    if (badDecl.length) bad(`declaredIn points at missing files: ${badDecl.map((r) => r.id).join(', ')}`);
    else ok('every declaredIn names a file that exists');
  }

  console.log('\n── 5. breakdowns and API version ──');
  {
    const bds = META_RESOURCES.filter((r) => r.kind === 'BREAKDOWN').map((r) => r.name);
    // These are the two combinations the product actually requests today.
    for (const need of ['age,gender', 'publisher_platform,platform_position']) {
      if (!bds.includes(need)) bad(`breakdown not registered: ${need}`);
    }
    if (!failed) ok(`${bds.length} breakdown combination(s) registered`);

    const ver = META_RESOURCES.find((r) => r.kind === 'API_VERSION');
    if (!ver) bad('no API_VERSION resource — a version bump would resolve to no dependency at all');
    else if (!config.meta.apiVersion) bad('config exposes no meta.apiVersion to depend on');
    else ok(`API version dependency registered (live value: ${config.meta.apiVersion})`);
  }

  console.log(`\n════ ${failed === 0 ? `${passed} passed, 0 failed` : `${failed} FAILURES`} ════\n`);
  process.exit(failed ? 1 : 0);
}

main();
