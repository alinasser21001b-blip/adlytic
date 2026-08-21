// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/brainObservatoryPage.ts — THE BRAIN'S X-RAY VIEW
//
//  Developer/admin-only inspector for how the Brain reached a conclusion on
//  ONE campaign. Not a dashboard, not a merchant surface, not a redesign.
//
//  Ten panes, in chain order:
//    1 OBJECT IDENTITY → 2 TEMPORAL TRUTH → 3 META TRUTH → 4 SEMANTICS
//    → 5 ANOMALIES → 6 EVIDENCE → 7 DIAGNOSIS → 8 DECISION
//    → 9 LLM LAYER → 10 TRACE
//
//  IDENTITY and TEMPORAL TRUTH lead deliberately. Every question the panes
//  below answer is meaningless until "which entity, at which level, over
//  which days?" is settled, and both were previously left implicit.
//
//  ── FRONTEND CONTRACT ─────────────────────────────────────────────────
//
//  This page RENDERS. It does not reason. Every number, verdict and label
//  below is printed verbatim from /api/admin/brain-observatory/:campaignId,
//  which is assembled by services/brainObservatory.ts out of the canonical
//  engines. The client-side JS here contains no threshold, no ratio, no
//  metric arithmetic, and no objective/family mapping — deliberately, and
//  test_brain_observatory.ts fails the build if any appears.
//
//  Fact kinds are colour-coded so a reviewer can see at a glance which
//  statements are measured, which are inferred, and which are LLM prose:
//    OBSERVED_FACT · DERIVED_FACT · ANOMALY · DIAGNOSIS
//    RECOMMENDATION · DO_NOT_DO · LLM_EXPLANATION · NOT_MEASURED
// ════════════════════════════════════════════════════════════════════════

import { TOKENS_CSS_PATH } from '../layout';
import { adminSurfaceNav } from './adminSurfaceNav';

export function brainObservatoryPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Brain Observatory — Adlytic</title>
  <link rel="stylesheet" href="${TOKENS_CSS_PATH}" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --font: var(--font-body); }
    html, body { height: 100%; background: var(--bg); color: var(--text); font-family: var(--font-body); font-size: 14px; }
    a { color: inherit; text-decoration: none; }
    button { cursor: pointer; border: none; background: none; font: inherit; color: inherit; }

    .app { display: flex; height: 100vh; overflow: hidden; }
    .sidebar { width: 220px; flex-shrink: 0; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
    .sidebar-logo { padding: 20px 20px 16px; font-size: 18px; font-weight: 700; border-bottom: 1px solid var(--border); letter-spacing: -0.3px; }
    .sidebar-logo span { color: var(--accent); }
    .sidebar-nav { flex: 1; padding: 12px 8px; display: flex; flex-direction: column; gap: 2px; }
    .nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; color: var(--text-2); font-size: 13.5px; font-weight: 500; }
    .nav-item:hover { background: var(--surface-2); color: var(--text); }
    .nav-item.active { background: var(--accent-dim); color: var(--accent); }
    .nav-label { font-size: 10px; font-weight: 700; color: var(--text-3); padding: 10px 12px 4px; letter-spacing: 0.04em; }

    .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .topbar { height: 56px; flex-shrink: 0; background: var(--surface); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 24px; gap: 16px; }
    .topbar-title { font-weight: 600; font-size: 15px; }
    .content { flex: 1; overflow-y: auto; padding: 24px; }
    .page-title { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .page-subtitle { font-size: 13px; color: var(--text-2); margin-bottom: 20px; }

    select#campaign-picker { min-width: 320px; max-width: 46vw; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); font-size: 13px; }
    .btn { padding: 8px 14px; border-radius: 7px; background: var(--accent); color: #fff; font-size: 12px; font-weight: 600; }
    .btn:hover { opacity: 0.9; }
    .btn[disabled] { opacity: 0.5; cursor: not-allowed; }

    .spinner { width: 34px; height: 34px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.75s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .state-overlay { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 280px; gap: 14px; }
    .state-text { font-size: 13px; color: var(--text-2); text-align: center; max-width: 460px; }
    .error-box { padding: 16px; border: 1px solid var(--error); background: var(--error-dim); border-radius: 10px; color: var(--error); font-size: 13px; }

    /* Chain panes */
    .stage { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); margin-bottom: 14px; overflow: hidden; }
    .stage-head { display: flex; align-items: center; gap: 10px; padding: 13px 16px; border-bottom: 1px solid var(--border); background: var(--surface-2); }
    .stage-num { width: 22px; height: 22px; border-radius: 50%; background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .stage-title { font-size: 13.5px; font-weight: 700; letter-spacing: 0.02em; }
    .stage-meta { margin-left: auto; font-size: 11.5px; color: var(--text-3); }
    .stage-body { padding: 14px 16px; }

    table.facts { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    table.facts th { text-align: left; padding: 7px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-3); border-bottom: 1px solid var(--border); }
    table.facts td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
    table.facts tr:last-child td { border-bottom: none; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
    td.src { color: var(--text-3); font-size: 11px; font-family: var(--font-mono, monospace); }

    .kind { display: inline-block; padding: 2px 7px; border-radius: 5px; font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; white-space: nowrap; }
    .kind-OBSERVED_FACT   { background: var(--success-dim); color: var(--success); border: 1px solid var(--success); }
    .kind-DERIVED_FACT    { background: var(--accent-dim);  color: var(--accent);  border: 1px solid var(--accent); }
    .kind-ANOMALY         { background: var(--warning-dim); color: var(--warning); border: 1px solid var(--warning); }
    .kind-DIAGNOSIS       { background: var(--warning-dim); color: var(--warning); border: 1px solid var(--warning); }
    .kind-RECOMMENDATION  { background: var(--success-dim); color: var(--success); border: 1px solid var(--success); }
    .kind-DO_NOT_DO       { background: var(--error-dim);   color: var(--error);   border: 1px solid var(--error); }
    .kind-LLM_EXPLANATION { background: var(--surface-2);   color: var(--text-3);  border: 1px dashed var(--text-3); }
    .kind-NOT_MEASURED    { background: var(--surface-2);   color: var(--text-3);  border: 1px dashed var(--border); }

    /* Action states: an endorsement and a mere absence of veto must not look alike. */
    .st { display: inline-block; padding: 2px 7px; border-radius: 5px; font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; white-space: nowrap; }
    .st-RECOMMENDED { background: var(--success-dim); color: var(--success); border: 1px solid var(--success); }
    .st-NOT_VETOED  { background: transparent; color: var(--text-3); border: 1px dashed var(--text-3); }
    .st-FORBIDDEN   { background: var(--error-dim); color: var(--error); border: 1px solid var(--error); }
    .st-AUTHORITY_INVARIANT_VIOLATION { background: var(--error); color: #fff; border: 1px solid var(--error); }

    .dates { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .date-chip { padding: 2px 6px; border-radius: 4px; font-size: 10.5px; font-family: var(--font-mono, monospace); background: var(--success-dim); color: var(--success); border: 1px solid var(--success); }
    .date-chip.absent { background: var(--surface-2); color: var(--text-3); border: 1px dashed var(--text-3); }
    .basis { margin-top: 8px; font-size: 11.5px; line-height: 1.6; color: var(--text-2); border-left: 2px solid var(--border); padding-left: 10px; }
    .trace-step.absent .trace-layer { color: var(--text-3); }
    .trace-src { font-size: 10.5px; color: var(--text-3); font-family: var(--font-mono, monospace); margin-top: 3px; }
    .counter-item { border-left: 2px solid var(--warning); padding: 6px 0 6px 10px; margin-bottom: 8px; font-size: 12.5px; }

    .pill { display: inline-block; padding: 3px 9px; border-radius: 6px; font-size: 11px; font-weight: 700; }
    .pill-ok    { background: var(--success-dim); color: var(--success); border: 1px solid var(--success); }
    .pill-warn  { background: var(--warning-dim); color: var(--warning); border: 1px solid var(--warning); }
    .pill-bad   { background: var(--error-dim);   color: var(--error);   border: 1px solid var(--error); }
    .pill-muted { background: var(--surface-2);   color: var(--text-2);  border: 1px solid var(--border); }

    .kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
    .kv-item { display: flex; flex-direction: column; gap: 3px; }
    .kv-label { font-size: 10px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.5px; }
    .kv-value { font-size: 15px; font-weight: 700; }

    .llm-box { padding: 12px 14px; border: 1px dashed var(--text-3); border-radius: 8px; background: var(--surface-2); color: var(--text-2); font-size: 13px; line-height: 1.7; }
    .llm-warn { font-size: 11px; font-weight: 700; color: var(--warning); letter-spacing: 0.03em; margin-bottom: 8px; }

    .trace-step { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--border); font-size: 12.5px; }
    .trace-step:last-child { border-bottom: none; }
    .trace-layer { font-weight: 700; color: var(--accent); min-width: 180px; font-family: var(--font-mono, monospace); font-size: 11.5px; }
    .chain-strip { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 16px; font-size: 11.5px; }
    .chain-node { padding: 5px 10px; border-radius: 6px; background: var(--surface-2); border: 1px solid var(--border); font-weight: 600; }
    .chain-arrow { color: var(--text-3); }
    .muted { color: var(--text-3); font-size: 12px; }
    .ev-item { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
    .ev-head { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
    .ev-code { font-weight: 700; font-size: 12.5px; font-family: var(--font-mono, monospace); }
  </style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="sidebar-logo">Ad<span>lytic</span></div>
    <nav class="sidebar-nav">
      ${adminSurfaceNav('observability')}
      <div class="nav-label">Brain</div>
      <a class="nav-item active" href="/admin/brain-observatory">Brain Observatory</a>
    </nav>
  </aside>

  <div class="main">
    <header class="topbar">
      <span class="topbar-title">Brain Observatory</span>
      <div style="display:flex;gap:10px;align-items:center;">
        <select id="campaign-picker"><option value="">Loading campaigns…</option></select>
        <button class="btn" id="btn-inspect" disabled>Inspect</button>
      </div>
    </header>

    <main class="content">
      <div class="page-title">Brain Observatory</div>
      <div class="page-subtitle">
        Read-only X-ray of how the Brain reached its conclusion for one campaign.
        Every value is printed verbatim from the canonical engines — this page computes nothing.
      </div>

      <div class="chain-strip">
        <span class="chain-node">Meta</span><span class="chain-arrow">→</span>
        <span class="chain-node">Semantics</span><span class="chain-arrow">→</span>
        <span class="chain-node">Anomaly</span><span class="chain-arrow">→</span>
        <span class="chain-node">Evidence</span><span class="chain-arrow">→</span>
        <span class="chain-node">Diagnosis</span><span class="chain-arrow">→</span>
        <span class="chain-node">Decision</span><span class="chain-arrow">→</span>
        <span class="chain-node">LLM</span>
      </div>

      <div id="idle-state" class="state-overlay">
        <div class="state-text">Pick a campaign above, then press <strong>Inspect</strong>.</div>
      </div>
      <div id="loading-state" class="state-overlay" style="display:none;">
        <div class="spinner"></div><span class="state-text">Assembling the reasoning chain…</span>
      </div>
      <div id="error-state" style="display:none;"><div class="error-box" id="error-msg"></div></div>
      <div id="report" style="display:none;"></div>
    </main>
  </div>
</div>

<script>
(function () {
  'use strict';
  function getToken() { try { return localStorage.getItem('adlytic_token') || ''; } catch (e) { return ''; } }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /** Printing helper ONLY — never converts units, never computes. */
  function show(v) {
    if (v === null || v === undefined || v === '') return '—';
    return esc(v);
  }

  async function apiFetch(url) {
    var res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + getToken() } });
    if (!res.ok) {
      var msg = 'Request failed (' + res.status + ')';
      try { var j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
      throw new Error(msg);
    }
    return res.json();
  }

  function setState(which) {
    ['idle-state', 'loading-state', 'error-state', 'report'].forEach(function (id) {
      document.getElementById(id).style.display = (id === which) ? (id === 'report' ? 'block' : '') : 'none';
    });
    if (which === 'idle-state' || which === 'loading-state') {
      document.getElementById(which).style.display = 'flex';
    }
  }

  function factRows(facts) {
    if (!facts || !facts.length) return '<tr><td colspan="5" class="muted">No items.</td></tr>';
    return facts.map(function (f) {
      var base = (f.baseline === null || f.baseline === undefined) ? '' : show(f.baseline);
      return '<tr>'
        + '<td><span class="kind kind-' + esc(f.kind) + '">' + esc(f.kind) + '</span></td>'
        + '<td>' + esc(f.label) + '</td>'
        + '<td class="num">' + show(f.value) + '</td>'
        + '<td class="num" style="color:var(--text-3);font-weight:500;">' + (base || '—') + '</td>'
        + '<td class="src">' + esc(f.source) + '</td>'
        + '</tr>';
    }).join('');
  }

  function factTable(facts) {
    return '<table class="facts"><thead><tr>'
      + '<th>Kind</th><th>Item</th><th style="text-align:right;">Current</th>'
      + '<th style="text-align:right;">Prior window</th><th>Canonical source</th>'
      + '</tr></thead><tbody>' + factRows(facts) + '</tbody></table>';
  }

  function stage(num, title, meta, bodyHtml) {
    return '<section class="stage"><div class="stage-head">'
      + '<div class="stage-num">' + num + '</div><div class="stage-title">' + esc(title) + '</div>'
      + '<div class="stage-meta">' + esc(meta || '') + '</div></div>'
      + '<div class="stage-body">' + bodyHtml + '</div></section>';
  }

  function kv(label, value, pillClass) {
    var v = pillClass
      ? '<span class="pill ' + pillClass + '">' + show(value) + '</span>'
      : '<span class="kv-value">' + show(value) + '</span>';
    return '<div class="kv-item"><span class="kv-label">' + esc(label) + '</span>' + v + '</div>';
  }

  function render(d) {
    var html = '';

    // ── A2 IDENTITY. Levels are stated, not implied: an ad-level Meta
    // screenshot compared against campaign-level intelligence is the single
    // most common false "contradiction", and naming both ends stops it.
    var idn = d.identity;
    html += '<div style="margin-bottom:14px;">'
      + '<div style="font-size:17px;font-weight:700;">' + esc(idn.campaignName) + '</div>'
      + '<div class="muted">' + esc(idn.internalEntityId) + ' · Meta ' + esc(idn.metaExternalId)
      + ' · ' + esc(idn.status) + '</div></div>';

    html += stage(1, 'OBJECT IDENTITY', 'what exactly is being inspected',
      '<div class="kv">'
      + kv('Adlytic entity', idn.internalEntityType + ' ' + idn.internalEntityId)
      + kv('Meta entity', idn.metaEntityType + ' ' + idn.metaExternalId)
      + kv('Insights query level', idn.insightsQueryLevel)
      + kv('DailyStat owned by', idn.dailyStatOwnershipLevel)
      + kv('Parent account', idn.parentAccount
          ? idn.parentAccount.internalId + ' · Meta ' + (idn.parentAccount.externalId || '—')
          : '—')
      + kv('Parent campaign', idn.parentCampaign ? idn.parentCampaign.externalId : 'n/a — this IS the campaign level')
      + '</div>'
      + '<div class="basis">Every figure below is measured at the '
      + esc(idn.insightsQueryLevel) + ' level. Figures read from a Meta screenshot at any '
      + 'other level are a different measurement, not a contradiction of this one.</div>');

    // ── A1/A3 TEMPORAL TRUTH. The old single "data status: COMPLETE" is
    // gone from the headline: it conflated presence, coverage, settlement and
    // freshness into one word, which is how a one-row window came to read as
    // complete. Each axis is now shown separately, and the dates themselves
    // are listed so "which days exist?" needs no inference.
    var tp = d.temporal;
    var storedChips = tp.storedDates.length
      ? tp.storedDates.map(function (x) { return '<span class="date-chip">' + esc(x) + '</span>'; }).join('')
      : '<span class="muted">no rows stored in this span</span>';
    var absentChips = tp.datesWithoutRows.length
      ? tp.datesWithoutRows.map(function (x) { return '<span class="date-chip absent">' + esc(x) + '</span>'; }).join('')
      : '<span class="muted">none — every day in the span carries a row</span>';

    html += stage(2, 'TEMPORAL TRUTH', 'which days were actually measured',
      '<div class="kv" style="margin-bottom:12px;">'
      + kv('Requested span', tp.requestedSpan.since + ' → ' + tp.requestedSpan.until)
      + kv('Boundaries', tp.boundarySemantics)
      + kv('Data presence', tp.dataPresence, tp.dataPresence === 'AVAILABLE' ? 'pill-ok' : 'pill-bad')
      + kv('Temporal coverage', tp.temporalCoverage, tp.temporalCoverage === 'FULL' ? 'pill-ok' : 'pill-muted')
      + kv('Settlement', tp.settlement, 'pill-ok')
      + kv('Freshness', tp.freshness, 'pill-muted')
      + kv('Stored days', tp.uniqueDateCount + ' of ' + (tp.uniqueDateCount + tp.datesWithoutRows.length))
      + kv('Backfill horizon', tp.backfillHorizonDays + ' days')
      + kv('Last synced', tp.lastSyncedAt || 'never')
      + kv('Sync age (days)', tp.syncAgeDays === null ? 'unknown' : tp.syncAgeDays)
      + '</div>'
      + '<div class="kv-label">Days WITH a stored row</div><div class="dates">' + storedChips + '</div>'
      + '<div class="kv-label" style="margin-top:10px;">Days WITHOUT a stored row</div><div class="dates">' + absentChips + '</div>'
      + '<div class="basis"><strong>Coverage basis.</strong> ' + esc(tp.coverageBasis) + '</div>'
      + '<div class="basis"><strong>Expected-eligible days.</strong> ' + esc(tp.expectedEligibleDatesBasis) + '</div>'
      + '<div class="basis"><strong>Settlement basis.</strong> ' + esc(tp.settlementBasis) + '</div>'
      + '<div class="basis"><strong>Freshness basis.</strong> ' + esc(tp.freshnessBasis) + '</div>'
      + '<div class="basis"><strong>Deprecated legacy status: "'
      + esc(tp.legacyDataStatus) + '".</strong> ' + esc(tp.legacyDataStatusBasis) + '</div>');

    // 1b META TRUTH — the numbers themselves.
    html += stage(3, 'META TRUTH', 'stored canonical values, copied verbatim',
      '<div class="kv" style="margin-bottom:12px;">'
      + kv('Current window', d.metaTruth.currentWindow.since + ' → ' + d.metaTruth.currentWindow.until)
      + kv('Prior window', d.metaTruth.priorWindow.since + ' → ' + d.metaTruth.priorWindow.until)
      + kv('Daily rows', d.metaTruth.dailyRowsInWindow)
      + '</div>' + factTable(d.metaTruth.facts));

    // 2 SEMANTICS
    html += stage(4, 'SEMANTICS', 'purpose → primary KPI → result unit',
      '<div class="kv" style="margin-bottom:12px;">'
      + kv('Raw Meta objective', d.semantics.objective)
      + kv('Resolved family', d.semantics.purposeFamily)
      + kv('Primary KPI', d.semantics.primaryKpi)
      + kv('Result unit', d.semantics.resultUnit)
      + kv('Classification', d.semantics.classificationConfidence,
          d.semantics.classificationConfidence === 'CONFIRMED' ? 'pill-ok' : 'pill-warn')
      + kv('Approximate result', String(d.semantics.resultApproximate),
          d.semantics.resultApproximate ? 'pill-warn' : 'pill-ok')
      + '</div>'
      + (d.semantics.purposeReasonAr
          ? '<div class="muted" style="margin-bottom:10px;" dir="rtl">' + esc(d.semantics.purposeReasonAr) + '</div>'
          : '')
      + factTable(d.semantics.facts));

    // 3 ANOMALIES
    var fat = d.anomalies.fatigue;
    html += stage(5, 'ANOMALIES', d.anomalies.significant ? 'SIGNIFICANT' : 'not significant',
      '<div class="kv" style="margin-bottom:12px;">'
      + kv('Anomaly kind', d.anomalies.kind)
      + kv('Significant', String(d.anomalies.significant), d.anomalies.significant ? 'pill-warn' : 'pill-ok')
      + kv('Confidence', d.anomalies.confidence)
      + kv('Fatigue severity', fat ? fat.severity : 'n/a', fat && fat.severity !== 'NONE' ? 'pill-warn' : 'pill-muted')
      + kv('Corroborating signals', fat ? fat.corroboratingSignals : '—')
      + '</div>'
      + (fat && fat.evidence && fat.evidence.length
          ? '<div class="muted" style="margin-bottom:10px;" dir="rtl">' + fat.evidence.map(esc).join(' · ') + '</div>'
          : '')
      + factTable(d.anomalies.facts));

    // 4 EVIDENCE
    var evHtml;
    if (!d.evidence.items.length) {
      evHtml = '<div class="muted">No canonical Evidence rows in this window.</div>';
    } else {
      evHtml = d.evidence.items.map(function (it) {
        var metrics = (it.metrics || []).map(function (m) {
          return '<tr>'
            + '<td><span class="kind kind-OBSERVED_FACT">EVIDENCE</span></td>'
            + '<td>' + esc(m.metricKey) + ' <span class="muted">(' + esc(m.valueKind) + ')</span></td>'
            + '<td class="num">' + show(m.value) + ' ' + esc(m.unit || '') + '</td>'
            + '<td class="num" style="color:var(--text-3);font-weight:500;">'
              + (m.threshold === null || m.threshold === undefined ? '—' : 'thr ' + show(m.threshold)) + '</td>'
            + '<td class="src">detected_issues.evidence_json</td>'
            + '</tr>';
        }).join('');
        return '<div class="ev-item">'
          + '<div class="ev-head"><span class="ev-code">' + esc(it.issueCode) + '</span>'
          + '<span class="pill pill-muted">' + esc(it.severity) + '</span>'
          + '<span class="muted">' + esc(it.date) + '</span>'
          + (it.suppressed ? '<span class="pill pill-bad">SUPPRESSED</span>' : '')
          + '</div>'
          + (metrics
              ? '<table class="facts"><tbody>' + metrics + '</tbody></table>'
              : '<div class="muted">Legacy-shaped evidence row — no canonical metrics.</div>')
          + '</div>';
      }).join('');
    }
    html += stage(6, 'EVIDENCE', d.evidence.count + ' issue row(s)', evHtml);

    // 5 DIAGNOSIS
    html += stage(7, 'DIAGNOSIS', 'decided by ' + d.diagnosis.decidedBy,
      '<div class="kv" style="margin-bottom:12px;">'
      + kv('Problem class', d.diagnosis.problemClass, 'pill-warn')
      + kv('Confidence', d.diagnosis.confidence)
      + kv('Alert', String(d.diagnosis.alert), d.diagnosis.alert ? 'pill-warn' : 'pill-ok')
      + kv('Suppressed issues', d.diagnosis.suppressedIssueCodes.length)
      + '</div>'
      + (d.diagnosis.evidenceNarrative && d.diagnosis.evidenceNarrative.length
          ? '<div style="margin-bottom:10px;" dir="rtl">'
            + d.diagnosis.evidenceNarrative.map(function (e) {
                return '<div class="muted" style="padding:3px 0;">• ' + esc(e) + '</div>';
              }).join('')
            + '</div>'
          : '')
      + (d.diagnosis.suppressedIssueCodes.length
          ? '<div class="muted" style="margin-bottom:10px;">Suppressed (a higher layer already explains these): '
            + d.diagnosis.suppressedIssueCodes.map(esc).join(', ') + '</div>'
          : '')
      // A5 — what argues AGAINST this verdict. Drawn only from canonical
      // output the diagnosis already consumed; nothing here is a second
      // opinion computed for display.
      + '<div class="kv-label" style="margin-top:4px;">Counter-evidence</div>'
      + (d.diagnosis.counterEvidence && d.diagnosis.counterEvidence.length
          ? d.diagnosis.counterEvidence.map(function (c) {
              return '<div class="counter-item">' + esc(c.statement)
                + '<div class="trace-src">' + esc(c.canonicalSource) + '</div></div>';
            }).join('')
          : '<div class="muted" style="margin-bottom:10px;">None. No canonical layer produced a '
            + 'competing explanation for this window.</div>')
      + factTable(d.diagnosis.facts));

    // 6 DECISION
    // A4 — "PERMITTED" read as "the Brain advises this", which is how an
    // INSUFFICIENT_DATA campaign appeared to endorse INCREASE_BUDGET and
    // PAUSE. The veto channel (permitAction) and the endorsement channel
    // (the canonical recommendation) are different questions, so they are
    // shown as different states and styled so they cannot be confused.
    var STATE_NOTE = {
      RECOMMENDED: 'the canonical recommendation names this action',
      NOT_VETOED: 'not blocked — but nothing advises it. Absence of a veto, not an endorsement.',
      FORBIDDEN: '',
      AUTHORITY_INVARIANT_VIOLATION: 'RECOMMENDED YET FORBIDDEN — this must never happen; report it.'
    };
    var auditRows = d.decision.actionAudit.map(function (a) {
      return '<tr>'
        + '<td><span class="st st-' + esc(a.state) + '">' + esc(a.state) + '</span></td>'
        + '<td>' + esc(a.actionCode) + '</td>'
        + '<td colspan="3" class="src">' + esc(a.reason || STATE_NOTE[a.state] || '') + '</td>'
        + '</tr>';
    }).join('');
    html += stage(8, 'DECISION', 'guarded by permitAction()',
      '<div class="kv" style="margin-bottom:12px;">'
      + kv('Recommended action', d.decision.recommendedAction, d.decision.recommendedAction ? 'pill-ok' : 'pill-muted')
      + kv('Forbidden count', d.decision.forbiddenActions.length,
          d.decision.forbiddenActions.length ? 'pill-bad' : 'pill-ok')
      + '</div>'
      + '<div class="muted" style="margin-bottom:8px;">Source: ' + esc(d.decision.recommendationSource) + '</div>'
      + '<table class="facts"><thead><tr><th>Verdict</th><th>Action code</th><th colspan="3">Reason (when blocked)</th></tr></thead>'
      + '<tbody>' + auditRows + '</tbody></table>');

    // 7 LLM LAYER
    var llm = d.llmLayer;
    var llmBody = '<div class="llm-warn">⚠ NON-AUTHORITATIVE NARRATION — explains the verdict above, never produces it.</div>';
    llmBody += '<div class="kv" style="margin-bottom:12px;">'
      + kv('Brain action', llm.brainAction)
      + kv('Tick date', llm.tickDate)
      + kv('Survives funnel diagnosis',
          llm.brainActionPermitted === null ? 'n/a' : String(llm.brainActionPermitted),
          llm.brainActionPermitted === false ? 'pill-bad' : (llm.brainActionPermitted ? 'pill-ok' : 'pill-muted'))
      + '</div>';
    if (llm.brainActionBlockedReason) {
      llmBody += '<div class="error-box" style="margin-bottom:10px;">CONTRADICTION: ' + esc(llm.brainActionBlockedReason) + '</div>';
    }
    llmBody += llm.narrationText
      ? '<div class="llm-box" dir="rtl">' + esc(llm.narrationText) + '</div>'
      : '<div class="muted">No narration stored for this campaign.</div>';
    html += stage(9, 'LLM LAYER', 'authoritative: false', llmBody);

    // 8 TRACE
    // Every canonical layer appears, in hierarchy.ts's own order, each naming
    // who decided it and from what. A layer the reconciler never reached is
    // shown as absent with its reason — never back-filled with a conclusion.
    var traceHtml = d.trace.length
      ? d.trace.map(function (t) {
          var absent = t.status !== 'REACHED';
          return '<div class="trace-step' + (absent ? ' absent' : '') + '">'
            + '<span class="trace-layer">' + t.ordinal + '. ' + esc(t.stage) + '</span>'
            + '<span><span class="st st-' + (absent ? 'NOT_VETOED' : 'RECOMMENDED') + '">'
            + esc(t.status) + '</span> '
            + esc(absent ? t.absenceReason : t.conclusion)
            + '<div class="trace-src">decided by: ' + esc(t.canonicalSource) + '</div>'
            + '<div class="trace-src">from: ' + esc(t.inputSource) + '</div>'
            + '</span></div>';
        }).join('')
      : '<div class="muted">No trace steps recorded.</div>';
    traceHtml += '<div style="margin-top:12px;">'
      + '<span class="pill ' + (d.backwardTraceComplete ? 'pill-ok' : 'pill-bad') + '">'
      + 'BACKWARD_TRACE_COMPLETE = ' + String(d.backwardTraceComplete) + '</span>'
      + '<span class="muted" style="margin-left:10px;">Reconstructed from engine output alone — no LLM statement required.</span></div>';
    html += stage(10, 'TRACE',
      d.tracedStages.length + ' of ' + d.trace.length + ' canonical layers reached', traceHtml);

    document.getElementById('report').innerHTML = html;
    setState('report');
  }

  async function loadCampaigns() {
    var picker = document.getElementById('campaign-picker');
    try {
      var rows = await apiFetch('/api/admin/brain-observatory/campaigns');
      if (!rows.length) {
        picker.innerHTML = '<option value="">No campaigns found</option>';
        return;
      }
      picker.innerHTML = '<option value="">Select a campaign…</option>' + rows.map(function (r) {
        var acct = r.adAccount ? r.adAccount.name : '';
        return '<option value="' + esc(r.id) + '">' + esc(r.name)
          + ' — ' + esc(r.status) + (acct ? ' · ' + esc(acct) : '') + '</option>';
      }).join('');
      document.getElementById('btn-inspect').disabled = false;
    } catch (e) {
      picker.innerHTML = '<option value="">' + esc(e.message) + '</option>';
    }
  }

  async function inspect() {
    var id = document.getElementById('campaign-picker').value;
    if (!id) return;
    setState('loading-state');
    try {
      render(await apiFetch('/api/admin/brain-observatory/' + encodeURIComponent(id)));
    } catch (e) {
      document.getElementById('error-msg').textContent = e.message;
      setState('error-state');
    }
  }

  document.getElementById('btn-inspect').addEventListener('click', inspect);
  document.getElementById('campaign-picker').addEventListener('change', function () {
    if (this.value) inspect();
  });
  setState('idle-state');
  loadCampaigns();
})();
</script>
</body>
</html>`;
}
