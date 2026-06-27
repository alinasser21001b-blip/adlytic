// src/knowledge/loadKnowledgeBase.ts
//
// Loads metaAdsKnowledgeBase from drop-in JSON or TS export. Graceful empty
// fallback when neither file is present.

import fs from "node:fs";
import path from "node:path";
import type { MetaAdsKnowledgeBase } from "./types";
import { EMPTY_KNOWLEDGE_BASE } from "./types";

const JSON_FILENAME = "metaAdsKnowledgeBase.json";
const TS_MODULE_BASENAME = "metaAdsKnowledgeBase";

let cached: MetaAdsKnowledgeBase | null = null;

function knowledgeDirCandidates(): string[] {
  const dirs = new Set<string>();
  dirs.add(__dirname);
  dirs.add(path.join(process.cwd(), "src/knowledge"));
  dirs.add(path.join(process.cwd(), "dist/src/knowledge"));
  return [...dirs];
}

function normalizeKb(raw: unknown): MetaAdsKnowledgeBase | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const metrics = obj["metrics"];
  if (!Array.isArray(metrics)) return null;
  return {
    version: typeof obj["version"] === "string" ? obj["version"] : "1",
    platform: "meta_ads",
    updatedAt: typeof obj["updatedAt"] === "string" ? obj["updatedAt"] : undefined,
    metrics: metrics as MetaAdsKnowledgeBase["metrics"],
  };
}

function loadFromJson(): MetaAdsKnowledgeBase | null {
  for (const dir of knowledgeDirCandidates()) {
    const filePath = path.join(dir, JSON_FILENAME);
    if (!fs.existsSync(filePath)) continue;
    try {
      const text = fs.readFileSync(filePath, "utf8");
      return normalizeKb(JSON.parse(text));
    } catch {
      return null;
    }
  }
  return null;
}

function loadFromTsModule(): MetaAdsKnowledgeBase | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(`./${TS_MODULE_BASENAME}`) as Record<string, unknown>;
    const candidate =
      mod["metaAdsKnowledgeBase"] ??
      mod["default"] ??
      mod["knowledgeBase"];
    return normalizeKb(candidate);
  } catch {
    return null;
  }
}

/** Load KB once per process. TS module wins over JSON when both exist. */
export function loadKnowledgeBase(forceReload = false): MetaAdsKnowledgeBase {
  if (cached && !forceReload) return cached;

  const fromTs = loadFromTsModule();
  if (fromTs && fromTs.metrics.length > 0) {
    cached = fromTs;
    return cached;
  }

  const fromJson = loadFromJson();
  if (fromJson && fromJson.metrics.length > 0) {
    cached = fromJson;
    return cached;
  }

  cached = fromTs ?? fromJson ?? EMPTY_KNOWLEDGE_BASE;
  return cached;
}

/** Test hook — inject a KB without touching disk. */
export function setKnowledgeBaseForTests(kb: MetaAdsKnowledgeBase | null): void {
  cached = kb;
}

export function resetKnowledgeBaseCache(): void {
  cached = null;
}
