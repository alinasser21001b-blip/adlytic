/* Inlines css + js into one self-contained file.
 *
 *   node build-single.mjs              -> dist/qareeb.html      (no external refs at all;
 *                                         for strict-CSP hosts such as published artifacts)
 *   node build-single.mjs --with-fonts -> dist/qareeb.web.html  (keeps the webfont <link>;
 *                                         for normal hosting, where the real Arabic face loads)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const withFonts = process.argv.includes('--with-fonts');
const html = readFileSync('index.html', 'utf8');
const css  = readFileSync('css/qareeb.css', 'utf8');
const css2 = readFileSync('src/styles/qareeb.css', 'utf8');
const data = readFileSync('js/data.js', 'utf8');
const app  = readFileSync('js/app.js', 'utf8');
const icon = readFileSync('favicon.svg', 'utf8');

let out = html
  .replace('<link rel="icon" href="favicon.svg" type="image/svg+xml">',
           `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}">`)
  .replace('<link rel="apple-touch-icon" href="favicon.svg">', '')
  .replace('<link rel="stylesheet" href="css/qareeb.css">\n<link rel="stylesheet" href="src/styles/qareeb.css">', `<style>\n${css}\n${css2}\n</style>`)
  .replace('<script src="js/data.js"></script>', `<script>\n${data}\n</script>`)
  .replace('<script src="js/app.js"></script>', `<script>\n${app}\n</script>`);

if (!withFonts) out = out.replace(/<link rel="preconnect"[\s\S]*?rel="stylesheet">\n/, '');

mkdirSync('dist', { recursive: true });
const target = withFonts ? 'dist/qareeb.web.html' : 'dist/qareeb.html';
writeFileSync(target, out);
console.log(target, (out.length / 1024).toFixed(0) + ' KB', withFonts ? '(webfont linked)' : '(fully self-contained)');
