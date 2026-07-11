import { create } from 'zustand';

export interface WorkspaceEntry {
  id: string;
  name: string;
  path: string;
}

export interface SessionInfo {
  id: string;
  agentType: string; // "claude" | "aider" | "custom"
  cwd: string;
  provider: string; // "anthropic" | "openai" | "gemini" | "deepseek"
  cmd: string;
  args: string[];
}

export interface GitFileStatus {
  path: string;
  status: string; // "M" | "A" | "D" | "??"
  staged: boolean;
}

export interface PaneLayout {
  type: '1x1' | '1x2' | '2x1' | '2x2';
  activePaneIndex: number;
  panes: (string | null)[]; // 4 slots max for sessionId
}

export const getVisiblePaneCount = (type: PaneLayout['type']): number => {
  if (type === '2x2') return 4;
  if (type === '1x1') return 1;
  return 2;
};

interface WorkspaceState {
  activeWorkspace: WorkspaceEntry | null;
  workspaces: WorkspaceEntry[];
  sessions: Record<string, SessionInfo>;
  activeSessionId: string | null;
  
  // File details preview
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
  
  // Storage of pane layouts grouped by project workspace ID
  paneLayoutsByProject: Record<string, PaneLayout>;

  // Actions
  setWorkspace: (ws: WorkspaceEntry | null) => void;
  setWorkspaces: (wsList: WorkspaceEntry[]) => void;
  addWorkspace: (ws: WorkspaceEntry) => void;
  removeWorkspace: (id: string) => void;
  addSession: (session: SessionInfo) => void;
  setSessions: (sessions: Record<string, SessionInfo>) => void;
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
  paneLayoutsByProject: {},

  setWorkspace: (ws) =>
    set((state) => {
      if (!ws) {
        return {
          activeWorkspace: null,
          openFiles: [],
          activeFileTab: null,
          paneLayout: {
            type: '1x1',
            activePaneIndex: 0,
            panes: [null, null, null, null],
          }
        };
      }
      // Load this specific project's tabs
      const wsOpenFiles = state.openFilesByProject[ws.id] || [];
      const wsActiveFileTab = state.activeFileTabByProject[ws.id] !== undefined
        ? state.activeFileTabByProject[ws.id]
        : null;
      const wsPaneLayout = state.paneLayoutsByProject[ws.id] || {
        type: '1x1',
        activePaneIndex: 0,
        panes: [null, null, null, null],
      };

      const activeSessId = wsPaneLayout.panes[wsPaneLayout.activePaneIndex] || null;

      return {
        activeWorkspace: ws,
        openFiles: wsOpenFiles,
        activeFileTab: wsActiveFileTab,
        activeFilePath: wsActiveFileTab,
        paneLayout: wsPaneLayout,
        activeSessionId: activeSessId,
      };
    }),

  setWorkspaces: (wsList) => set({ workspaces: wsList }),
  addWorkspace: (ws) => set((state) => ({ workspaces: [...state.workspaces, ws] })),
  removeWorkspace: (id) =>
    set((state) => {
      const newOpenFilesByProj = { ...state.openFilesByProject };
      const newActiveFileTabByProj = { ...state.activeFileTabByProject };
      const newPaneLayoutsByProject = { ...state.paneLayoutsByProject };
      delete newOpenFilesByProj[id];
      delete newActiveFileTabByProj[id];
      delete newPaneLayoutsByProject[id];

      return {
        workspaces: state.workspaces.filter((w) => w.id !== id),
        openFilesByProject: newOpenFilesByProj,
        activeFileTabByProject: newActiveFileTabByProj,
        paneLayoutsByProject: newPaneLayoutsByProject
      };
    }),

  addSession: (session) =>
    set((state) => ({
      sessions: { ...state.sessions, [session.id]: session },
    })),

  setSessions: (sessions) =>
    set({ sessions }),

  setActiveSession: (id) => set({ activeSessionId: id }),

  removeSession: (id) =>
    set((state) => {
      const newSessions = { ...state.sessions };
      delete newSessions[id];
      
      // Clean up references in split panes
      const newPanes = state.paneLayout.panes.map(p => p === id ? null : p);
      const newPaneLayout = { ...state.paneLayout, panes: newPanes };

      const wsId = state.activeWorkspace?.id || 'project_default';
      const newPaneLayoutsByProject = {
        ...state.paneLayoutsByProject,
        [wsId]: newPaneLayout
      };

      return {
        sessions: newSessions,
        activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
        paneLayout: newPaneLayout,
        paneLayoutsByProject: newPaneLayoutsByProject,
      };
    }),
    
  setActiveFilePath: (path) => set({ activeFilePath: path }),
  setActiveFileContent: (content) => set({ activeFileContent: content }),
  setActiveRightPanel: (panel) => set({ activeRightPanel: panel }),
  setGitFiles: (files) => set({ gitFiles: files }),
  setGitBranch: (branch) => set({ gitBranch: branch }),

  setPaneLayoutType: (type) =>
    set((state) => {
      const newPaneLayout = { ...state.paneLayout, type };
      const wsId = state.activeWorkspace?.id || 'project_default';
      return {
        paneLayout: newPaneLayout,
        paneLayoutsByProject: {
          ...state.paneLayoutsByProject,
          [wsId]: newPaneLayout
        }
      };
    }),

  setPaneSessionId: (index, sessionId) =>
    set((state) => {
      if (index < 0 || index >= state.paneLayout.panes.length) return state;

      const newPanes = state.paneLayout.panes.map((paneSessionId) =>
        sessionId && paneSessionId === sessionId ? null : paneSessionId
      );
      newPanes[index] = sessionId;
      const newPaneLayout = { ...state.paneLayout, panes: newPanes };
      const wsId = state.activeWorkspace?.id || 'project_default';
      const cleanedPaneLayouts = Object.fromEntries(
        Object.entries(state.paneLayoutsByProject).map(([projectId, layout]) => [
          projectId,
          sessionId
            ? { ...layout, panes: layout.panes.map((paneSessionId) => paneSessionId === sessionId ? null : paneSessionId) }
            : layout,
        ])
      );
      return {
        paneLayout: newPaneLayout,
        activeSessionId: sessionId || state.activeSessionId,
        paneLayoutsByProject: {
          ...cleanedPaneLayouts,
          [wsId]: newPaneLayout
        }
      };
    }),

  setActivePaneIndex: (activePaneIndex) =>
    set((state) => {
      const newPaneLayout = { ...state.paneLayout, activePaneIndex };
      const wsId = state.activeWorkspace?.id || 'project_default';
      return {
        paneLayout: newPaneLayout,
        activeSessionId: state.paneLayout.panes[activePaneIndex] || state.activeSessionId,
        paneLayoutsByProject: {
          ...state.paneLayoutsByProject,
          [wsId]: newPaneLayout
        }
      };
    }),

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
