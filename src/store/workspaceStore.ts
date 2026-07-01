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

export interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

interface WorkspaceState {
  // Existing state
  activeWorkspace: Workspace | null;
  sessions: Record<string, Session>;
  activeSessionId: string | null;
  
  // New state for file operations and Git
  activeFilePath: string | null;
  activeFileContent: string | null;
  activeRightPanel: 'editor' | 'git' | 'none';
  gitFiles: GitFileStatus[];
  gitBranch: string;

  // Actions
  setWorkspace: (ws: Workspace) => void;
  addSession: (session: Session) => void;
  setActiveSession: (id: string | null) => void;
  removeSession: (id: string) => void;
  
  setActiveFilePath: (path: string | null) => void;
  setActiveFileContent: (content: string | null) => void;
  setActiveRightPanel: (panel: 'editor' | 'git' | 'none') => void;
  setGitFiles: (files: GitFileStatus[]) => void;
  setGitBranch: (branch: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeWorkspace: null,
  sessions: {},
  activeSessionId: null,
  
  activeFilePath: null,
  activeFileContent: null,
  activeRightPanel: 'none',
  gitFiles: [],
  gitBranch: 'no-git',

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
    
  setActiveFilePath: (path) => set({ activeFilePath: path }),
  setActiveFileContent: (content) => set({ activeFileContent: content }),
  setActiveRightPanel: (panel) => set({ activeRightPanel: panel }),
  setGitFiles: (files) => set({ gitFiles: files }),
  setGitBranch: (branch) => set({ gitBranch: branch }),
}));
