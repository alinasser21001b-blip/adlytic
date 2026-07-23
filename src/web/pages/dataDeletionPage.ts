// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/dataDeletionPage.ts — public data-deletion page
//  (/data-deletion), referenced from the Meta App Dashboard "Data Deletion
//  Instructions URL" field and returned as the status `url` by the
//  data-deletion callback. Accepts an optional confirmation code to show
//  "request received" state.
// ════════════════════════════════════════════════════════════════════════

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function dataDeletionPage(confirmationCode?: string): string {
  const codeBlock = confirmationCode
    ? `<div class="ok"><strong>Request received.</strong> Your deletion reference code is
       <code>${escapeHtml(confirmationCode)}</code>. All Meta advertising data linked to your
       removal request has been erased from Adlytic. Keep this code if you need to follow up.</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Data Deletion — Adlytic</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
         max-width: 760px; margin: 0 auto; padding: 2rem 1.25rem; line-height: 1.65; color: #1a1a1a; }
  h1 { font-size: 1.6rem; } h2 { font-size: 1.15rem; margin-top: 2rem; }
  code { background: #f2f2f2; padding: .1em .35em; border-radius: 4px; }
  .ok { background: #e8f5e9; border: 1px solid #a5d6a7; border-radius: 8px;
        padding: 1rem 1.25rem; margin: 1.25rem 0; }
</style>
</head>
<body>
<h1>Adlytic — Data Deletion</h1>
${codeBlock}
<p>Adlytic stores only the advertising <em>performance</em> data of Meta ad
accounts their owners explicitly connected (see our
<a href="/privacy">Privacy Policy</a>). You can have all of it deleted in any
of the following ways — each takes effect immediately:</p>

<h2>1. Disconnect the ad account in Adlytic</h2>
<p>Sign in → Settings → Connected accounts → Disconnect. All synced
performance data, analytics, and stored tokens for that account are erased.</p>

<h2>2. Remove the app from your Meta settings</h2>
<p>In Facebook/Meta Business settings, remove <strong>Adlytic</strong> under
Business Integrations (or Apps and Websites). Meta then notifies our deletion
endpoint automatically and the linked data is erased; you will receive a
confirmation code on this page.</p>

<h2>3. Ask us directly</h2>
<p>Email <a href="mailto:support@adlytic.net">support@adlytic.net</a> from the
address on your Adlytic workspace, naming the ad account. We erase the data
and confirm within 7 days.</p>
</body>
</html>`;
}
