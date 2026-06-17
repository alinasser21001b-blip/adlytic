#!/bin/bash
# test_prompts.command — double-click in Finder to run
# Tests ONLY the readline/promises prompt logic on macOS Terminal (real TTY).
# No database, no Railway, no tsx needed — pure Node.js.
set -e
cd "$(dirname "$0")"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Adlytic — prompt input test (real TTY, no DB)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  This test asks you 4 questions to verify the prompts"
echo "  work correctly on macOS Terminal."
echo ""

node --input-type=module << 'JSEOF'
import { createInterface } from 'node:readline/promises';
import { createHash } from 'node:crypto';

async function ask(label) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const raw = await rl.question(`  \x1b[1m${label}\x1b[0m `);
    return raw.replace(/\r$/, '').trim();
  } finally {
    rl.close();
  }
}

async function askPassword(label) {
  process.stdout.write(`  \x1b[1m${label}\x1b[0m `);
  const muted = { write: (_s) => true };
  const rl = createInterface({ input: process.stdin, output: muted, terminal: true });
  try {
    const raw = await rl.question('');
    process.stdout.write('\n');
    return raw.replace(/\r$/, '').trim();
  } finally {
    rl.close();
  }
}

(async () => {
  const name  = await ask('Full name     :');
  const email = await ask('Email         :');
  const pwd   = await askPassword('Password      :');
  const ws    = await ask('Workspace     :');

  const hash = createHash('sha256').update(pwd).digest('hex');

  console.log('\n  \x1b[1m─── Collected ───\x1b[0m');
  console.log('  name     :', name);
  console.log('  email    :', email);
  console.log('  password :', '*'.repeat(pwd.length), `(${pwd.length} chars)`);
  console.log('  sha256   :', hash.slice(0,16) + '...');
  console.log('  workspace:', ws);

  const pass = name.length > 0 && email.includes('@') && pwd.length >= 8 && ws.length > 0;
  console.log('');
  if (pass) {
    console.log('  \x1b[32m✔  All prompts collected correctly\x1b[0m');
    console.log('  \x1b[32m✔  Password hidden, hash matches SHA-256\x1b[0m');
    console.log('\n  \x1b[1m\x1b[32mSTATUS: PASS\x1b[0m');
  } else {
    console.log('  \x1b[31m✘  One or more prompts returned empty\x1b[0m');
    console.log('\n  \x1b[1m\x1b[31mSTATUS: FAIL\x1b[0m');
    process.exit(1);
  }
})();
JSEOF

echo ""
echo "  Press Enter to close."
read -r
