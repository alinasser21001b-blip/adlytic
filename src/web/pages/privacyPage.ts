// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/privacyPage.ts — public privacy policy (/privacy).
//
//  Referenced from the Meta App Dashboard "Privacy Policy URL" field.
//  Deliberately plain, self-contained HTML: reviewers open this page cold,
//  so it must load with zero app JS and state the Meta-data story plainly.
// ════════════════════════════════════════════════════════════════════════

export function privacyPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy — Adlytic</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
         max-width: 760px; margin: 0 auto; padding: 2rem 1.25rem; line-height: 1.65; color: #1a1a1a; }
  h1 { font-size: 1.6rem; } h2 { font-size: 1.15rem; margin-top: 2rem; }
  code { background: #f2f2f2; padding: .1em .35em; border-radius: 4px; }
  footer { margin-top: 3rem; font-size: .85rem; color: #666; }
</style>
</head>
<body>
<h1>Adlytic — Privacy Policy</h1>
<p>Adlytic ("we") is an ads-intelligence platform that analyzes the advertising
performance of business ad accounts that their owners explicitly connect to us.
This page explains what data we access, why, where it goes, and how it is
deleted.</p>

<h2>What we collect from Meta</h2>
<p>When you connect a Meta ad account, we access — with the
<code>ads_read</code> permission you grant — advertising <em>performance</em>
data only: spend, impressions, reach, clicks, frequency, conversion action
counts, ad/campaign names, statuses, budgets, audience breakdown aggregates
(age ranges, gender, platform), and ad creative metadata (thumbnails, text,
call-to-action). We do <strong>not</strong> access your personal profile,
friends, posts, messages, or any end-consumer personal data.</p>

<h2>Why we collect it</h2>
<p>Solely to provide the product's features to you: performance dashboards,
trend analysis, issue detection, health scoring, and recommendations for the
ad accounts you connected. We do not sell data, share it with data brokers, or
use it for advertising of our own.</p>

<h2>Who processes it (service providers)</h2>
<ul>
  <li><strong>Railway</strong> — cloud hosting of our application and PostgreSQL database.</li>
  <li><strong>Redis</strong> — short-lived operational caching (job queues, counters).</li>
  <li><strong>Anthropic (Claude API)</strong> — generates the natural-language analysis
      shown in your dashboard from aggregated performance metrics of your connected
      accounts. Used strictly as a processor for this feature.</li>
  <li><strong>Stripe</strong> — subscription billing (never receives ad data).</li>
</ul>

<h2>Storage &amp; security</h2>
<p>Access tokens are encrypted at rest. Data lives in our managed PostgreSQL
database and is accessible only to the workspace that connected the account.</p>

<h2>Retention &amp; deletion</h2>
<p>We retain ad-performance data only while the ad account remains connected.
Deletion happens automatically and immediately in all of these cases:</p>
<ul>
  <li>You disconnect an ad account from your Adlytic workspace.</li>
  <li>You delete your Adlytic user account.</li>
  <li>You remove the Adlytic app from your Meta Business/Facebook settings —
      Meta notifies our <a href="/data-deletion">data-deletion endpoint</a> and the
      linked data is erased.</li>
</ul>
<p>See <a href="/data-deletion">Data Deletion Instructions</a> for details and
manual requests.</p>

<h2>Contact</h2>
<p>Questions or requests: <a href="mailto:support@adlytic.net">support@adlytic.net</a></p>

<footer>Adlytic Ads Intelligence Platform — last updated 2026-07-23.</footer>
</body>
</html>`;
}
