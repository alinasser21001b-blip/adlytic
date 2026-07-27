/* Inlines css + js into one self-contained file (for hosts with a strict CSP,
   e.g. published artifacts, where external font/script requests are blocked). */
import { readFileSync, writeFileSync } from 'node:fs';
const html = readFileSync('index.html', 'utf8');
const css  = readFileSync('css/qareeb.css', 'utf8');
const data = readFileSync('js/data.js', 'utf8');
const app  = readFileSync('js/app.js', 'utf8');

let out = html
  .replace(/<link rel="preconnect"[\s\S]*?rel="stylesheet">\n/, '')      // no external fonts under CSP
  .replace('<link rel="stylesheet" href="css/qareeb.css">', `<style>\n${css}\n</style>`)
  .replace('<script src="js/data.js"></script>', `<script>\n${data}\n</script>`)
  .replace('<script src="js/app.js"></script>', `<script>\n${app}\n</script>`);

writeFileSync('dist/qareeb.html', out);
console.log('dist/qareeb.html', (out.length / 1024).toFixed(0) + ' KB');
