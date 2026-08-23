// ════════════════════════════════════════════════════════════════════════
//  src/auth/WorkspaceContext.tsx — which workspace is "the account" right now.
//
//  Registration creates exactly one workspace per new user (see
//  POST /api/auth/register), so the overwhelming case is one membership and
//  nothing to choose. A user added to a second workspace gets a switcher on
//  the Account screen; nothing else in the app needs to know more than one
//  can exist.
// ════════════════════════════════════════════════════════════════════════
import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

interface WorkspaceState {
  workspaceId: string | null;
  workspaceName: string | null;
  options: Array<{ id: string; name: string }>;
  select: (id: string) => void;
}

const Ctx = createContext<WorkspaceState | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { workspaces } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    // Default to the first membership (server orders by createdAt asc — the
    // workspace registration created). Reset the choice if it no longer
    // exists in the list (e.g. after logout/login as a different user).
    if (workspaces.length === 0) { setSelected(null); return; }
    if (!selected || !workspaces.some((m) => m.workspace.id === selected)) {
      setSelected(workspaces[0].workspace.id);
    }
  }, [workspaces, selected]);

  const value = useMemo<WorkspaceState>(() => ({
    workspaceId: selected,
    workspaceName: workspaces.find((m) => m.workspace.id === selected)?.workspace.name ?? null,
    options: workspaces.map((m) => ({ id: m.workspace.id, name: m.workspace.name })),
    select: setSelected,
  }), [selected, workspaces]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWorkspace() outside <WorkspaceProvider>');
  return ctx;
}
