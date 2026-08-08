// Render every user-facing page to HTML for the mobile audit.
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('../.mobile-pages/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const PAGES: Array<[string, string, string]> = [
  ['dashboard', 'dashboardPage', 'dashboardPage'],
  ['campaigns', 'campaignsPage', 'campaignsPage'],
  ['ai', 'aiPage', 'aiPage'],
  ['recommendations', 'recommendationsPage', 'recommendationsPage'],
  ['settings', 'settingsPage', 'settingsPage'],
  ['workspace', 'workspacePage', 'workspacePage'],
  ['login', 'loginPage', 'loginPage'],
  ['register', 'registerPage', 'registerPage'],
  ['welcome', 'welcomePage', 'welcomePage'],
  ['add-client', 'addClientPage', 'addClientPage'],
  ['ad-analysis', 'adAnalysisPage', 'adAnalysisPage'],
  ['support', 'supportPage', 'supportPage'],
];

for (const [slug, file, fn] of PAGES) {
  try {
    const mod = await import(`/home/user/adlytic/src/web/pages/${file}`);
    const render = mod[fn];
    if (typeof render !== 'function') { console.log(`skip ${slug}: no ${fn}`); continue; }
    const html = render();
    if (typeof html !== 'string') { console.log(`skip ${slug}: needs args`); continue; }
    writeFileSync(`${OUT}/${slug}.html`, html, 'utf8');
    console.log(`rendered ${slug} (${(html.length / 1024).toFixed(0)} KB)`);
  } catch (e: any) {
    console.log(`FAIL ${slug}: ${e.message.slice(0, 80)}`);
  }
}
