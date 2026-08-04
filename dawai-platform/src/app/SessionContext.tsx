import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ApiClientError,
  apiFetch,
  loadCsrfToken,
  setCsrfToken,
} from "../api/client";

export type Role = "PATIENT" | "PHARMACY" | "ADMIN";

export interface SessionUser {
  id: string;
  role: Role;
  name: string;
  email: string;
  phone: string | null;
  status: string;
}

export interface SessionData {
  user: SessionUser;
  pharmacy: {
    id: string;
    name: string;
    verification_status: string;
    verification_reason: string | null;
    branch_id: string;
    district: string;
    accepting_requests: boolean;
    operational_status: string;
  } | null;
}

interface SessionValue {
  session: SessionData | null;
  loading: boolean;
  offline: boolean;
  refresh: () => Promise<SessionData | null>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const online = () => setOffline(false);
    const offlineHandler = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offlineHandler);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offlineHandler);
    };
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const response = await apiFetch<{ data: SessionData | null }>(
        "/api/v1/auth/status",
      );
      if (!response.data) {
        setSession(null);
        setCsrfToken("");
        return null;
      }
      // Keep prior session visible while rotating CSRF to avoid unmounting the shell.
      setSession(response.data);
      try {
        await loadCsrfToken();
      } catch {
        // Status succeeded; CSRF can be retried on the next mutation.
      }
      return response.data;
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 0) setOffline(true);
      setSession(null);
      setCsrfToken("");
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function logout() {
    await apiFetch("/api/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
    setSession(null);
    setCsrfToken("");
  }

  const value = useMemo(
    () => ({ session, loading, offline, refresh, logout }),
    [session, loading, offline],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SESSION_PROVIDER_REQUIRED");
  return value;
}
