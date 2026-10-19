import type { AnyAnalysisReport, ApiError, ClientEventName, SessionInfo, ShareInfo } from "../../../shared/schemas";

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable: boolean,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

async function parseError(res: Response): Promise<ApiFailure> {
  try {
    const body = (await res.json()) as ApiError;
    return new ApiFailure(res.status, body.error.code, body.error.message, body.error.retryable ?? false, body.error.retryAfter);
  } catch {
    return new ApiFailure(res.status, "INTERNAL", "حدث خطأ غير متوقع. حاول مرة أخرى.", true);
  }
}

async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", ...init });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export const api = {
  session: () => json<SessionInfo>("/api/session", { method: "POST" }),
  report: (id: string) => json<{ report: AnyAnalysisReport; share: { active: boolean; createdAt?: string } }>(`/api/reports/${encodeURIComponent(id)}`),
  reports: () => json<{ reports: Array<{ id: string; mode: string; createdAt: string; title: string }> }>("/api/reports"),
  createShare: (id: string) => json<ShareInfo>(`/api/reports/${encodeURIComponent(id)}/share`, { method: "POST" }),
  async revokeShare(id: string) {
    const res = await fetch(`/api/reports/${encodeURIComponent(id)}/share`, { method: "DELETE", credentials: "same-origin" });
    if (!res.ok) throw await parseError(res);
  },
  async deleteReport(id: string) {
    const res = await fetch(`/api/reports/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
    if (!res.ok) throw await parseError(res);
  },
  event(name: ClientEventName, analysisId?: string) {
    void fetch("/api/events", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(analysisId ? { name, analysisId } : { name }),
      keepalive: true,
    }).catch(() => {});
  },
};

export type CheckPhase = "uploading" | "analysing";

/**
 * POST /api/check via XHR so upload completion is observable: the UI switches
 * from "uploading" to "analysing" only when the browser reports the body sent.
 */
export function submitCheck(form: FormData, onPhase: (p: CheckPhase) => void, timeoutMs = 90_000, onUpload?: (fraction: number) => void): Promise<AnyAnalysisReport> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/check");
    xhr.withCredentials = true;
    xhr.timeout = timeoutMs;
    xhr.responseType = "text";
    onPhase("uploading");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onUpload) onUpload(e.loaded / e.total);
    };
    xhr.upload.onload = () => onPhase("analysing");
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status === 200 && body) return resolve(body as AnyAnalysisReport);
      const err = (body as ApiError | null)?.error;
      reject(
        err
          ? new ApiFailure(xhr.status, err.code, err.message, err.retryable ?? false, err.retryAfter)
          : new ApiFailure(xhr.status || 0, "INTERNAL", "حدث خطأ غير متوقع. حاول مرة أخرى.", true),
      );
    };
    xhr.onerror = () => reject(new ApiFailure(0, "NETWORK", "", true));
    xhr.ontimeout = () => reject(new ApiFailure(0, "TIMEOUT", "", true));
    xhr.send(form);
  });
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
