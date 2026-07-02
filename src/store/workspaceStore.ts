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

  // Tab Manager for Center Panel (Current values active for current workspace)
  openFiles: { path: string; name: string }[];
  activeFileTab: string | null; // null means terminal splits grid, otherwise file path string

  // Storage of tabs grouped by project workspace ID
  openFilesByProject: Record<string, { path: string; name: string }[]>;
  activeFileTabByProject: Record<string, string | null>;

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

  openFilesByProject: {},
  activeFileTabByProject: {},

  setWorkspace: (ws) =>
    set((state) => {
      if (!ws) {
        return {
          activeWorkspace: null,
          openFiles: [],
          activeFileTab: null
        };
      }
      // Load this specific project's tabs
      const wsOpenFiles = state.openFilesByProject[ws.id] || [];
      const wsActiveFileTab = state.activeFileTabByProject[ws.id] !== undefined
        ? state.activeFileTabByProject[ws.id]
        : null;

      return {
        activeWorkspace: ws,
        openFiles: wsOpenFiles,
        activeFileTab: wsActiveFileTab,
        activeFilePath: wsActiveFileTab
      };
    }),

  setWorkspaces: (wsList) => set({ workspaces: wsList }),
  addWorkspace: (ws) => set((state) => ({ workspaces: [...state.workspaces, ws] })),
  removeWorkspace: (id) =>
    set((state) => {
      const newOpenFilesByProj = { ...state.openFilesByProject };
      const newActiveFileTabByProj = { ...state.activeFileTabByProject };
      delete newOpenFilesByProj[id];
      delete newActiveFileTabByProj[id];

      return {
        workspaces: state.workspaces.filter((w) => w.id !== id),
        openFilesByProject: newOpenFilesByProj,
        activeFileTabByProject: newActiveFileTabByProj
      };
    }),

  addSession: (session) =>
    set((state) => ({
      sessions: { ...state.sessions, [session.id]: session },
    })),

  setActiveSession: (id) => set({ activeSessionId: id }),

  removeSession: (id) =>
    set((state) => {
      const newSessions = { ...state.sessions };
      delete newSessions[id];
      
      // Clean up references in split panes
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

  openFile: (path, name) =>
    set((state) => {
      const wsId = state.activeWorkspace?.id || 'project_default';
      const currentWsOpenFiles = state.openFilesByProject[wsId] || [];
      const exists = currentWsOpenFiles.some(f => f.path === path);
      const newOpenFiles = exists ? currentWsOpenFiles : [...currentWsOpenFiles, { path, name }];

      const newOpenFilesByProj = {
        ...state.openFilesByProject,
        [wsId]: newOpenFiles
      };
      const newActiveFileTabByProj = {
        ...state.activeFileTabByProject,
        [wsId]: path
      };

      return {
        openFiles: newOpenFiles,
        activeFileTab: path,
        activeFilePath: path,
        openFilesByProject: newOpenFilesByProj,
        activeFileTabByProject: newActiveFileTabByProj
      };
    }),

  closeFile: (path) =>
    set((state) => {
      const wsId = state.activeWorkspace?.id || 'project_default';
      const currentWsOpenFiles = state.openFilesByProject[wsId] || [];
      const currentWsActiveFileTab = state.activeFileTabByProject[wsId] || null;

      const newOpenFiles = currentWsOpenFiles.filter(f => f.path !== path);
      let newActiveTab = currentWsActiveFileTab;
      if (currentWsActiveFileTab === path) {
        newActiveTab = newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1].path : null;
      }

      const newOpenFilesByProj = {
        ...state.openFilesByProject,
        [wsId]: newOpenFiles
      };
      const newActiveFileTabByProj = {
        ...state.activeFileTabByProject,
        [wsId]: newActiveTab
      };

      return {
        openFiles: newOpenFiles,
        activeFileTab: newActiveTab,
        activeFilePath: newActiveTab,
        openFilesByProject: newOpenFilesByProj,
        activeFileTabByProject: newActiveFileTabByProj
      };
    }),

  setActiveFileTab: (tab) =>
    set((state) => {
      const wsId = state.activeWorkspace?.id || 'project_default';
      const newActiveFileTabByProj = {
        ...state.activeFileTabByProject,
        [wsId]: tab
      };
      return {
        activeFileTab: tab,
        activeFilePath: tab,
        activeFileTabByProject: newActiveFileTabByProj
      };
    }),
}));
