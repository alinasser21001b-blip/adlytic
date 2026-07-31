/**
 * Object storage adapter.
 * Local filesystem is the default production-safe path when the volume is private.
 * S3-compatible backend uses AWS Signature Version 4 (not Basic auth).
 * Prescriptions are NEVER public — signed/private access only.
 */
import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config";

export interface ObjectStore {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  backend: "local" | "s3";
}

class LocalObjectStore implements ObjectStore {
  backend = "local" as const;

  async put(key: string, data: Buffer): Promise<void> {
    await mkdir(config.storagePath, { recursive: true, mode: 0o700 });
    await writeFile(join(config.storagePath, key), data, { mode: 0o600 });
  }

  async get(key: string): Promise<Buffer> {
    return readFile(join(config.storagePath, key));
  }

  async delete(key: string): Promise<void> {
    await unlink(join(config.storagePath, key)).catch(() => undefined);
  }
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

/**
 * Minimal AWS SigV4 signer for S3-compatible PUT/GET/DELETE.
 * Requires S3_REGION (defaults to us-east-1) via endpoint host / env.
 */
class S3ObjectStore implements ObjectStore {
  backend = "s3" as const;

  private region(): string {
    return process.env.S3_REGION?.trim() || "us-east-1";
  }

  private objectUrl(key: string): URL {
    const endpoint = config.s3.endpoint!.replace(/\/$/, "");
    const bucket = config.s3.bucket!;
    if (config.s3.forcePathStyle) {
      return new URL(`${endpoint}/${bucket}/${key}`);
    }
    const host = new URL(endpoint);
    return new URL(`${host.protocol}//${bucket}.${host.host}/${key}`);
  }

  private async signedFetch(
    method: string,
    key: string,
    body?: Buffer,
  ): Promise<Response> {
    const url = this.objectUrl(key);
    const now = new Date();
    const amzDate =
      now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256Hex(body ?? "");
    const canonicalHeaders =
      `host:${url.host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      method,
      url.pathname,
      url.search.replace(/^\?/, ""),
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const credentialScope = `${dateStamp}/${this.region()}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");
    const kDate = hmac(`AWS4${config.s3.secretAccessKey!}`, dateStamp);
    const kRegion = hmac(kDate, this.region());
    const kService = hmac(kRegion, "s3");
    const kSigning = hmac(kService, "aws4_request");
    const signature = createHmac("sha256", kSigning)
      .update(stringToSign, "utf8")
      .digest("hex");
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${config.s3.accessKeyId!}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetch(url, {
      method,
      headers: {
        Authorization: authorization,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        ...(body
          ? {
              "Content-Type": "application/octet-stream",
              "Cache-Control": "private, no-store",
            }
          : {}),
      },
      body: body ? new Uint8Array(body) : undefined,
    });
  }

  async put(key: string, data: Buffer): Promise<void> {
    const response = await this.signedFetch("PUT", key, data);
    if (!response.ok) {
      throw new Error(`S3_PUT_FAILED_${response.status}`);
    }
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.signedFetch("GET", key);
    if (!response.ok) {
      throw new Error(`S3_GET_FAILED_${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const response = await this.signedFetch("DELETE", key);
    if (!response.ok && response.status !== 404) {
      throw new Error(`S3_DELETE_FAILED_${response.status}`);
    }
  }
}

let store: ObjectStore | null = null;

export function getObjectStore(): ObjectStore {
  if (!store) {
    store = config.storageBackend === "s3"
      ? new S3ObjectStore()
      : new LocalObjectStore();
  }
  return store;
}

/** Optional malware scan integration point — no-ops when MALWARE_SCAN_URL unset. */
export async function scanBytesForMalware(
  bytes: Buffer,
  filename: string,
): Promise<"clean" | "skipped"> {
  if (!config.malwareScanUrl) return "skipped";
  const response = await fetch(config.malwareScanUrl, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "X-Filename": filename },
    body: new Uint8Array(bytes),
  });
  if (!response.ok) {
    throw new Error("MALWARE_SCAN_FAILED");
  }
  const result = (await response.json()) as { status?: string };
  if (result.status === "infected" || result.status === "malicious") {
    throw new Error("MALWARE_DETECTED");
  }
  return "clean";
}
