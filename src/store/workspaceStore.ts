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

export interface PaneLayout {
  type: '1x1' | '1x2' | '2x1' | '2x2';
  activePaneIndex: number;
  panes: (string | null)[];
}

interface WorkspaceState {
  // Existing state
  activeWorkspace: Workspace | null;
  workspaces: Workspace[];
  sessions: Record<string, Session>;
  activeSessionId: string | null;
  
  // New state for file operations and Git
  activeFilePath: string | null;
  activeFileContent: string | null;
  activeRightPanel: 'files' | 'git' | 'settings' | 'none';
  gitFiles: GitFileStatus[];
  gitBranch: string;

  // Split Pane Layout
  paneLayout: PaneLayout;

  // Tab Manager for Center Panel
  openFiles: { path: string; name: string }[];
  activeFileTab: string | null; // null means terminal splits grid, otherwise file path string

  // Actions
  setWorkspace: (ws: Workspace | null) => void;
  setWorkspaces: (wsList: Workspace[]) => void;
  addWorkspace: (ws: Workspace) => void;
  removeWorkspace: (id: string) => void;
  addSession: (session: Session) => void;
  setActiveSession: (id: string | null) => void;
  removeSession: (id: string) => void;
  
  setActiveFilePath: (path: string | null) => void;
  setActiveFileContent: (content: string | null) => void;
  setActiveRightPanel: (panel: 'files' | 'git' | 'settings' | 'none') => void;
  setGitFiles: (files: GitFileStatus[]) => void;
  setGitBranch: (branch: string) => void;

  setPaneLayoutType: (type: '1x1' | '1x2' | '2x1' | '2x2') => void;
  setPaneSessionId: (index: number, sessionId: string | null) => void;
  setActivePaneIndex: (index: number) => void;

  openFile: (path: string, name: string) => void;
  closeFile: (path: string) => void;
  setActiveFileTab: (tab: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeWorkspace: null,
  workspaces: [],
  sessions: {},
  activeSessionId: null,
  
  activeFilePath: null,
  activeFileContent: null,
  activeRightPanel: 'none',
  gitFiles: [],
  gitBranch: 'no-git',

  paneLayout: {
    type: '1x1',
    activePaneIndex: 0,
    panes: [null, null, null, null],
  },

  openFiles: [],
  activeFileTab: null,

  setWorkspace: (ws) => set({ activeWorkspace: ws }),
  setWorkspaces: (wsList) => set({ workspaces: wsList }),
  addWorkspace: (ws) => set((state) => ({ workspaces: [...state.workspaces, ws] })),
  removeWorkspace: (id) => set((state) => ({ workspaces: state.workspaces.filter(w => w.id !== id) })),
  addSession: (session) =>
    set((state) => ({
      sessions: { ...state.sessions, [session.id]: session },
    })),
  setActiveSession: (id) => set({ activeSessionId: id }),
  removeSession: (id) =>
    set((state) => {
      const newSessions = { ...state.sessions };
      delete newSessions[id];
      
      // Also clean up references in split panes
      const newPanes = state.paneLayout.panes.map(p => p === id ? null : p);

      return {
        sessions: newSessions,
        activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
        paneLayout: { ...state.paneLayout, panes: newPanes },
      };
    }),
    
  setActiveFilePath: (path) => set({ activeFilePath: path }),
  setActiveFileContent: (content) => set({ activeFileContent: content }),
  setActiveRightPanel: (panel) => set({ activeRightPanel: panel }),
  setGitFiles: (files) => set({ gitFiles: files }),
  setGitBranch: (branch) => set({ gitBranch: branch }),

  setPaneLayoutType: (type) =>
    set((state) => ({
      paneLayout: { ...state.paneLayout, type },
    })),
  setPaneSessionId: (index, sessionId) =>
    set((state) => {
      const newPanes = [...state.paneLayout.panes];
      newPanes[index] = sessionId;
      return {
        paneLayout: { ...state.paneLayout, panes: newPanes },
        activeSessionId: sessionId || state.activeSessionId,
      };
    }),
  setActivePaneIndex: (activePaneIndex) =>
    set((state) => ({
      paneLayout: { ...state.paneLayout, activePaneIndex },
      activeSessionId: state.paneLayout.panes[activePaneIndex] || state.activeSessionId,
    })),

  openFile: (path, name) => set((state) => {
    const exists = state.openFiles.some(f => f.path === path);
    const newOpenFiles = exists ? state.openFiles : [...state.openFiles, { path, name }];
    return {
      openFiles: newOpenFiles,
      activeFileTab: path,
      activeFilePath: path,
    };
  }),

  closeFile: (path) => set((state) => {
    const newOpenFiles = state.openFiles.filter(f => f.path !== path);
    let newActiveTab = state.activeFileTab;
    if (state.activeFileTab === path) {
      newActiveTab = newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1].path : null;
    }
    return {
      openFiles: newOpenFiles,
      activeFileTab: newActiveTab,
      activeFilePath: newActiveTab,
    };
  }),

  setActiveFileTab: (tab) => set({ 
    activeFileTab: tab,
    activeFilePath: tab,
  }),
}));
