export class ApiError extends Error {
  constructor(
    public readonly status:
      | 400
      | 401
      | 403
      | 404
      | 409
      | 413
      | 415
      | 422
      | 429
      | 503,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function assertFound<T>(
  value: T | null | undefined,
  code = "NOT_FOUND",
): asserts value is T {
  if (value === null || value === undefined) {
    throw new ApiError(404, code, "المورد المطلوب غير موجود.");
  }
}
