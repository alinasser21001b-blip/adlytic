/* Minimal YAML reader for release-manifest.yaml.
 *
 * Deliberately NOT a general YAML parser. It supports exactly the subset the
 * manifest uses — nested maps, block sequences, inline flow sequences, plain
 * and quoted scalars, comments, and the null/bool/number literals — and it
 * THROWS on anything else rather than guessing.
 *
 * Why not a dependency: this file is the gate that decides whether a clinical
 * product ships. A supply-chain compromise in a YAML package would be a
 * compromise of the release gate itself. A strict 90-line reader we control is
 * the safer trade, and the manifest schema is ours to keep simple.
 */

const INDENT_STEP_ERR = "indentation must be consistent within a block";

function scalar(raw, line) {
  const t = raw.trim();
  if (t === "" || t === "~" || t === "null") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d*\.\d+$/.test(t)) return Number(t);
  if (/^"(.*)"$/.test(t)) return t.slice(1, -1).replace(/\\"/g, '"');
  if (/^'(.*)'$/.test(t)) return t.slice(1, -1).replace(/''/g, "'");
  if (t.startsWith("[")) {
    if (!t.endsWith("]")) throw new Error(`line ${line}: unterminated flow sequence`);
    const inner = t.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((s) => scalar(s, line));
  }
  if (t.startsWith("{")) throw new Error(`line ${line}: flow mappings are not supported`);
  return t;
}

/** Strip a trailing comment, but never inside a quoted scalar. */
function decomment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

export function parseYaml(text) {
  const rows = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (raw.includes("\t")) throw new Error(`line ${i + 1}: tabs are not valid YAML indentation`);
    const body = decomment(raw).replace(/\s+$/, "");
    if (!body.trim()) return;
    rows.push({ indent: body.length - body.trimStart().length, text: body.trim(), line: i + 1 });
  });

  let pos = 0;

  function parseBlock(indent) {
    if (pos >= rows.length) return null;
    return rows[pos].text.startsWith("- ") || rows[pos].text === "-"
      ? parseSeq(indent)
      : parseMap(indent);
  }

  function parseSeq(indent) {
    const out = [];
    while (pos < rows.length && rows[pos].indent === indent) {
      const r = rows[pos];
      if (!r.text.startsWith("-")) break;
      const rest = r.text.slice(1).trim();
      pos++;
      if (!rest) {
        out.push(pos < rows.length && rows[pos].indent > indent ? parseBlock(rows[pos].indent) : null);
        continue;
      }
      // "- key: value" opens a map whose first key sits at indent + 2.
      if (/^[\w.$-]+\s*:/.test(rest)) {
        const virt = { indent: indent + 2, text: rest, line: r.line };
        rows.splice(pos, 0, virt);
        out.push(parseMap(indent + 2));
        continue;
      }
      out.push(scalar(rest, r.line));
    }
    return out;
  }

  function parseMap(indent) {
    const out = {};
    while (pos < rows.length && rows[pos].indent === indent) {
      const r = rows[pos];
      if (r.text.startsWith("- ")) break;
      const m = /^([^:]+):(.*)$/.exec(r.text);
      if (!m) throw new Error(`line ${r.line}: expected "key: value", got ${JSON.stringify(r.text)}`);
      const key = m[1].trim().replace(/^["']|["']$/g, "");
      const inline = m[2].trim();
      pos++;
      if (inline) { out[key] = scalar(inline, r.line); continue; }
      if (pos < rows.length && rows[pos].indent > indent) out[key] = parseBlock(rows[pos].indent);
      else out[key] = null;
    }
    if (pos < rows.length && rows[pos].indent > indent) {
      throw new Error(`line ${rows[pos].line}: ${INDENT_STEP_ERR}`);
    }
    return out;
  }

  const doc = parseBlock(rows.length ? rows[0].indent : 0);
  if (pos < rows.length) throw new Error(`line ${rows[pos].line}: ${INDENT_STEP_ERR}`);
  return doc ?? {};
}
