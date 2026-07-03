// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/privacyPage.ts  —  Public Privacy Policy page
//
//  Served at GET /privacy with NO authentication. Meta App Review requires a
//  publicly reachable Privacy Policy URL on the same domain as the app. This
//  page states exactly how Adlytic handles Meta (Facebook/Instagram Ads) data:
//  read-only access, no advertising targeting, no model training, no resale.
// ════════════════════════════════════════════════════════════════════════

import { SHARED_CSS } from '../layout';

export function privacyPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy — Adlytic</title>
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
    .legal-card ul { margin: 0 0 12px 20px; }
    .legal-card li { font-size: 14px; color: var(--text-2); line-height: 1.7; margin-bottom: 6px; }
    .legal-card strong { color: var(--text); font-weight: 600; }
    .legal-card a { color: var(--accent-2); }
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
      <h1>Privacy Policy</h1>
      <div class="legal-updated">Effective date: 1 July 2026</div>

      <p>
        Adlytic is a <strong>read-only</strong> analytics platform for Meta
        advertisers. We help users connect their own Meta advertising accounts, view
        campaign performance, and receive analytics-based recommendations. This
        Privacy Policy explains what data we collect, how we use it, how long we
        retain it, and how users can request deletion of their Meta account data from
        Adlytic.
      </p>

      <h2>Scope of this Privacy Policy</h2>
      <p>
        This Privacy Policy applies to users who access Adlytic, connect a Meta
        advertising account, or use Adlytic dashboards, analytics, reporting, or
        recommendation features. It covers data processed through Adlytic's
        application, including data accessed through Meta's Marketing API after a user
        authorizes Adlytic. It does not apply to Meta's own collection or processing
        of data, which is governed by Meta's own terms and policies.
      </p>

      <h2>1. Data we collect</h2>
      <p>Adlytic collects only the data needed to provide read-only advertising analytics and recommendations.</p>
      <p><strong>Account and workspace data:</strong></p>
      <ul>
        <li>Name, email address, and login information.</li>
        <li>Workspace, organization, or team membership information.</li>
        <li>Account preferences and basic product settings.</li>
        <li>Subscription, billing, or plan-related information, if applicable.</li>
      </ul>
      <p><strong>Meta connection data</strong> (when you connect a Meta advertising account):</p>
      <ul>
        <li>Meta account identifiers needed to identify connected ad accounts.</li>
        <li>Ad account name, currency, timezone, country code, and related metadata.</li>
        <li>OAuth authorization information and access tokens needed to retrieve your data.</li>
      </ul>
      <p>
        Access tokens are used only to retrieve authorized data from Meta's Marketing
        API. We do <strong>not</strong> ask for or store your Meta password.
      </p>
      <p><strong>Meta Marketing API performance metrics</strong> (read-only):</p>
      <ul>
        <li>Campaign, ad set, ad, and creative metadata.</li>
        <li>Spend, impressions, reach, clicks, unique clicks, conversions, leads, purchases, revenue, CTR, CPC, CPM, frequency, cost per result, and ROAS.</li>
        <li>Performance breakdowns such as age range, gender, publisher platform, and placement, where available through Meta's API.</li>
        <li>Historical daily performance data used to populate dashboards, trend charts, and reporting views.</li>
      </ul>
      <p>
        Adlytic does <strong>not</strong> create, edit, pause, publish, or manage Meta
        campaigns, ad sets, ads, budgets, bids, audiences, or targeting settings. We
        request only the <strong>ads_read</strong> permission.
      </p>
      <p><strong>Technical and usage data:</strong></p>
      <ul>
        <li>Device, browser, IP address, log data, and session activity.</li>
        <li>API request status, synchronization timestamps, and error logs.</li>
        <li>Product usage events, such as connecting or disconnecting a Meta account.</li>
        <li>Security and audit logs used to protect accounts and investigate abuse.</li>
      </ul>

      <h2>2. How we use data</h2>
      <p>Adlytic uses collected data only to:</p>
      <ul>
        <li>Authenticate users and operate Adlytic accounts and workspaces.</li>
        <li>Connect a user-authorized Meta advertising account.</li>
        <li>Retrieve read-only advertising performance metrics from Meta's Marketing API.</li>
        <li>Display dashboards, reports, insights, and trend analysis to the same user or workspace that connected the account.</li>
        <li>Generate analytics-based recommendations about advertising performance.</li>
        <li>Troubleshoot synchronization, API, or account-connection errors and product reliability issues.</li>
        <li>Protect the security, integrity, and availability of the platform.</li>
        <li>Comply with legal, regulatory, tax, accounting, or contractual obligations where applicable.</li>
      </ul>
      <p>
        Recommendations are provided to help the account owner understand performance
        and improve decision-making. They are <strong>not</strong> used to
        automatically modify Meta campaigns.
      </p>

      <h2>3. No AI model training, no sale, no third-party sharing</h2>
      <p>Adlytic does <strong>not</strong> use Meta advertising data to train, fine-tune, or improve general-purpose artificial intelligence models.</p>
      <p>Adlytic does <strong>not</strong> sell Meta advertising data.</p>
      <p>Adlytic does <strong>not</strong> share Meta advertising data with third parties for advertising, targeting, profiling, data brokerage, or resale.</p>
      <p>
        Adlytic may use trusted service providers only as necessary to host, secure,
        monitor, or operate the platform. These providers may process data only on our
        behalf and only for the limited purpose of providing infrastructure, storage,
        analytics, security, logging, or support services. They are not permitted to
        use Meta advertising data for their own purposes.
      </p>

      <h2>4. Legal basis for processing</h2>
      <p>Where applicable privacy laws require a legal basis, Adlytic processes personal data based on one or more of the following:</p>
      <ul>
        <li><strong>User authorization and consent</strong> — when you choose to connect your Meta advertising account.</li>
        <li><strong>Performance of a contract</strong> — to provide Adlytic dashboards, analytics, and recommendations.</li>
        <li><strong>Legitimate interests</strong> — to secure, maintain, improve, and troubleshoot the platform.</li>
        <li><strong>Legal obligations</strong> — where we must retain or disclose limited information to comply with applicable law.</li>
      </ul>

      <h2>5. How we store and protect your data</h2>
      <p>
        Your data is stored in an access-controlled PostgreSQL database and is
        strictly isolated per workspace — one customer can never read another
        customer's data. Meta access tokens are encrypted at rest using AES-256-GCM,
        and are never logged or exposed. Access to production systems is limited to
        authorized personnel. No system is perfectly secure; please protect your own
        credentials and notify us immediately of any suspected unauthorized access.
      </p>

      <h2>6. Data retention</h2>
      <p>Adlytic retains data only as long as reasonably necessary for the purposes described here. Unless a shorter period is required by law, contract, or user request:</p>
      <ul>
        <li>Meta access tokens are retained while the Meta account remains connected.</li>
        <li>Meta advertising performance metrics are retained while needed to provide dashboards, historical reporting, analytics, and recommendations.</li>
        <li>Raw synchronization or API diagnostic records may be retained for up to 90 days for troubleshooting and security.</li>
        <li>Account, billing, audit, and legal records may be retained longer where necessary to comply with legal, tax, accounting, security, or dispute-resolution obligations.</li>
      </ul>
      <p>
        When you disconnect a Meta account or request deletion, Adlytic deletes or
        de-identifies the relevant Meta account data from active systems within a
        reasonable period, unless retention is required by law, security, fraud
        prevention, dispute resolution, or legitimate business recordkeeping. Backup
        copies may persist for a limited period per our backup schedule before being
        overwritten or deleted.
      </p>

      <h2>7. Your rights &amp; data deletion</h2>
      <p>You are in control of your data at all times. You can:</p>
      <ul>
        <li><strong>Disconnect</strong> a Meta ad account from your Workspace settings at any time, which stops all further data access.</li>
        <li><strong>Delete</strong> an ad account and all of its stored analytics from your workspace.</li>
        <li><strong>Delete your entire Adlytic account</strong>, which removes all of your data.</li>
        <li>Request access, correction, export, or deletion of personal data, subject to applicable law.</li>
        <li>Request deletion of any Meta-derived data via our <a href="/data-deletion">Data Deletion page</a>.</li>
      </ul>
      <p>
        You may also revoke Adlytic's access at any time from your Facebook settings
        under <strong>Settings &amp; Privacy → Settings → Business Integrations</strong>.
      </p>

      <h2>8. Cookies</h2>
      <p>
        Adlytic uses only essential cookies required to keep you signed in and to
        remember your interface preferences (such as dashboard mode). We do not use
        advertising or cross-site tracking cookies.
      </p>

      <h2>9. International data transfers</h2>
      <p>
        Adlytic may process and store data in countries other than the country where
        the user is located. Where required, we use appropriate safeguards for
        international data transfers, such as contractual commitments or other lawful
        transfer mechanisms.
      </p>

      <h2>10. Children</h2>
      <p>
        Adlytic is intended for business users and is not directed to children. We do
        not knowingly collect personal data from children.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this policy as the product evolves. Material changes will be
        reflected by the "Effective date" above and, where appropriate, by additional
        notice through the product.
      </p>

      <h2>12. Contact</h2>
      <p>
        For any privacy question or data request, contact us at
        <a href="mailto:privacy@adlytic.app">privacy@adlytic.app</a>.
      </p>

      <div class="legal-footer">
        Adlytic — Ads Intelligence Platform &nbsp;·&nbsp; <a href="/data-deletion">Data Deletion</a> &nbsp;·&nbsp; <a href="/login">Sign in</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}
