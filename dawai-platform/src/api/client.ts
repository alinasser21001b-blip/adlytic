export interface ApiFailure {
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }> | unknown;
    requestId: string;
  };
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

let csrfToken = "";

export function setCsrfToken(value: string) {
  csrfToken = value;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (csrfToken && !["GET", "HEAD"].includes(options.method ?? "GET")) {
    headers.set("X-CSRF-Token", csrfToken);
  }
  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiClientError(
      0,
      "NETWORK_ERROR",
      "تعذر الاتصال. تحقق من الإنترنت وأعد المحاولة.",
    );
  }

  if (!response.ok) {
    let failure: ApiFailure | undefined;
    try {
      failure = (await response.json()) as ApiFailure;
    } catch {
      // A proxy may return a non-JSON error. Keep a safe generic message.
    }
    throw new ApiClientError(
      response.status,
      failure?.error.code ?? "REQUEST_FAILED",
      failure?.error.message ?? "تعذر إكمال الطلب.",
      failure?.error.requestId,
      failure?.error.details,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function loadCsrfToken(): Promise<void> {
  const response = await apiFetch<{ data: { csrfToken: string } }>(
    "/api/v1/auth/csrf",
  );
  setCsrfToken(response.data.csrfToken);
}
