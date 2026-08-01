#!/usr/bin/env node
/* Release gate. Reads release-manifest.yaml and nothing else for versions,
 * ranges, and paths. Exits non-zero if the release may not proceed.
 *
 *   node tools/release/validate.mjs            # validate current status
 *   node tools/release/validate.mjs --release  # additionally assert the
 *                                              # manifest may be marked released
 *
 * Each validator is independent and reports every failure it finds — it does
 * not stop at the first. A gate that hides the second defect behind the first
 * costs a full CI round per defect.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml } from "./yaml.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST = join(ROOT, "release-manifest.yaml");
const RELEASE_MODE = process.argv.includes("--release");

/* Every validator is registered up front. A validator that produced no rows
 * must still appear in the report as PASS — otherwise a validator that threw,
 * was renamed, or was quietly deleted looks exactly like one that passed, and
 * the gate silently narrows without anyone noticing.
 */
const VALIDATORS = [
  "validate-manifest-schema", "validate-policy", "validate-contracts",
  "validate-knowledge", "validate-evidence", "validate-runtime",
  "validate-feature-flags", "validate-ui-claim-bindings",
  "validate-verification", "validate-artifacts",
];
const results = [];
const record = (validator, ok, message) => {
  if (!VALIDATORS.includes(validator) && validator !== "release-rule")
    throw new Error(`unregistered validator "${validator}"`);
  results.push({ validator, ok, message });
};
const fail = (v, m) => record(v, false, m);
const pass = (v, m) => record(v, true, m);

const SUPPORTED_SCHEMA = [1];
const SUPPORTED_POLICY = ["1.0.0"];
const STATUSES = ["draft", "candidate", "released", "superseded", "withdrawn"];
const VERIFY_STATES = ["pass", "fail", "pending", "not-applicable"];
const CLAIM_STATES = ["published", "review-due", "withdrawn"];

const semver = (v) => /^\d+\.\d+\.\d+$/.test(String(v));
const range = (v) => /^\d+\.\d+\.x$/.test(String(v)) || /^\d{4}\.\d{2}\.\d+$/.test(String(v));
const iso = (v) => !Number.isNaN(Date.parse(String(v)));
const inRange = (version, supported) => {
  if (!semver(version)) return supported === version;
  const [maj, min] = version.split(".");
  return supported === `${maj}.${min}.x`;
};
const sha256 = (p) => "sha256:" + createHash("sha256").update(readFileSync(p)).digest("hex");
const exists = (rel) => { const p = join(ROOT, rel); return existsSync(p) && statSync(p).isFile(); };

/* ── 1. validate-manifest-schema ───────────────────────────────────────── */
let m;
try {
  m = parseYaml(readFileSync(MANIFEST, "utf8"));
  pass("validate-manifest-schema", "manifest parsed");
} catch (e) {
  console.error(`validate-manifest-schema  FAIL  ${e.message}`);
  process.exit(1);
}
{
  const v = "validate-manifest-schema";
  if (!SUPPORTED_SCHEMA.includes(m.schemaVersion))
    fail(v, `schemaVersion ${m.schemaVersion} unsupported (expected ${SUPPORTED_SCHEMA.join(", ")})`);
  if (!STATUSES.includes(m.status)) fail(v, `status "${m.status}" not one of ${STATUSES.join(" | ")}`);
  for (const k of ["releaseId", "governance", "release", "runtimeConfiguration", "verification", "artifacts"])
    if (m[k] == null) fail(v, `missing required top-level key "${k}"`);
  if (m.status === "released" && !iso(m.releasedAt)) fail(v, "status=released requires an ISO releasedAt");
  if (m.status !== "released" && m.releasedAt != null) fail(v, `releasedAt must be null while status=${m.status}`);
  if (m.releaseId !== `platform-${m.release?.platform}`)
    fail(v, `releaseId "${m.releaseId}" does not match release.platform "${m.release?.platform}"`);
}

/* ── 2. validate-policy ────────────────────────────────────────────────── */
{
  const v = "validate-policy";
  const pv = m.governance?.policyVersion;
  if (!semver(pv)) fail(v, `governance.policyVersion "${pv}" is not semver`);
  else if (!SUPPORTED_POLICY.includes(pv)) fail(v, `policyVersion ${pv} is not supported by this validator`);
  if (!Array.isArray(m.governance?.adrs) || !m.governance.adrs.length) fail(v, "at least one ADR must be linked");
}

/* ── 3. validate-contracts ─────────────────────────────────────────────── */
{
  const v = "validate-contracts";
  const declared = new Map();
  for (const c of m.clinicalContracts ?? []) {
    if (!semver(c.version)) fail(v, `${c.name}: version "${c.version}" is not semver`);
    if (!range(c.supported)) fail(v, `${c.name}: supported "${c.supported}" is not an x-range`);
    if (!inRange(c.version, c.supported))
      fail(v, `${c.name}: version ${c.version} falls outside supported range ${c.supported}`);
    declared.set(c.name, c);
  }
  // The four contracts named in release.clinical must be declared, and their
  // ranges must agree. This is the exact drift the manifest exists to prevent.
  const map = { interaction: "interaction-check", safetyAlert: "safety-alert", dispense: "dispense", adherence: "adherence" };
  for (const [key, name] of Object.entries(map)) {
    const want = m.release?.clinical?.[key];
    const got = declared.get(name);
    if (!got) { fail(v, `release.clinical.${key} names "${name}" but no such contract is declared`); continue; }
    if (got.supported !== want)
      fail(v, `release.clinical.${key}=${want} disagrees with clinicalContracts["${name}"].supported=${got.supported}`);
  }
  for (const k of ["ui", "api"]) {
    const r = m.release?.[k];
    if (!range(r?.supported)) fail(v, `release.${k}.supported "${r?.supported}" is not an x-range`);
    if (!semver(r?.minimum)) fail(v, `release.${k}.minimum "${r?.minimum}" is not semver`);
    else if (!inRange(r.minimum, r.supported))
      fail(v, `release.${k}.minimum ${r.minimum} is outside supported ${r.supported}`);
  }
  // A breaking clinical contract must be reflected in a platform MAJOR or
  // MINOR bump, never a PATCH. A breaking safety change hidden in a patch is
  // the single most dangerous shape a release can take.
  const breaking = (m.clinicalContracts ?? []).filter((c) => c.breakingChange);
  if (breaking.length && m.release?.platform?.endsWith(".0") === false)
    fail(v, `breaking contract(s) ${breaking.map((c) => c.name).join(", ")} require a non-patch platform version, got ${m.release.platform}`);
}

/* ── 4. validate-knowledge ─────────────────────────────────────────────── */
{
  const v = "validate-knowledge";
  const active = m.release?.knowledge?.activeRelease;
  const schema = m.release?.knowledge?.evidenceSchema;
  if (!/^\d{4}\.\d{2}\.\d+$/.test(String(active))) fail(v, `knowledge.activeRelease "${active}" must look like 2026.08.1`);
  if (!semver(schema)) fail(v, `knowledge.evidenceSchema "${schema}" is not semver`);
  for (const c of m.claims ?? []) {
    if (c.state === "published" && c.knowledgeRelease !== active)
      fail(v, `${c.id}: published against knowledge ${c.knowledgeRelease}, active release is ${active}`);
  }
}

/* ── 5. validate-evidence ──────────────────────────────────────────────── */
{
  const v = "validate-evidence";
  const contracts = new Set((m.clinicalContracts ?? []).map((c) => `${c.name}@${c.version}`));
  const seen = new Set();
  for (const c of m.claims ?? []) {
    if (seen.has(c.id)) fail(v, `duplicate claim id ${c.id}`);
    seen.add(c.id);
    if (!CLAIM_STATES.includes(c.state)) fail(v, `${c.id}: state "${c.state}" invalid`);
    if (!c.source) fail(v, `${c.id}: missing evidence source`);
    if (!c.reviewedBy) fail(v, `${c.id}: missing reviewer`);
    if (!c.limitations) fail(v, `${c.id}: a published clinical claim must state its limitations`);
    if (!iso(c.nextReviewAt)) fail(v, `${c.id}: nextReviewAt is not a date`);
    if (c.state === "published" && !contracts.has(c.contract))
      fail(v, `${c.id}: bound to contract ${c.contract}, which this release does not ship`);
    // A published claim whose review date has passed is not published — it is
    // stale, and stale clinical content presented as current is the failure
    // mode this whole framework exists to catch.
    if (c.state === "published" && Date.parse(c.nextReviewAt) < Date.now())
      fail(v, `${c.id}: published but review was due ${c.nextReviewAt} — must be marked review-due`);
    if (c.state === "review-due")
      record(v, true, `NOTE ${c.id}: review-due (blocks the evidence gate, not the build)`);
  }
}

/* ── 6. validate-runtime + 7. validate-feature-flags ───────────────────── */
{
  const v = "validate-runtime";
  const rc = m.runtimeConfiguration ?? {};
  if (!rc.featureFlags?.approvedSnapshot) fail(v, "no approved feature-flag snapshot");
  if (!String(rc.configurationHash ?? "").startsWith("sha256:")) fail(v, "configurationHash must be a sha256");
  if (RELEASE_MODE && rc.configurationHash === "sha256:REPLACE_AT_BUILD")
    fail(v, "configurationHash is still the build placeholder");

  const f = "validate-feature-flags";
  const declared = new Set((m.featureFlags ?? []).map((x) => x.name));
  for (const [name, value] of Object.entries(rc.featureFlags?.values ?? {})) {
    if (!declared.has(name)) { fail(f, `runtime enables "${name}", which is not in the flag registry`); continue; }
    const spec = (m.featureFlags ?? []).find((x) => x.name === name);
    // A clinical-safety flag that is ON in the approved snapshot must be an
    // explicit, reviewed decision — never a leftover from a test run.
    if (value === true && spec.clinicalImpact === "high")
      fail(f, `"${name}" has high clinical impact and must not be enabled in an approved snapshot`);
    if (value === true && spec.clinicalImpact === "review-required" && m.governance?.approvals?.clinical !== "approved")
      fail(f, `"${name}" requires clinical review before it may be enabled`);
  }
  for (const spec of m.featureFlags ?? []) {
    if (!spec.owner) fail(f, `"${spec.name}" has no owner`);
    if (!spec.removeBy) fail(f, `"${spec.name}" has no removal version — permanent complexity`);
    // A flag whose removal version has arrived is debt that is now overdue.
    else if (cmp(spec.removeBy, m.release.platform) <= 0)
      fail(f, `"${spec.name}" was due for removal by ${spec.removeBy}; this release is ${m.release.platform}`);
  }
}
function cmp(a, b) {
  const A = String(a).split("."), B = String(b).split(".");
  for (let i = 0; i < 3; i++) { const d = (+A[i] || 0) - (+B[i] || 0); if (d) return d; }
  return 0;
}

/* ── 8. validate-ui-claim-bindings ─────────────────────────────────────── */
{
  const v = "validate-ui-claim-bindings";
  const claimIds = new Set((m.claims ?? []).map((c) => c.id));
  const live = new Set((m.claims ?? []).filter((c) => c.state !== "withdrawn").map((c) => c.id));
  const contracts = new Set((m.clinicalContracts ?? []).map((c) => `${c.name}@${c.version}`));
  for (const binding of m.uiClaimBindings ?? []) {
    if (!exists(binding.file)) { fail(v, `binding file missing: ${binding.file}`); continue; }
    const html = readFileSync(join(ROOT, binding.file), "utf8");
    const els = [...html.matchAll(/data-clinical-claim="([^"]+)"[\s\S]{0,300}?>/g)];
    if (!els.length) { record(v, true, `NOTE ${binding.file}: no clinical outputs bound yet`); continue; }
    for (const el of els) {
      const id = el[1];
      const block = el[0];
      if (!claimIds.has(id)) fail(v, `${binding.file}: renders unknown claim ${id}`);
      // The worst failure this validator can catch: the UI still showing a
      // claim the clinical team withdrew.
      else if (!live.has(id)) fail(v, `${binding.file}: renders WITHDRAWN claim ${id}`);
      for (const attr of binding.requiredAttributes ?? [])
        if (!block.includes(`${attr}=`)) fail(v, `${binding.file}: claim ${id} is missing ${attr}`);
      const c = /data-clinical-contract="([^"]+)"/.exec(block)?.[1];
      if (c && !contracts.has(c)) fail(v, `${binding.file}: claim ${id} cites contract ${c}, not shipped in this release`);
      const kr = /data-knowledge-release="([^"]+)"/.exec(block)?.[1];
      if (kr && kr !== m.release.knowledge.activeRelease)
        fail(v, `${binding.file}: claim ${id} cites knowledge ${kr}, active is ${m.release.knowledge.activeRelease}`);
    }
  }
}

/* ── 9. validate-verification ──────────────────────────────────────────── */
{
  const v = "validate-verification";
  for (const [gate, g] of Object.entries(m.verification ?? {})) {
    if (!VERIFY_STATES.includes(g?.status)) { fail(v, `${gate}: status "${g?.status}" invalid`); continue; }
    if (g.status === "pending") continue;
    if (!iso(g.verifiedAt)) fail(v, `${gate}: passed without a verifiedAt timestamp`);
    if (!g.verifiedBy) fail(v, `${gate}: passed without an identified verifier`);
    if (!g.evidence) { fail(v, `${gate}: passed without evidence`); continue; }
    if (!exists(g.evidence)) { fail(v, `${gate}: evidence file missing at ${g.evidence}`); continue; }
    if (!g.scope) fail(v, `${gate}: passed without declaring what was in scope`);
    // The hash is what stops a report being swapped after the gate opened.
    if (!g.evidenceHash) fail(v, `${gate}: evidence is not hashed`);
    else if (g.evidenceHash !== "sha256:REPLACE_AT_BUILD") {
      const actual = sha256(join(ROOT, g.evidence));
      if (actual !== g.evidenceHash)
        fail(v, `${gate}: evidence ${g.evidence} has changed since it was verified (hash mismatch)`);
    } else if (RELEASE_MODE) fail(v, `${gate}: evidenceHash is still the build placeholder`);
  }
}

/* ── 10. validate-artifacts ────────────────────────────────────────────── */
{
  const v = "validate-artifacts";
  for (const [name, rel] of Object.entries(m.artifacts ?? {})) {
    if (!rel) { fail(v, `artifact "${name}" has no path`); continue; }
    if (!exists(rel)) record(v, !RELEASE_MODE, `artifact "${name}" not present at ${rel}${RELEASE_MODE ? "" : " (generated at release time)"}`);
  }
  // A generated file that a human edited is a second source of truth wearing
  // a disguise. Regenerate and diff to prove it is still derived.
  for (const rel of m.generated ?? [])
    if (!exists(rel)) record(v, !RELEASE_MODE, `generated output "${rel}" not yet produced — run tools/release/generate.mjs`);
}

/* ── Release rule ──────────────────────────────────────────────────────── */
if (RELEASE_MODE) {
  const v = "release-rule";
  if (m.status !== "released") fail(v, `--release requires status: released, got "${m.status}"`);
  for (const [gate, g] of Object.entries(m.verification ?? {}))
    if (g?.status !== "pass" && g?.status !== "not-applicable") fail(v, `verification gate "${gate}" is ${g?.status}`);
  for (const [who, state] of Object.entries(m.governance?.approvals ?? {}))
    if (state !== "approved") fail(v, `approval "${who}" is ${state}`);
  const due = (m.claims ?? []).filter((c) => c.state === "review-due");
  if (due.length) fail(v, `${due.length} claim(s) awaiting evidence review: ${due.map((c) => c.id).join(", ")}`);
}

/* ── Report ────────────────────────────────────────────────────────────── */
const failures = results.filter((r) => !r.ok);
const byValidator = [...VALIDATORS, ...(RELEASE_MODE ? ["release-rule"] : [])];
console.log(`\nDawai release gate — ${m.releaseId} (status: ${m.status}, policy ${m.governance?.policyVersion})\n`);
for (const v of byValidator) {
  const rows = results.filter((r) => r.validator === v);
  const bad = rows.filter((r) => !r.ok);
  console.log(`  ${bad.length ? "FAIL" : "PASS"}  ${v}`);
  for (const r of rows) if (!r.ok || r.message.startsWith("NOTE")) console.log(`        ${r.message}`);
}
console.log(
  failures.length
    ? `\n${failures.length} blocking issue(s). Release may not proceed.\n`
    : `\nAll validators passed${RELEASE_MODE ? "" : " for status=" + m.status}.\n`
);
process.exit(failures.length ? 1 : 0);
