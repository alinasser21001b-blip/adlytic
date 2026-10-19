#!/usr/bin/env node
// Strict JSON readers for the deploy workflow. Every failure exits non-zero —
// a parse error must never read as "absent" (that is how an existing secret
// gets silently regenerated). Secret values are only ever written to stdout
// for a pipe into `wrangler secret put`, never to stderr or logs.
//
//   has-secret <NAME>        stdin: `wrangler secret list --format json` → exit 0 present, 10 absent
//   widget-by-name <NAME>    stdin: `wrangler turnstile widget list --json` → prints "sitekey\tdomain,domain" or nothing
//   field <key>              stdin: one JSON object → prints that string field (must be non-blank)

const [cmd, arg] = process.argv.slice(2);

function readJson(text) {
  const start = text.search(/[[{]/);
  if (start < 0) throw new Error("no JSON in input");
  return JSON.parse(text.slice(start));
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  let data;
  try {
    data = readJson(input);
  } catch (e) {
    console.error(`cfjson: cannot parse input for '${cmd}': ${e.message}`);
    process.exit(2);
  }
  switch (cmd) {
    case "has-secret": {
      if (!Array.isArray(data)) {
        console.error("cfjson: secret list is not an array");
        process.exit(2);
      }
      process.exit(data.some((s) => s && s.name === arg) ? 0 : 10);
    }
    case "widget-by-name": {
      const list = Array.isArray(data) ? data : Array.isArray(data?.result) ? data.result : null;
      if (!list) {
        console.error("cfjson: widget list is not an array");
        process.exit(2);
      }
      const matches = list.filter((w) => w && w.name === arg);
      if (matches.length > 1) {
        console.error(`cfjson: ${matches.length} widgets named '${arg}' — resolve by hand`);
        process.exit(3);
      }
      if (matches[0]) process.stdout.write(`${matches[0].sitekey}\t${(matches[0].domains ?? []).join(",")}`);
      process.exit(0);
    }
    case "field": {
      const v = data?.[arg];
      if (typeof v !== "string" || !v.trim()) {
        console.error(`cfjson: field '${arg}' missing or blank`);
        process.exit(4);
      }
      process.stdout.write(v);
      process.exit(0);
    }
    default:
      console.error(`cfjson: unknown command '${cmd}'`);
      process.exit(64);
  }
});
