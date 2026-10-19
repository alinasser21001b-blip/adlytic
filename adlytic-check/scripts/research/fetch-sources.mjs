#!/usr/bin/env node
// Fetches the primary sources listed in research/fetch-list.json and prints a
// bounded plain-text excerpt of each to the job log, with provenance (final
// URL, status, Last-Modified, sha256 of the body). Runs only in GitHub Actions,
// whose network can reach the publishers; the sandbox that writes the research
// cannot. Nothing is written to the repository — excerpts stay in the log.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const list = JSON.parse(readFileSync(process.argv[2], "utf8"));
const MAX = Number(process.env.EXCERPT_CHARS ?? 14000);
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 adlytic-check-research";

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(h[1-6])[^>]*>/gi, "\n\n## ")
    .replace(/<(li)[^>]*>/gi, "\n- ")
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li|\/table)[^>]*>/gi, "\n")
    .replace(/<(td|th)[^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
}

function links(html, base) {
  const out = new Set();
  for (const m of html.matchAll(/href="([^"#]+)"/g)) {
    try { out.add(new URL(m[1], base).href); } catch {}
  }
  return [...out].filter((u) => u.startsWith(new URL(base).origin)).slice(0, 80);
}

function wrap(s, w = 220) {
  return s.split("\n").flatMap((line) => {
    const out = [];
    for (let i = 0; i < line.length; i += w) out.push(line.slice(i, i + w));
    return out.length ? out : [""];
  }).join("\n");
}

for (const src of list) {
  console.log(`\n=== SOURCE ${src.id} ===`);
  try {
    const res = await fetch(src.url, { headers: { "user-agent": UA, accept: "text/markdown, text/html;q=0.9, application/pdf;q=0.8, */*;q=0.5" }, redirect: "follow", signal: AbortSignal.timeout(30000) });
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") ?? "";
    console.log(`url: ${src.url}\nfinal: ${res.url}\nstatus: ${res.status}\ncontent-type: ${ct}\nlast-modified: ${res.headers.get("last-modified") ?? "-"}\nbytes: ${buf.length}\nsha256: ${createHash("sha256").update(buf).digest("hex")}\nfetched-at: ${new Date().toISOString()}`);
    let text;
    if (ct.includes("pdf") || src.url.endsWith(".pdf")) {
      const dir = mkdtempSync(join(tmpdir(), "src-"));
      writeFileSync(join(dir, "a.pdf"), buf);
      text = execFileSync("pdftotext", ["-layout", "-l", String(src.pages ?? 6), join(dir, "a.pdf"), "-"]).toString();
    } else if (ct.includes("html")) {
      const html = buf.toString("utf8");
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
      const pub = html.match(/(?:article:published_time|datePublished)"?\s*(?:content=|:)\s*"([^"]+)"/i)?.[1];
      const mod = html.match(/(?:article:modified_time|dateModified)"?\s*(?:content=|:)\s*"([^"]+)"/i)?.[1];
      console.log(`title: ${title ?? "-"}\npublished: ${pub ?? "-"}\nmodified: ${mod ?? "-"}`);
      if (src.links) console.log(`links:\n${links(html, res.url).join("\n")}`);
      text = htmlToText(html);
    } else {
      text = buf.toString("utf8");
    }
    if (src.find) {
      // Keep only paragraphs around the requested terms, so long pages stay readable.
      const paras = text.split(/\n\s*\n/);
      const re = new RegExp(src.find, "i");
      const keep = paras.filter((p, i) => re.test(p) || re.test(paras[i - 1] ?? ""));
      text = keep.join("\n\n");
    }
    console.log(`--- text (${text.length} chars, showing ≤${src.max ?? MAX}) ---`);
    console.log(wrap(text.slice(0, src.max ?? MAX)));
  } catch (e) {
    console.log(`error: ${e instanceof Error ? e.message : e}`);
  }
  console.log(`=== END ${src.id} ===`);
}
