import type { Database } from "./db/client";

export type UserRole = "PATIENT" | "PHARMACY" | "ADMIN";

export interface AuthUser {
  id: string;
  role: UserRole;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  name: string;
  email: string;
  phone: string | null;
}

export interface SessionContext {
  id: string;
  csrfTokenHash: string;
  usedCookie: boolean;
}

export interface AppVariables {
  db: Database;
  requestId: string;
  user: AuthUser;
  session: SessionContext;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
    timestamp: string;
  };
}
