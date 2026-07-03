// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/dataDeletionPage.ts  —  Public Data Deletion instructions
//
//  Served at GET /data-deletion with NO authentication. Satisfies Meta's
//  "Data Deletion Instructions URL" requirement for App Review. Explains the
//  three self-service ways a user can have their Meta-derived data deleted,
//  and documents the automated deletion callback endpoint used by Meta.
//
//  When a request arrives with ?code=<confirmation_code>, we surface it so a
//  user who initiated deletion from Facebook can see their tracking code.
// ════════════════════════════════════════════════════════════════════════

import { SHARED_CSS } from '../layout';

export function dataDeletionPage(confirmationCode?: string): string {
  const codeBlock = confirmationCode
    ? `<div class="alert alert-info" style="margin-bottom:24px;">
         Your data deletion request has been received. Confirmation code:
         <strong style="margin-inline-start:6px;">${escapeHtml(confirmationCode)}</strong>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Data Deletion — Adlytic</title>
  <style>
    ${SHARED_CSS}
    body { min-height: 100vh; background: var(--bg); }
    .legal-wrap { max-width: 780px; margin: 0 auto; padding: 48px 20px 80px; }
    .legal-logo { display: flex; align-items: center; gap: 10px; margin-bottom: 32px; }
    .legal-logo-mark { width: 34px; height: 34px; background: var(--accent); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; color: #fff; }
    .legal-logo-text { font-size: 18px; font-weight: 800; letter-spacing: -0.4px; color: var(--text); }
    .legal-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 36px 40px; }
    .legal-card h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 6px; }
    .legal-updated { font-size: 12.5px; color: var(--text-3); margin-bottom: 28px; }
    .legal-card h2 { font-size: 16px; font-weight: 700; color: var(--text); margin: 28px 0 10px; }
    .legal-card p { font-size: 14px; color: var(--text-2); line-height: 1.7; margin-bottom: 12px; }
    .legal-card ol, .legal-card ul { margin: 0 0 12px 20px; }
    .legal-card li { font-size: 14px; color: var(--text-2); line-height: 1.7; margin-bottom: 6px; }
    .legal-card strong { color: var(--text); font-weight: 600; }
    .legal-card a { color: var(--accent-2); }
    .legal-card code { background: var(--surface-2); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; font-size: 12.5px; }
    .legal-footer { margin-top: 32px; font-size: 12.5px; color: var(--text-3); text-align: center; }
  </style>
</head>
<body>
  <div class="legal-wrap">
    <div class="legal-logo">
      <div class="legal-logo-mark">A</div>
      <span class="legal-logo-text">Adlytic</span>
    </div>
    <div class="legal-card">
      <h1>Data Deletion</h1>
      <div class="legal-updated">Effective date: 1 July 2026</div>

      ${codeBlock}

      <p>
        This procedure explains how users can revoke Adlytic's access to their Meta
        advertising account and request deletion of Meta account data stored in
        Adlytic. Adlytic is a <strong>read-only</strong> analytics platform; we use
        Meta advertising data only to provide analytics dashboards, reporting, and
        performance recommendations to the user or workspace that connected the account.
      </p>

      <h2>What data this procedure covers</h2>
      <ul>
        <li>Connected Meta ad account identifiers and account metadata.</li>
        <li>Campaign, ad set, ad, creative, and performance data retrieved through Meta's Marketing API.</li>
        <li>Historical reporting metrics, insights, breakdowns, and synchronization records.</li>
        <li>Meta OAuth tokens or connection records associated with the connected account.</li>
      </ul>
      <p>
        This procedure does <strong>not</strong> delete data from Meta's own systems.
        To delete data held by Meta, use Meta's account, business, or advertising
        tools directly.
      </p>

      <h2>Option 1 — Disconnect your Meta account inside Adlytic</h2>
      <ol>
        <li>Sign in to your Adlytic account.</li>
        <li>Open the workspace connected to your Meta advertising account.</li>
        <li>Go to <strong>Settings</strong> or <strong>Connected Accounts</strong>.</li>
        <li>Find the connected Meta advertising account.</li>
        <li>Select <strong>Disconnect</strong>, <strong>Remove</strong>, or <strong>Revoke Access</strong>, then confirm.</li>
      </ol>
      <p>
        After disconnection, Adlytic stops using the access token for that account and
        stops synchronizing new Meta advertising data for that connection.
      </p>

      <h2>Option 2 — Revoke access from Meta</h2>
      <ol>
        <li>Sign in to your Meta account.</li>
        <li>Open Meta's business, app, or account integration settings (<strong>Settings &amp; Privacy → Settings → Business Integrations</strong>).</li>
        <li>Find <strong>Adlytic</strong> in the list of connected apps or business integrations.</li>
        <li>Remove or revoke Adlytic's access.</li>
      </ol>
      <p>
        After access is revoked from Meta, Adlytic can no longer retrieve new data from
        the affected account. Previously synchronized data may remain until you request
        deletion or until it is removed under our retention policy.
      </p>

      <h2>Option 3 — Request deletion of Meta account data</h2>
      <p>
        Email <a href="mailto:privacy@adlytic.app">privacy@adlytic.app</a> with the
        subject line <strong>Meta Data Deletion Request</strong>, from the address
        associated with your Adlytic account. Please include:
      </p>
      <ul>
        <li>Your full name.</li>
        <li>The email address associated with your Adlytic account.</li>
        <li>The workspace or organization name, if applicable.</li>
        <li>The Meta ad account name or ad account ID, if known.</li>
        <li>A statement that you want Adlytic to delete the Meta account data associated with your account or workspace.</li>
      </ul>
      <p>We may ask for additional information to verify your identity and confirm you are authorized to request deletion for the relevant workspace or connection.</p>

      <h2>What happens after a deletion request</h2>
      <ol>
        <li>We confirm receipt of the request.</li>
        <li>We verify the requester's authority over the relevant account, workspace, or connection.</li>
        <li>We revoke or disable the relevant Meta connection in Adlytic.</li>
        <li>We delete or de-identify Meta access tokens and connection records.</li>
        <li>We delete or de-identify stored Meta advertising performance data, unless retention is required by law, security, fraud prevention, dispute resolution, or legitimate business recordkeeping.</li>
        <li>We confirm completion when the deletion process is finished.</li>
      </ol>
      <p>
        Verified requests are processed within a reasonable period and in accordance
        with applicable law. Data in backups may remain for a limited period until
        backup copies are overwritten or deleted per our backup retention schedule; it
        is not used for active product features during that time.
      </p>

      <h2>Automated deletion callback</h2>
      <p>
        For Meta platform integration, Adlytic exposes a data deletion callback at
        <code>/api/meta/data-deletion</code>. When Meta sends a signed deletion
        request there, we process the corresponding data and return a confirmation
        code and a status URL where the request can be tracked.
      </p>

      <div class="legal-footer">
        Adlytic — Ads Intelligence Platform &nbsp;·&nbsp; <a href="/privacy">Privacy Policy</a> &nbsp;·&nbsp; <a href="/login">Sign in</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}
