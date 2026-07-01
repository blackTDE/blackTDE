import { create } from 'zustand';

export interface Session {
  id: string;
  agentType: string;
  cwd: string;
  status: 'active' | 'suspended' | 'terminated';
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
}

interface WorkspaceState {
  activeWorkspace: Workspace | null;
  sessions: Record<string, Session>;
  activeSessionId: string | null;
  setWorkspace: (ws: Workspace) => void;
  addSession: (session: Session) => void;
  setActiveSession: (id: string | null) => void;
  removeSession: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeWorkspace: null,
  sessions: {},
  activeSessionId: null,
  setWorkspace: (ws) => set({ activeWorkspace: ws }),
  addSession: (session) =>
    set((state) => ({
      sessions: { ...state.sessions, [session.id]: session },
    })),
  setActiveSession: (id) => set({ activeSessionId: id }),
  removeSession: (id) =>
    set((state) => {
      const newSessions = { ...state.sessions };
      delete newSessions[id];
      return {
        sessions: newSessions,
        activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
      };
    }),
}));
