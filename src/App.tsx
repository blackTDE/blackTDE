import { useState, useEffect, useMemo } from 'react';
import { hasWorkspacePath, useWorkspaceStore } from './store/workspaceStore';
import { dedupeSessions } from './sessionUtils';
import { isLocalShell } from './shellRestore';
import { TerminalGrid } from './components/TerminalGrid';
import { SettingsPanel } from './components/SettingsPanel';
import { FileTree } from './components/FileTree';
import { FilePreview } from './components/FilePreview';
import { GitPanel } from './components/GitPanel';
import { GitDiffCompare } from './components/GitDiffCompare';
import { SearchPanel } from './components/SearchPanel';
import { SkillsPanel } from './components/SkillsPanel';
import { BrowserPanel } from './components/BrowserPanel';
import { AgentIcon } from './components/AgentIcon';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { 
  Plus, 
  Trash2, 
  Pencil,
  GitBranch, 
  Sparkles,
  Minimize2,
  EyeOff,
  Settings,
  Folder,
  X,
  SquareTerminal,
  ChevronDown,
  ChevronRight,
  PlusCircle,
  PlayCircle,
  FolderOpen,
  Search,
  Pin,
  LayoutGrid,
  Globe
} from 'lucide-react';

const getFriendlySshHost = (sshHost?: string): string => {
  if (!sshHost) return 'ssh';
  let hostPart = sshHost;
  if (sshHost.includes('@')) {
    hostPart = sshHost.split('@')[1];
  }
  hostPart = hostPart.split('-p')[0].trim();
  hostPart = hostPart.split(/\s+/)[0];
  return `ssh (${hostPart})`;
};

const brandIcon = new URL('./assets/icon.png', import.meta.url).href;

function App() {
  const { 
    sessions, 
    activeSessionId, 
    addSession, 
    setActiveSession, 
    removeSession,
    activeRightPanel,
    setActiveRightPanel,
    gitBranch,
    setGitBranch,
    setGitFiles,
    setPaneSessionId,
    workspaces,
    activeWorkspace,
    openWorkspaceTabIds,
    openWorkspaceTab,
    closeWorkspaceTab,
    reorderWorkspaceTabs,
    sessionOrderIdsByProject,
    reorderSessionTabs,
    openFiles,
    activeFileTab,
    closeFile,
    reorderOpenFiles,
    setActiveFileTab,
    setWorkspace,
    setWorkspaces,
    isSessionPinned,
    toggleSessionPin,
    leftPanelWidth,
    setLeftPanelWidth,
    rightPanelWidth,
    setRightPanelWidth,
    pinnedSessionWidthPercent,
    setPinnedSessionWidthPercent,
    isLeftPanelPinned,
    toggleLeftPanelPin,
    isRightPanelPinned,
    toggleRightPanelPin
  } = useWorkspaceStore();

  const [draggedFileTabIndex, setDraggedFileTabIndex] = useState<number | null>(null);
  const [draggedProjectTabIndex, setDraggedProjectTabIndex] = useState<number | null>(null);
  const [draggedSessionTabIndex, setDraggedSessionTabIndex] = useState<number | null>(null);
  const [isRightPanelHovered, setIsRightPanelHovered] = useState(false);
  const [activeFatherTabId, setActiveFatherTabId] = useState('');
  const [isLeftPanelHovered, setIsLeftPanelHovered] = useState(false);

  // Mouse drag resize handlers
  const handleLeftResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftPanelWidth;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(200, Math.min(600, startWidth + delta));
      setLeftPanelWidth(newWidth);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleRightResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightPanelWidth;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.max(220, Math.min(600, startWidth + delta));
      setRightPanelWidth(newWidth);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleCenterSplitResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = e.currentTarget.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const onMouseMove = (moveEvent: MouseEvent) => {
      const offsetX = moveEvent.clientX - rect.left;
      const percent = Math.max(20, Math.min(80, Math.round((offsetX / rect.width) * 100)));
      setPinnedSessionWidthPercent(percent);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const [shellSplitError, setShellSplitError] = useState<string | null>(null);

  // Expanded/Collapsed state for projects in Left Panel
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({
    'project_default': true
  });

  // Modal Dialog spawner state
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [modalTargetProject, setModalTargetProject] = useState<any>(null);
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | null>(null);
  const [sessionDeleteError, setSessionDeleteError] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState<string>('');

  // New Project Form parameters
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');

  // Spawning process parameters
  const [cmdInput, setCmdInput] = useState('/bin/zsh');
  const [argsInput, setArgsInput] = useState('');
  const [cwdInput, setCwdInput] = useState('/Users/ray/git-repo/black_tde');
  const [spawnProvider, setSpawnProvider] = useState('none');
  const [pastSessions, setPastSessions] = useState<any[]>([]);
  const [resumeSessionId, setResumeSessionId] = useState('');
  const [manualResumeSessionId, setManualResumeSessionId] = useState('');
  const [detectedClis, setDetectedClis] = useState<string[]>([]);
  const [privileged, setPrivileged] = useState(true);
  const [isSpawningSession, setIsSpawningSession] = useState(false);
  const [spawnSessionError, setSpawnSessionError] = useState<string | null>(null);

  // SSH Session Spawner state
  const [sessionType, setSessionType] = useState<'local' | 'ssh'>('local');
  const [sshHostSelect, setSshHostSelect] = useState('manual');
  const [sshHostManual, setSshHostManual] = useState('');
  const [sshUser, setSshUser] = useState('');
  const [sshPort, setSshPort] = useState('');
  const [sshConfigHosts, setSshConfigHosts] = useState<string[]>([]);

  const fetchSshConfigHosts = async () => {
    try {
      const hosts = await invoke<string[]>('get_ssh_config_hosts');
      setSshConfigHosts(hosts);
      if (hosts.length > 0) {
        setSshHostSelect(hosts[0]);
      } else {
        setSshHostSelect('manual');
      }
    } catch (err) {
      console.error('Failed to get ssh hosts:', err);
    }
  };

  const workspacePath = '/Users/ray/git-repo/black_tde';

  const loadPastSessions = async () => {
    try {
      const list = await invoke<any[]>('list_past_sessions');
      const canonicalSessions = dedupeSessions(list);
      // Filter for resume dropdown list (needs remote conversation ID)
      setPastSessions(canonicalSessions.filter(s => s.remote_session_id));

      // Populate Zustand store sessions to persist them across app restarts
      const sessionsMap: Record<string, any> = {};
      for (const s of canonicalSessions) {
        let displayAgentType = s.agent_type;
        if (s.ssh_host) {
          displayAgentType = getFriendlySshHost(s.ssh_host);
        }
        sessionsMap[s.id] = {
          id: s.id,
          agentType: displayAgentType,
          cwd: s.cwd,
          provider: s.provider || 'none',
          cmd: s.agent_type,
          args: [],
          ssh_host: s.ssh_host,
        };
      }
      useWorkspaceStore.getState().setSessions(sessionsMap);
    } catch (e) {
      console.error('Failed to load past sessions:', e);
    }
  };

  const handleClearTerminatedSessions = async () => {
    try {
      await invoke('clear_terminated_sessions');
      await loadPastSessions();
    } catch (err) {
      console.error('Failed to clear terminated sessions:', err);
    }
  };

  const loadWorkspaces = async () => {
    try {
      let list = await invoke<any[]>('list_workspaces');
      if (list.length === 0) {
        // Create default workspace entry pointing to this repository
        await invoke('create_workspace', {
          id: 'project_default',
          name: 'black_tde',
          path: workspacePath
        });
        list = await invoke<any[]>('list_workspaces');
      }
      setWorkspaces(list);

      // Default select the first project if no project is active yet
      if (!activeWorkspace && list.length > 0) {
        handleSelectProject(list[0]);
        setActiveFatherTabId(list[0].id);
      } else if (activeWorkspace) {
        setActiveFatherTabId(activeWorkspace.id);
      }
    } catch (err) {
      console.error('Failed to load workspaces:', err);
    }
  };

  const handleSelectProject = (ws: any) => {
    setWorkspace(ws);
    setCwdInput(ws.path);
    setGitFiles([]);
    
    // Reload git branch for the selected project
    invoke<string>('get_git_branch', { cwd: ws.path })
      .then(setGitBranch)
      .catch((err) => {
        console.error(err);
        setGitBranch('no-git');
      });
  };

  const handleSelectDirectory = async () => {
    try {
      const selected = await invoke<string | null>('select_directory');
      if (selected) {
        setNewProjectPath(selected);
        // Extract base folder name
        const parts = selected.split(/[/\\]/).filter(Boolean);
        if (parts.length > 0) {
          setNewProjectName(parts[parts.length - 1]);
        }
      }
    } catch (err) {
      console.error('Failed to select folder:', err);
    }
  };

  const handleCreateProject = async () => {
    const projectPath = newProjectPath.trim();
    if (!projectPath) {
      alert('Please enter or select a directory path.');
      return;
    }
    if (hasWorkspacePath(workspaces, projectPath)) {
      alert('This project is already in the project tree.');
      return;
    }
    const finalName = newProjectName.trim() || 'unnamed_project';
    const id = 'project_' + Math.random().toString(36).substring(2, 11);
    try {
      await invoke('create_workspace', {
        id,
        name: finalName,
        path: projectPath
      });
      setNewProjectName('');
      setNewProjectPath('');
      setShowNewProjectForm(false);
      await loadWorkspaces();

      // Automatically select the newly created project
      const list = await invoke<any[]>('list_workspaces');
      const newlyCreated = list.find(w => w.id === id);
      if (newlyCreated) {
        handleSelectProject(newlyCreated);
        setActiveFatherTabId(id);
        // Expand the newly created project in the sidebar list
        setExpandedProjects(prev => ({ ...prev, [id]: true }));
      }
    } catch (error) {
      alert('Failed to create project: ' + error);
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await invoke('delete_workspace', { id });
      await loadWorkspaces();
      if (activeWorkspace?.id === id) {
        setWorkspace(null);
      }
    } catch (error) {
      alert('Failed to delete project: ' + error);
    }
  };

  const toggleProjectExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedProjects(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const openNewSessionModal = (project: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setModalTargetProject(project);
    setCwdInput(project.path);
    // Suggest shell or agent based on provider keys
    setSpawnProvider('none');
    setCmdInput('/bin/zsh');
    setArgsInput('');
    setResumeSessionId('');
    setManualResumeSessionId('');
    setSpawnSessionError(null);
    setSessionType('local');
    setSshHostSelect('manual');
    setSshHostManual('');
    setSshUser('');
    setSshPort('');
    fetchSshConfigHosts();
    setShowNewSessionModal(true);
  };

  useEffect(() => {
    loadWorkspaces();
    loadPastSessions();
    setActiveRightPanel('files');
    invoke<string[]>('detect_available_clis')
      .then(setDetectedClis)
      .catch((err) => console.error('Failed to detect CLIs:', err));

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsRightPanelHovered(true);
        setActiveRightPanel('search');
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const unlistenPromise = listen('tde-event', (event: any) => {
      const payload = event.payload;
      if (payload.event_type === 'exit') {
        removeSession(payload.session_id);
      }
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const handleCreateSession = async () => {
    if (isSpawningSession) return;

    if (resumeSessionId) {
      const existingSession = pastSessions.find((session) => session.id === resumeSessionId);
      if (!existingSession) {
        alert('The selected session is no longer available.');
        return;
      }

      handleSelectSession(modalTargetProject || activeWorkspace, existingSession.id);
      setResumeSessionId('');
      setShowNewSessionModal(false);
      return;
    }

    if (sessionType === 'local' && !cmdInput.trim()) {
      setSpawnSessionError('Enter a command to start.');
      return;
    }
    const newSessionId = 'session_' + Math.random().toString(36).substring(2, 11);
    const mockWorkspaceId = modalTargetProject?.id || activeWorkspace?.id || 'project_default';
    const args = argsInput.trim() ? argsInput.split(/\s+/) : [];
    const targetCwd = modalTargetProject?.path || cwdInput || workspacePath;

    let finalCommand = cmdInput;
    let finalArgs = args;
    let finalSshHost: string | null = null;
    let finalAgentType = cmdInput.split('/').pop() || cmdInput;

    if (sessionType === 'ssh') {
      finalCommand = 'ssh';
      finalArgs = [];
      if (sshHostSelect === 'manual') {
        if (!sshHostManual) {
          setSpawnSessionError('Enter an SSH host or IP address.');
          return;
        }
        let hostString = sshHostManual;
        if (sshUser.trim()) {
          hostString = `${sshUser.trim()}@${hostString}`;
        }
        if (sshPort.trim()) {
          hostString = `${hostString} -p ${sshPort.trim()}`;
        }
        finalSshHost = hostString;
      } else {
        finalSshHost = sshHostSelect;
      }
      finalAgentType = getFriendlySshHost(finalSshHost);
    }

    setSpawnSessionError(null);
    setIsSpawningSession(true);
    try {
      await invoke('spawn_session', {
        id: newSessionId,
        workspaceId: mockWorkspaceId,
        command: finalCommand,
        args: finalArgs,
        cwd: targetCwd,
        rows: 24,
        cols: 80,
        provider: spawnProvider,
        resumeSessionId: manualResumeSessionId.trim() || null,
        privileged: privileged,
        sshHost: finalSshHost,
      });

      addSession({
        id: newSessionId,
        agentType: finalAgentType,
        cwd: targetCwd,
        provider: spawnProvider,
        cmd: finalCommand,
        args: finalArgs,
        ssh_host: finalSshHost || undefined,
      });

      setPaneSessionId(0, newSessionId);
      setActiveSession(newSessionId);
      if (!isSessionPinned) {
        setActiveFileTab(null);
      }
      setResumeSessionId('');
      setManualResumeSessionId('');
      loadPastSessions();
      setShowNewSessionModal(false);
    } catch (error) {
      setSpawnSessionError(String(error));
    } finally {
      setIsSpawningSession(false);
    }
  };

  const handleDeleteSession = async (id: string, confirmed = false) => {
    try {
      const activeIds = await invoke<string[]>('list_active_session_ids');
      const isAlive = activeIds.includes(id);

      if (isAlive && !confirmed) {
        setPendingDeleteSessionId(id);
        return;
      }

      await invoke('delete_session', { id });
      removeSession(id);
      setPendingDeleteSessionId(null);
      setSessionDeleteError(null);

      const state = useWorkspaceStore.getState();
      if (state.activeSessionId === id) {
        state.setActiveSession(null);
      }

      loadPastSessions();
    } catch (error) {
      console.error('Failed to delete session:', error);
      setSessionDeleteError(String(error));
      setPendingDeleteSessionId(null);
    }
  };

  const handleSelectSession = (ws: any, sessionId: string) => {
    handleSelectProject(ws);
    setActiveFatherTabId(ws.id); // Ensure the project's father tab is active!
    setActiveSession(sessionId);
    setPaneSessionId(0, sessionId);
    if (!isSessionPinned) {
      setActiveFileTab(null);
    }
  };

  const handleShellSplit = async (direction: 'right' | 'down') => {
    if (!activeSessionId) return;
    try {
      await invoke('split_shell_session', { id: activeSessionId, direction });
      setShellSplitError(null);
    } catch (error) {
      setShellSplitError(String(error));
    }
  };

  // Filters past sessions to target workspace path
  const getFilteredPastSessions = (projectPath: string) => {
    return pastSessions.filter(s => s.cwd === projectPath);
  };

  // Filter and sort open workspaces for top tab bar preserving tab order
  const openWorkspaces = useMemo(() => {
    const wsMap = new Map(workspaces.map((w) => [w.id, w]));
    const ordered: typeof workspaces = [];
    openWorkspaceTabIds.forEach((id) => {
      const ws = wsMap.get(id);
      if (ws) {
        ordered.push(ws);
      }
    });
    return ordered;
  }, [workspaces, openWorkspaceTabIds]);

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const canSplitActiveShell = Boolean(
    activeSession && isLocalShell(activeSession.cmd || activeSession.agentType, activeSession.ssh_host)
  );

  // Filter active sessions belonging to the active project path, sorted by customized session order
  const activeProjectSessions = useMemo(() => {
    const projectPath = activeWorkspace?.path || '';
    const projectId = activeWorkspace?.id || 'default';
    const list = Object.values(sessions).filter((s) => s.cwd === projectPath);
    const order = sessionOrderIdsByProject[projectId] || [];
    if (order.length === 0) return list;
    return [...list].sort((a, b) => {
      const idxA = order.indexOf(a.id);
      const idxB = order.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [sessions, activeWorkspace, sessionOrderIdsByProject]);

  return (
    <div className="flex h-screen w-screen bg-surface text-zinc-100 overflow-hidden font-sans flex-col select-none relative">
      {/* Main Container */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden relative">
        {/* Left Edge Hover Trigger Zone (Active in Auto-Hide mode when panel is closed) */}
        {!isLeftPanelPinned && !isLeftPanelHovered && (
          <div
            onMouseEnter={() => setIsLeftPanelHovered(true)}
            className="absolute left-0 top-0 bottom-0 w-2.5 z-30 cursor-pointer bg-transparent hover:bg-brand/30 transition-colors"
            title="Hover to show Project Tree"
          />
        )}

        {/* Left Sidebar Panel (Projects Tree Viewer) - Rendered when Pinned or Hovered */}
        {(isLeftPanelPinned || isLeftPanelHovered) && (
          <div
            style={{ width: `${leftPanelWidth}px` }}
            onMouseLeave={() => {
              if (!isLeftPanelPinned) {
                setIsLeftPanelHovered(false);
              }
            }}
            className={`bg-surface-1 flex flex-col select-none overflow-hidden font-sans transition-all border-r border-surface-2 ${
              isLeftPanelPinned
                ? 'shrink-0 z-10'
                : 'absolute left-0 top-0 bottom-0 z-40 shadow-2xl animate-in slide-in-from-left-2 duration-150'
            }`}
          >
            {/* Floating Resizer Handle on Right Edge when Unpinned */}
            {!isLeftPanelPinned && (
              <div
                onMouseDown={handleLeftResizeStart}
                className="absolute right-0 top-0 bottom-0 w-1.5 hover:w-2 cursor-col-resize bg-transparent hover:bg-brand/60 transition-all z-50 select-none"
                title="Drag to resize Left Panel"
              />
            )}

            {/* Header */}
            <div className="p-4 border-b border-surface-2 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <img src={brandIcon} alt="Black TDE Logo" className="w-8 h-8 rounded object-cover" />
                <div>
                  <h1 className="font-bold text-xs tracking-wider text-zinc-100 font-mono uppercase">TDE Cockpit</h1>
                  <p className="text-[9px] text-zinc-500 font-mono">v1.2.0</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1 text-success text-[10px] font-semibold bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
                  <span>Online</span>
                </div>
                {/* Pin / Auto-Hide Switch Button */}
                <button
                  type="button"
                  onClick={() => {
                    toggleLeftPanelPin();
                    if (isLeftPanelPinned) {
                      setIsLeftPanelHovered(false);
                    }
                  }}
                  className={`p-1 rounded hover:bg-surface-2 transition cursor-pointer ${
                    isLeftPanelPinned ? 'text-brand-light' : 'text-zinc-500 hover:text-zinc-200'
                  }`}
                  title={isLeftPanelPinned ? "Unpin (Enable Auto-Hide on mouse leave)" : "Pin Project Tree (Fix in layout)"}
                >
                  <Pin size={13} className={isLeftPanelPinned ? 'rotate-45 text-brand-light' : 'text-zinc-500'} />
                </button>
                {!isLeftPanelPinned && (
                  <button
                    type="button"
                    onClick={() => setIsLeftPanelHovered(false)}
                    className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-surface-2 transition cursor-pointer"
                    title="Hide Panel"
                  >
                    <Minimize2 size={13} />
                  </button>
                )}
              </div>
            </div>

              {/* Left panel body: Project list tree with nested active sessions */}
              <div className="flex-grow overflow-y-auto flex flex-col p-4 space-y-3 min-h-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase font-mono">Project Tree</h2>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleClearTerminatedSessions}
                      className="text-zinc-500 hover:text-red-400 p-1 transition cursor-pointer"
                      title="Clear Terminated Sessions"
                    >
                      <Trash2 size={13} />
                    </button>
                    <button
                      onClick={() => setShowNewProjectForm(!showNewProjectForm)}
                      className="text-zinc-500 hover:text-brand-light p-1 transition cursor-pointer"
                      title="Create New Project"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                {/* Create Project Form */}
                {showNewProjectForm && (
                  <div className="p-3.5 bg-surface border border-surface-3 rounded-lg space-y-3 text-xs shadow-md">
                    <div>
                      <label className="block text-[10px] text-zinc-500 font-semibold font-mono mb-1">LOCAL PATH</label>
                      <div className="flex space-x-1">
                        <input
                          type="text"
                          placeholder="e.g. /Users/ray/my-project"
                          value={newProjectPath}
                          onChange={(e) => {
                            const path = e.target.value;
                            setNewProjectPath(path);
                            // Auto-extract last path segment as the default project name
                            const parts = path.split(/[/\\]/).filter(Boolean);
                            if (parts.length > 0) {
                              setNewProjectName(parts[parts.length - 1]);
                            }
                          }}
                          className="flex-1 min-w-0 bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-brand/70 font-mono"
                        />
                        <button
                          onClick={handleSelectDirectory}
                          title="Select Local Directory"
                          className="px-2.5 bg-surface-3 border border-surface-3 rounded hover:bg-surface-2 hover:text-brand-light text-zinc-400 transition cursor-pointer flex items-center justify-center shrink-0"
                        >
                          <FolderOpen size={14} />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-500 font-semibold font-mono mb-1">PROJECT NAME</label>
                      <input
                        type="text"
                        placeholder="Auto-detected base name"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-brand/70 font-mono"
                      />
                    </div>
                    <div className="flex space-x-2 pt-1">
                      <button
                        onClick={handleCreateProject}
                        className="flex-1 bg-brand text-white font-semibold py-1.5 rounded text-[11px] hover:bg-brand/90 cursor-pointer transition"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setShowNewProjectForm(false)}
                        className="flex-1 bg-surface-3 text-zinc-400 font-semibold py-1.5 rounded text-[11px] hover:bg-surface-2 cursor-pointer transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Projects list tree nodes */}
                <div className="space-y-2 overflow-y-auto">
                  {workspaces.map((ws) => {
                    const isExpanded = expandedProjects[ws.id];
                    const isActive = activeWorkspace?.id === ws.id;
                    // Filter active sessions inside this project respecting custom order
                    const rawProjectSessions = Object.values(sessions).filter(s => s.cwd === ws.path);
                    const wsSessionOrder = sessionOrderIdsByProject[ws.id] || [];
                    const projectSessions = wsSessionOrder.length > 0
                      ? [...rawProjectSessions].sort((a, b) => {
                          const idxA = wsSessionOrder.indexOf(a.id);
                          const idxB = wsSessionOrder.indexOf(b.id);
                          if (idxA === -1 && idxB === -1) return 0;
                          if (idxA === -1) return 1;
                          if (idxB === -1) return -1;
                          return idxA - idxB;
                        })
                      : rawProjectSessions;

                    return (
                      <div key={ws.id} className="space-y-1">
                        {/* Project Folder Row (Father Node) */}
                        <div
                          onClick={(e) => {
                            openWorkspaceTab(ws.id);
                            handleSelectProject(ws);
                            setActiveFatherTabId(ws.id);
                            toggleProjectExpand(ws.id, e);
                          }}
                          className={`group flex items-center justify-between px-2.5 py-2 rounded-lg border transition cursor-pointer ${
                            isActive
                              ? 'bg-brand/5 border-brand/30 text-brand-light font-semibold'
                              : 'bg-surface-2/20 border-transparent hover:bg-surface-2/40 text-zinc-300'
                          }`}
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <button
                              onClick={(e) => toggleProjectExpand(ws.id, e)}
                              className="p-0.5 hover:bg-surface-3 rounded text-zinc-500 transition cursor-pointer"
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                            <Folder size={14} className={isActive ? 'text-brand-light' : 'text-zinc-500'} />
                            <span className="text-xs font-mono font-medium truncate">{ws.name}</span>
                          </div>
                          
                          {/* Action buttons next to project name on hover */}
                          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={(e) => openNewSessionModal(ws, e)}
                              title="Spawn Terminal Session"
                              className="p-1 hover:text-brand-light text-zinc-500 rounded cursor-pointer"
                            >
                              <PlusCircle size={13} />
                            </button>
                            {ws.id !== 'project_default' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteProject(ws.id);
                                }}
                                title="Delete Project"
                                className="p-1 hover:text-error text-zinc-500 rounded cursor-pointer"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Nested Child Nodes (PTY Sessions) */}
                        {isExpanded && (
                          <div className="pl-6 space-y-1 border-l border-surface-3/30 ml-4 py-0.5">
                            {projectSessions.map((session) => (
                              <div
                                key={session.id}
                                onClick={() => handleSelectSession(ws, session.id)}
                                className={`group flex items-center justify-between p-1.5 rounded transition cursor-pointer border text-[11px] ${
                                  activeSessionId === session.id
                                    ? 'bg-brand/10 border-brand/20 text-brand-light font-medium'
                                    : 'bg-surface-2/10 border-transparent hover:bg-surface-2 text-zinc-400 hover:text-zinc-200'
                                }`}
                              >
                                <div className="flex items-center space-x-2 truncate min-w-0 flex-1 mr-1">
                                  <AgentIcon name={session.agentType} size={20} selected={activeSessionId === session.id} />
                                  {editingSessionId === session.id ? (
                                    <input
                                      type="text"
                                      autoFocus
                                      value={editingSessionName}
                                      onChange={(e) => setEditingSessionName(e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.stopPropagation();
                                          if (editingSessionName.trim()) {
                                            void useWorkspaceStore.getState().updateSessionName(session.id, editingSessionName.trim());
                                          }
                                          setEditingSessionId(null);
                                        } else if (e.key === 'Escape') {
                                          e.stopPropagation();
                                          setEditingSessionId(null);
                                        }
                                      }}
                                      onBlur={() => {
                                        if (editingSessionName.trim()) {
                                          void useWorkspaceStore.getState().updateSessionName(session.id, editingSessionName.trim());
                                        }
                                        setEditingSessionId(null);
                                      }}
                                      className="bg-black/60 border border-brand/50 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none w-full font-mono"
                                    />
                                  ) : (
                                    <div className="truncate font-mono flex items-center gap-1.5" title={session.name || session.agentType}>
                                      <span className="truncate">{session.name || session.agentType}</span>
                                      <span className="text-[9px] text-zinc-650 shrink-0">({session.id.substring(8, 14)})</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center space-x-1 shrink-0">
                                  {editingSessionId !== session.id && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingSessionId(session.id);
                                        setEditingSessionName(session.name || session.agentType);
                                      }}
                                      className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-zinc-700/50 hover:text-zinc-200 text-zinc-500 rounded transition cursor-pointer"
                                      title="Rename session"
                                    >
                                      <Pencil size={11} />
                                    </button>
                                  )}
                                  {pendingDeleteSessionId === session.id ? (
                                    <span className="flex items-center gap-1 text-[9px] text-rose-300">
                                      Delete?
                                      <button onClick={(e) => { e.stopPropagation(); void handleDeleteSession(session.id, true); }} className="text-rose-400">✓</button>
                                      <button onClick={(e) => { e.stopPropagation(); setPendingDeleteSessionId(null); }} className="text-zinc-500">×</button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); void handleDeleteSession(session.id); }}
                                      className="p-0.5 hover:bg-error/25 hover:text-error text-zinc-550 rounded transition cursor-pointer"
                                      title="Delete session"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}

                            {/* Inline button to spawn new session if list is empty */}
                            {projectSessions.length === 0 && (
                              <button
                                onClick={(e) => openNewSessionModal(ws, e)}
                                className="w-full flex items-center justify-center space-x-1 py-1.5 rounded border border-dashed border-surface-3/50 text-[10px] text-zinc-500 hover:text-zinc-350 hover:bg-surface-2/20 transition cursor-pointer font-mono"
                              >
                                <Plus size={10} />
                                <span>Create Session</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
        )}

        {/* Left Resizer Handle Divider (Only when Pinned in layout) */}
        {isLeftPanelPinned && (
          <div
            onMouseDown={handleLeftResizeStart}
            className="w-1.5 hover:w-2 cursor-col-resize bg-surface-2/40 hover:bg-brand/60 transition-all z-20 shrink-0 select-none"
            title="Drag to resize Left Panel"
          />
        )}

        {/* Center Panel (Swappable Workbench) */}
        <div className="flex-grow flex flex-col min-w-0 bg-surface">
          {/* Level 1: Father Tabs (Projects/Workspaces list + Settings Tab) */}
          <div className="shrink-0 flex items-center justify-between border-b border-surface-2 bg-surface-2/20 select-none">
            <div className="flex items-center overflow-x-auto min-w-0 flex-1 scrollbar-none">
              {/* Auto-Hide / Fix Sidebar Button */}
              <button
                onClick={() => {
                  toggleLeftPanelPin();
                  setIsLeftPanelHovered(false);
                }}
                onMouseEnter={() => {
                  if (!isLeftPanelPinned) {
                    setIsLeftPanelHovered(true);
                  }
                }}
                className={`flex items-center justify-center px-3 py-3 border-r border-surface-2 hover:bg-surface-2/15 transition cursor-pointer shrink-0 ${
                  isLeftPanelPinned ? 'bg-surface-1/40 text-brand-light' : 'text-zinc-500 hover:text-zinc-200'
                }`}
                title={
                  isLeftPanelPinned
                    ? "Project Tree is fixed in layout. Click to enable Auto-Hide (Unpin)"
                    : "Auto-Hide is active (Hover left edge to pop out). Click to fix Project Tree in layout (Pin)"
                }
              >
                <Pin size={13} className={isLeftPanelPinned ? 'rotate-45 text-brand-light' : 'text-zinc-500'} />
              </button>

              {/* Settings button on the far left of Level 1 */}
              <button
                onClick={() => {
                  if (activeFatherTabId === 'settings') {
                    setActiveFatherTabId(activeWorkspace?.id || '');
                  } else {
                    setActiveFatherTabId('settings');
                  }
                }}
                className={`flex items-center justify-center px-3 py-3 border-r border-surface-2 hover:bg-surface-2/15 transition cursor-pointer text-zinc-500 hover:text-zinc-200 shrink-0 ${
                  activeFatherTabId === 'settings' ? 'bg-surface-1/40 text-brand-light' : ''
                }`}
                title={activeFatherTabId === 'settings' ? "Close Settings" : "Open Settings"}
              >
                <Settings size={13} />
              </button>

              {/* Project tabs */}
              {openWorkspaces.map((ws, index) => {
                const isActive = activeFatherTabId === ws.id;
                return (
                  <div
                    key={ws.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggedProjectTabIndex(index);
                      e.dataTransfer.setData('text/plain', index.toString());
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromIndex =
                        draggedProjectTabIndex !== null
                          ? draggedProjectTabIndex
                          : parseInt(e.dataTransfer.getData('text/plain'), 10);
                      if (!isNaN(fromIndex)) {
                        reorderWorkspaceTabs(fromIndex, index);
                      }
                      setDraggedProjectTabIndex(null);
                    }}
                    onDragEnd={() => setDraggedProjectTabIndex(null)}
                    className={`group relative flex items-center border-b-2 transition shrink-0 cursor-grab active:cursor-grabbing ${
                      isActive
                        ? 'border-brand text-brand-light bg-surface-1/40 font-bold'
                        : 'border-transparent text-zinc-500 hover:text-zinc-350 hover:bg-surface-2/5 font-semibold'
                    }`}
                  >
                    <button
                      onClick={() => {
                        handleSelectProject(ws);
                        setActiveFatherTabId(ws.id);
                      }}
                      className="flex items-center space-x-1.5 pl-3.5 pr-1.5 py-2.5 text-xs cursor-pointer"
                    >
                      <Folder size={12} className={isActive ? 'text-brand-light drop-shadow-[0_0_6px_rgba(249,115,22,0.4)]' : 'text-zinc-650'} />
                      <span>{ws.name}</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const remaining = openWorkspaces.filter((w) => w.id !== ws.id);
                        closeWorkspaceTab(ws.id);
                        if (activeFatherTabId === ws.id) {
                          if (remaining.length > 0) {
                            handleSelectProject(remaining[0]);
                            setActiveFatherTabId(remaining[0].id);
                          } else {
                            setWorkspace(null);
                            setActiveFatherTabId('');
                          }
                        }
                      }}
                      className="pr-2.5 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-450 transition cursor-pointer"
                      title={`Close ${ws.name} tab`}
                    >
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Right Panel Pin / Auto-Hide Switch on Far Right of Level 1 */}
            <button
              onClick={() => {
                toggleRightPanelPin();
                setIsRightPanelHovered(false);
              }}
              onMouseEnter={() => {
                if (!isRightPanelPinned) {
                  setIsRightPanelHovered(true);
                }
              }}
              className={`flex items-center justify-center px-3 py-3 border-l border-surface-2 hover:bg-surface-2/15 transition cursor-pointer shrink-0 ${
                isRightPanelPinned ? 'bg-surface-1/40 text-brand-light' : 'text-zinc-500 hover:text-zinc-200'
              }`}
              title={
                isRightPanelPinned
                  ? "Multi-Menu Panel is fixed in layout. Click to enable Auto-Hide (Unpin)"
                  : "Auto-Hide is active (Hover right edge to pop out). Click to fix Multi-Menu Panel in layout (Pin)"
              }
            >
              <Pin size={13} className={isRightPanelPinned ? 'rotate-45 text-brand-light' : 'text-zinc-500'} />
            </button>
          </div>

          {activeFatherTabId === 'settings' && (
            /* Render full page Settings Dashboard */
            <div className="flex-grow min-h-0 bg-[#0a0a0a] overflow-hidden">
              <SettingsPanel />
            </div>
          )}

          {/* Render Workspace Content (preserved in DOM via hidden class to retain xterm session buffers) */}
          <div className={activeFatherTabId === 'settings' ? 'hidden' : 'flex flex-col flex-1 min-h-0 overflow-hidden'}>
              {/* Level 2: Child Tabs (sessions and open files on a single split header row) */}
              <div className="shrink-0 flex items-center border-b border-surface-2 bg-[#171717] select-none min-w-0">
                {/* Left Part: Session Tabs & Controls (aligned with left PTY pane width when pinned) */}
                <div
                  style={{
                    width: isSessionPinned && activeFileTab !== null ? `${pinnedSessionWidthPercent}%` : 'auto'
                  }}
                  className={`flex items-center justify-between px-3 py-1.5 border-r border-surface-2 bg-surface-1 shrink-0 min-w-0 ${
                    activeFileTab === null ? 'flex-1' : ''
                  }`}
                >
                  <div className="flex-1 flex items-center space-x-2 overflow-x-auto min-w-0 mr-2 scrollbar-none">
                    <span title="Active Terminal Sessions"><SquareTerminal size={14} className="text-brand-light shrink-0" /></span>
                    {sessionDeleteError && <span className="text-[9px] text-rose-400 truncate" title={sessionDeleteError}>{sessionDeleteError}</span>}
                    {activeProjectSessions.map((session, index) => {
                      const isSelected = activeSessionId === session.id;
                      return (
                        <div
                          key={session.id}
                          draggable
                          onDragStart={(e) => {
                            setDraggedSessionTabIndex(index);
                            e.dataTransfer.setData('text/plain', index.toString());
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const fromIndex =
                              draggedSessionTabIndex !== null
                                ? draggedSessionTabIndex
                                : parseInt(e.dataTransfer.getData('text/plain'), 10);
                            if (!isNaN(fromIndex) && activeWorkspace) {
                              reorderSessionTabs(activeWorkspace.id, fromIndex, index);
                            }
                            setDraggedSessionTabIndex(null);
                          }}
                          onDragEnd={() => setDraggedSessionTabIndex(null)}
                          className={`group flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono border transition shrink-0 cursor-grab active:cursor-grabbing ${
                            isSelected
                              ? 'bg-brand/10 border-brand/40 text-brand-light font-bold shadow-sm'
                              : 'bg-surface-3/30 border-surface-3 text-zinc-450 hover:text-zinc-200'
                          }`}
                        >
                          <button
                            onClick={() => handleSelectSession(activeWorkspace, session.id)}
                            className="flex items-center space-x-1.5 cursor-pointer py-0.5"
                          >
                            <AgentIcon
                              name={session.agentType}
                              size={16}
                              selected={isSelected}
                              className="cursor-grab active:cursor-grabbing group-hover:scale-105"
                            />
                            <span>{session.name || session.agentType}</span>
                            <span className="text-[8px] text-zinc-500 font-normal">({session.id.substring(8, 12)})</span>
                          </button>
                          {pendingDeleteSessionId === session.id ? (
                            <span className="flex items-center gap-1 text-[9px] text-rose-300">
                              <button type="button" onClick={(e) => { e.stopPropagation(); void handleDeleteSession(session.id, true); }} className="text-rose-400">✓</button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setPendingDeleteSessionId(null); }} className="text-zinc-500">×</button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); void handleDeleteSession(session.id); }}
                              className="p-0.5 hover:bg-red-500/20 hover:text-red-400 text-zinc-550 rounded transition cursor-pointer"
                              title="Delete Session"
                            >
                              <X size={10} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    
                    {/* Spawn Session Trigger Button */}
                    {activeWorkspace && (
                      <button
                        onClick={(e) => openNewSessionModal(activeWorkspace, e)}
                        title="Spawn Session"
                        className="flex items-center justify-center p-1 bg-surface-3 border border-surface-3 rounded hover:bg-surface-2 hover:text-brand-light text-zinc-400 transition cursor-pointer shrink-0"
                      >
                        <Plus size={11} />
                      </button>
                    )}
                  </div>

                  {/* Right Side Controls of Left Part */}
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      onClick={toggleSessionPin}
                      className={`p-1 rounded border transition cursor-pointer text-xs ${
                        isSessionPinned
                          ? 'bg-brand/20 border-brand/50 text-brand-light font-semibold'
                          : 'bg-surface-3/50 border-surface-3 text-zinc-400 hover:text-zinc-200'
                      }`}
                      title={isSessionPinned ? "Unpin Terminal Sessions from Left Side" : "Pin Terminal Sessions to Left Side"}
                    >
                      <Pin size={11} className={isSessionPinned ? 'rotate-45 text-brand-light' : ''} />
                    </button>

                    {canSplitActiveShell && (
                      <div className="flex items-center rounded border border-surface-3 bg-surface-2/80 overflow-hidden">
                        <LayoutGrid size={11} className="text-brand-light mx-1.5" />
                        <button
                          onClick={() => void handleShellSplit('right')}
                          className="px-1.5 py-0.5 border-l border-surface-3 text-zinc-300 hover:text-white text-[10px] font-mono cursor-pointer transition"
                          title="Split shell right with tmux (navigate panes with Ctrl+B then arrow)"
                        >
                          Split →
                        </button>
                        <button
                          onClick={() => void handleShellSplit('down')}
                          className="px-1.5 py-0.5 border-l border-surface-3 text-zinc-300 hover:text-white text-[10px] font-mono cursor-pointer transition"
                          title="Split shell down with tmux (navigate panes with Ctrl+B then arrow)"
                        >
                          Split ↓
                        </button>
                      </div>
                    )}
                    {shellSplitError && (
                      <span className="max-w-40 truncate text-[9px] text-rose-400" title={shellSplitError}>
                        {shellSplitError}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Part: Opened File Tabs (aligned over the right file window when pinned) */}
                {openFiles.length > 0 && (
                  <div className="flex-1 flex items-center justify-between overflow-x-auto scrollbar-none min-w-0 pr-2">
                    <div className="flex items-center overflow-x-auto scrollbar-none min-w-0 flex-1">
                      {openFiles.map((f, index) => {
                        const isGitDiff = f.path.startsWith('git-diff:');
                        const displayName = isGitDiff ? `Diff: ${f.name}` : f.name;
                        const isActive = activeFileTab === f.path;
                        return (
                          <div
                            key={f.path}
                            draggable
                            onDragStart={(e) => {
                              setDraggedFileTabIndex(index);
                              e.dataTransfer.setData('text/plain', index.toString());
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              const fromIndex =
                                draggedFileTabIndex !== null
                                  ? draggedFileTabIndex
                                  : parseInt(e.dataTransfer.getData('text/plain'), 10);
                              if (!isNaN(fromIndex)) {
                                reorderOpenFiles(fromIndex, index);
                              }
                              setDraggedFileTabIndex(null);
                            }}
                            onDragEnd={() => setDraggedFileTabIndex(null)}
                            className={`flex items-center space-x-1 border-r border-surface-2 border-b-2 transition shrink-0 cursor-grab active:cursor-grabbing ${
                              isActive
                                ? 'border-brand text-zinc-100 bg-surface/40'
                                : 'border-transparent text-zinc-550 hover:text-zinc-350 hover:bg-surface-2/10'
                            }`}
                          >
                            <button
                              onClick={() => setActiveFileTab(f.path)}
                              className="px-3 py-2 text-xs font-mono font-medium truncate max-w-[160px]"
                              title={displayName}
                            >
                              {displayName}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                closeFile(f.path);
                              }}
                              className="pr-2.5 text-zinc-650 hover:text-rose-450 transition cursor-pointer"
                              title="Close file"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {activeFileTab !== null && (
                      <button
                        onClick={() => setActiveFileTab(null)}
                        className="ml-2 px-2 py-1 text-zinc-500 hover:text-zinc-200 hover:bg-surface-2/40 rounded transition shrink-0 flex items-center gap-1 text-xs select-none"
                        title="Hide/close file preview window (keep files open)"
                      >
                        <EyeOff size={13} />
                        <span className="text-[10px]">Hide Preview</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Tab content area */}
              <div className="relative flex-grow min-h-0 overflow-hidden flex">
                {/* Terminal Sessions View */}
                <div
                  style={{
                    width: activeFileTab === null ? '100%' : isSessionPinned ? `${pinnedSessionWidthPercent}%` : '0%'
                  }}
                  className={`flex flex-col bg-[#0a0a0a] overflow-hidden transition-all ${
                    activeFileTab === null
                      ? 'w-full h-full'
                      : isSessionPinned
                      ? 'h-full shrink-0'
                      : 'hidden'
                  }`}
                >
                  {/* Terminal Grid */}
                  <div className="flex-grow min-h-0 p-0 bg-[#0a0a0a] overflow-hidden">
                    <TerminalGrid />
                  </div>
                </div>

                {/* Resizer Handle between Pinned Terminal and File Preview */}
                {activeFileTab !== null && isSessionPinned && (
                  <div
                    onMouseDown={handleCenterSplitResizeStart}
                    className="w-1.5 hover:w-1.5 cursor-col-resize bg-surface-2/40 hover:bg-brand/60 transition-all z-20 shrink-0 select-none"
                    title="Drag to resize Terminal / File Preview split"
                  />
                )}

                {/* Active File Preview / Diff View Container */}
                {activeFileTab !== null && (
                  <div
                    style={{
                      width: isSessionPinned ? `${100 - pinnedSessionWidthPercent}%` : '100%'
                    }}
                    className="relative h-full min-w-0 bg-[#0a0a0a] overflow-hidden flex-1"
                  >
                    {openFiles.map((f) => {
                      const isVisible = activeFileTab === f.path;
                      return (
                        <div
                          key={f.path}
                          className={isVisible ? 'w-full h-full' : 'hidden'}
                          aria-hidden={!isVisible}
                        >
                          {f.path.startsWith('git-diff:') ? (
                            <GitDiffCompare tabPath={f.path} isVisible={isVisible} />
                          ) : (
                            <FilePreview filePath={f.path} isVisible={isVisible} />
                          )}
                        </div>
                      );
                    })}
                    {activeFileTab && !openFiles.some((f) => f.path === activeFileTab) && (
                      <div className="w-full h-full">
                        {activeFileTab.startsWith('git-diff:') ? (
                          <GitDiffCompare tabPath={activeFileTab} isVisible={true} />
                        ) : (
                          <FilePreview filePath={activeFileTab} isVisible={true} />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
        </div>

        {/* Right Resizer Handle Divider (Only when Pinned) */}
        {isRightPanelPinned && (
          <div
            onMouseDown={handleRightResizeStart}
            className="w-1.5 hover:w-1.5 cursor-col-resize bg-surface-2/40 hover:bg-brand/60 transition-all z-20 shrink-0 select-none"
            title="Drag to resize Right Inspector Panel"
          />
        )}

        {/* Right Edge Hover Trigger Zone (Active in Auto-Hide mode when panel is closed) */}
        {!isRightPanelPinned && !isRightPanelHovered && (
          <div
            onMouseEnter={() => setIsRightPanelHovered(true)}
            className="absolute right-0 top-0 bottom-0 w-2.5 z-30 cursor-pointer bg-transparent hover:bg-brand/30 transition-colors"
            title="Hover to show Multi-Menu Panel"
          />
        )}

        {/* Right Panel (Inspector tabs) - Rendered when Pinned or Hovered */}
        {(isRightPanelPinned || isRightPanelHovered) && (
          <div
            style={{ width: `${rightPanelWidth}px` }}
            onMouseLeave={() => {
              if (!isRightPanelPinned) {
                setIsRightPanelHovered(false);
              }
            }}
            className={`bg-surface-1 flex flex-col select-none overflow-hidden font-sans transition-all border-l border-surface-2 ${
              isRightPanelPinned
                ? 'shrink-0 z-10'
                : 'absolute right-0 top-0 bottom-0 z-40 shadow-2xl animate-in slide-in-from-right-2 duration-150'
            }`}
          >
            {/* Floating Resizer Handle on Left Edge when Unpinned */}
            {!isRightPanelPinned && (
              <div
                onMouseDown={handleRightResizeStart}
                className="absolute left-0 top-0 bottom-0 w-1.5 hover:w-2 cursor-col-resize bg-transparent hover:bg-brand/60 transition-all z-50 select-none"
                title="Drag to resize Right Inspector Panel"
              />
            )}
            {/* Swappable Panel Tabs */}
            <div className="shrink-0 flex border-b border-surface-2 select-none bg-surface-1/40 items-center">
              <button
                onClick={() => setActiveRightPanel('files')}
                className={`flex-1 flex items-center justify-center space-x-1.5 py-2.5 text-xs font-semibold border-b-2 transition ${
                  activeRightPanel === 'files'
                    ? 'border-brand text-zinc-100 bg-surface/30'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Folder size={13} />
                <span>Files</span>
              </button>
              <button
                onClick={() => setActiveRightPanel('git')}
                className={`flex-1 flex items-center justify-center space-x-1.5 py-2.5 text-xs font-semibold border-b-2 transition ${
                  activeRightPanel === 'git'
                    ? 'border-brand text-zinc-100 bg-surface/30'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <GitBranch size={13} />
                <span>Git</span>
              </button>
              <button
                onClick={() => setActiveRightPanel('search')}
                className={`flex-1 flex items-center justify-center space-x-1.5 py-2.5 text-xs font-semibold border-b-2 transition ${
                  activeRightPanel === 'search'
                    ? 'border-brand text-zinc-100 bg-surface/30'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Search size={13} />
                <span>Search</span>
              </button>
              <button
                onClick={() => setActiveRightPanel('skills')}
                className={`flex-1 flex items-center justify-center space-x-1.5 py-2.5 text-xs font-semibold border-b-2 transition ${
                  activeRightPanel === 'skills'
                    ? 'border-brand text-zinc-100 bg-surface/30'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Sparkles size={13} />
                <span>Skills</span>
              </button>
              <button
                onClick={() => setActiveRightPanel('browser')}
                className={`flex-1 flex items-center justify-center space-x-1.5 py-2.5 text-xs font-semibold border-b-2 transition ${
                  activeRightPanel === 'browser'
                    ? 'border-brand text-zinc-100 bg-surface/30'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Globe size={13} />
                <span>Browser</span>
              </button>
              
              {/* Pin / Unpin Button */}
              <button
                type="button"
                onClick={() => {
                  toggleRightPanelPin();
                  setIsRightPanelHovered(false);
                }}
                className={`px-2.5 text-zinc-500 hover:text-zinc-200 transition cursor-pointer ${
                  isRightPanelPinned ? 'text-brand-light' : ''
                }`}
                title={
                  isRightPanelPinned
                    ? "Multi-Menu Panel is fixed in layout. Click to enable Auto-Hide (Unpin)"
                    : "Auto-Hide is active (Hover right edge to pop out). Click to fix Multi-Menu Panel in layout (Pin)"
                }
              >
                <Pin size={12} className={isRightPanelPinned ? 'rotate-45 text-brand-light' : 'text-zinc-500'} />
              </button>

              {!isRightPanelPinned && (
                <button
                  onClick={() => setIsRightPanelHovered(false)}
                  className="pr-3 text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
                  title="Close Panel"
                >
                  <Minimize2 size={13} />
                </button>
              )}
            </div>

            {/* Tab content area */}
            <div className="flex-grow overflow-y-auto p-4 min-h-0 bg-surface-1/60 font-sans">
              {activeRightPanel === 'files' ? (
                <div className="h-full flex flex-col">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2 font-mono">Workspace Files</h3>
                  <div className="flex-grow overflow-y-auto">
                    <FileTree
                      key={activeWorkspace?.path || workspacePath}
                      rootPath={activeWorkspace?.path || workspacePath}
                    />
                  </div>
                </div>
              ) : activeRightPanel === 'git' ? (
                <GitPanel key={activeWorkspace?.path || workspacePath} />
              ) : activeRightPanel === 'skills' ? (
                <SkillsPanel />
              ) : activeRightPanel === 'browser' ? (
                <BrowserPanel />
              ) : activeRightPanel !== 'search' ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 font-mono text-[10px]">
                  <Sparkles size={20} className="mb-1.5 text-zinc-650" />
                  <span>Select a tab above</span>
                </div>
              ) : null}
              <div className={activeRightPanel === 'search' ? 'h-full' : 'hidden'}>
                <SearchPanel key={activeWorkspace?.path || workspacePath} />
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Spawn New Session Modal Dialog Overlay */}
      {showNewSessionModal && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface border border-surface-3 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 font-sans">
            {/* Modal Header */}
            <div className="bg-surface-1 px-4 py-3 border-b border-surface-2 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-brand-light">
                <PlayCircle size={16} />
                <span className="text-xs font-bold font-mono uppercase tracking-wider">Spawn New Session</span>
              </div>
              <button
                onClick={() => setShowNewSessionModal(false)}
                className="text-zinc-500 hover:text-zinc-355 transition p-1 rounded hover:bg-surface-2 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {/* Tab selector */}
            <div className="flex border-b border-surface-3 bg-surface-1 text-xs">
              <button
                type="button"
                onClick={() => setSessionType('local')}
                className={`flex-1 py-2 text-center font-mono font-bold border-b-2 transition cursor-pointer ${
                  sessionType === 'local'
                    ? 'border-brand text-brand-light bg-surface'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                LOCAL SESSION
              </button>
              <button
                type="button"
                onClick={() => setSessionType('ssh')}
                className={`flex-1 py-2 text-center font-mono font-bold border-b-2 transition cursor-pointer ${
                  sessionType === 'ssh'
                    ? 'border-brand text-brand-light bg-surface'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                REMOTE SSH SESSION
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs">
              <div className="bg-surface-2/40 p-3 rounded-lg border border-surface-3/50 text-[11px] text-zinc-400 font-mono space-y-1">
                <p>Project: <span className="text-brand-light font-bold">{modalTargetProject?.name}</span></p>
                <p className="truncate">Directory: <span className="text-zinc-300">{modalTargetProject?.path}</span></p>
              </div>

              {sessionType === 'local' ? (
                <div className="space-y-3">
                  <div>
                    <div className="flex space-x-2">
                      <div className="flex-grow">
                        <label className="block text-zinc-400 font-mono text-[10px] mb-1 font-semibold">AGENT CLI COMMAND / SHELL</label>
                        <input
                          type="text"
                          value={cmdInput}
                          onChange={(e) => setCmdInput(e.target.value)}
                          className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-zinc-250 focus:outline-none focus:border-brand/70 font-mono"
                        />
                      </div>
                      {detectedClis.length > 0 && (
                        <div className="w-32">
                          <label className="block text-zinc-400 font-mono text-[10px] mb-1 font-semibold">PRESETS</label>
                          <select
                            value={detectedClis.includes(cmdInput) ? cmdInput : ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val) {
                                setCmdInput(val);
                                const lower = val.toLowerCase();
                                if (lower.includes('claude')) {
                                  setSpawnProvider('anthropic');
                                } else if (lower.includes('aider')) {
                                  setSpawnProvider('openai');
                                } else {
                                  setSpawnProvider('none');
                                }
                              }
                            }}
                            className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-zinc-250 focus:outline-none focus:border-brand/70 font-mono cursor-pointer text-xs"
                          >
                            <option value="">-- Select --</option>
                            {detectedClis.map(cli => (
                              <option key={cli} value={cli}>{cli}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {detectedClis.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="text-[9px] text-zinc-500 font-mono self-center mr-1">Detected CLIs:</span>
                        {detectedClis.map(cli => {
                          const isSelected = cmdInput === cli;
                          return (
                            <button
                              key={cli}
                              type="button"
                              onClick={() => {
                                setCmdInput(cli);
                                const lower = cli.toLowerCase();
                                if (lower.includes('claude')) {
                                  setSpawnProvider('anthropic');
                                } else if (lower.includes('aider')) {
                                  setSpawnProvider('openai');
                                } else {
                                  setSpawnProvider('none');
                                }
                              }}
                              className={`text-[9px] font-mono px-2 py-0.5 rounded border transition cursor-pointer ${
                                isSelected
                                  ? 'bg-brand/20 border-brand/50 text-brand-light font-bold'
                                  : 'bg-surface-3/50 border-surface-3 text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              {cli}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-zinc-400 font-mono text-[10px] mb-1 font-semibold">ARGS</label>
                      <input
                        type="text"
                        value={argsInput}
                        onChange={(e) => setArgsInput(e.target.value)}
                        placeholder="e.g. -l"
                        className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-zinc-250 focus:outline-none focus:border-brand/70 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-400 font-mono text-[10px] mb-1 font-semibold">PROVIDER</label>
                      <select
                        value={spawnProvider}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSpawnProvider(val);
                          if (val === 'anthropic') {
                            setCmdInput('claude');
                          } else if (val === 'openai') {
                            setCmdInput('aider');
                          } else if (val === 'none') {
                            setCmdInput('/bin/zsh');
                          }
                        }}
                        className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-zinc-250 focus:outline-none focus:border-brand/70 font-mono cursor-pointer"
                      >
                        <option value="none">None (Shell)</option>
                        <option value="anthropic">Anthropic (Claude)</option>
                        <option value="openai">OpenAI (Aider)</option>
                        <option value="gemini">Google Gemini</option>
                        <option value="deepseek">DeepSeek API</option>
                      </select>
                    </div>
                  </div>

                  {/* Resume past conversation */}
                  <div className="space-y-2">
                    <label className="block text-zinc-400 font-mono text-[10px] mb-1 font-bold">RESUME PAST CONVERSATION</label>
                    <select
                      value={resumeSessionId}
                      onChange={(e) => {
                        setResumeSessionId(e.target.value);
                        if (e.target.value) setManualResumeSessionId('');
                      }}
                      className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-zinc-250 focus:outline-none focus:border-brand/70 font-mono cursor-pointer"
                    >
                      <option value="">Start Fresh / Enter ID Below</option>
                      {getFilteredPastSessions(modalTargetProject?.path || '').map(s => (
                        <option key={s.id} value={s.id}>
                          {s.agent_type} - {s.remote_session_id?.substring(0, 8)}...
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={manualResumeSessionId}
                      onChange={(e) => {
                        setManualResumeSessionId(e.target.value);
                        if (e.target.value) setResumeSessionId('');
                      }}
                      placeholder="Provider session / conversation ID (optional)"
                      className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-zinc-250 placeholder:text-zinc-600 focus:outline-none focus:border-brand/70 font-mono"
                    />
                    <p className="text-[9px] text-zinc-500 font-mono">
                      Select a saved TDE session to reopen it, or enter a provider ID to start a resumed agent session.
                    </p>
                  </div>

                  {/* Privileged Mode Checkbox */}
                  <div className="flex items-center space-x-2 pt-1.5">
                    <input
                      type="checkbox"
                      id="privilegedMode"
                      checked={privileged}
                      onChange={(e) => setPrivileged(e.target.checked)}
                      className="accent-brand rounded border-surface-3 bg-surface-2 h-3.5 w-3.5 cursor-pointer"
                    />
                    <label htmlFor="privilegedMode" className="text-zinc-400 font-mono text-[10px] select-none cursor-pointer font-semibold uppercase tracking-wider">
                      Privileged Mode (Skip agent prompts)
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-zinc-400 font-mono text-[10px] mb-1 font-semibold">SELECT SSH HOST FROM CONFIG</label>
                    <select
                      value={sshHostSelect}
                      onChange={(e) => setSshHostSelect(e.target.value)}
                      className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-zinc-250 focus:outline-none focus:border-brand/70 font-mono cursor-pointer"
                    >
                      {sshConfigHosts.map(host => (
                        <option key={host} value={host}>{host}</option>
                      ))}
                      <option value="manual">-- Manual Input / Custom Host --</option>
                    </select>
                  </div>

                  {sshHostSelect === 'manual' && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
                      <div>
                        <label className="block text-zinc-400 font-mono text-[10px] mb-1 font-semibold">HOST / IP ADDRESS</label>
                        <input
                          type="text"
                          value={sshHostManual}
                          onChange={(e) => setSshHostManual(e.target.value)}
                          placeholder="e.g. 192.168.1.100"
                          className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-zinc-250 focus:outline-none focus:border-brand/70 font-mono"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-zinc-400 font-mono text-[10px] mb-1 font-semibold">USERNAME (OPTIONAL)</label>
                          <input
                            type="text"
                            value={sshUser}
                            onChange={(e) => setSshUser(e.target.value)}
                            placeholder="e.g. ubuntu"
                            className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-zinc-250 focus:outline-none focus:border-brand/70 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-zinc-400 font-mono text-[10px] mb-1 font-semibold">PORT (OPTIONAL)</label>
                          <input
                            type="text"
                            value={sshPort}
                            onChange={(e) => setSshPort(e.target.value)}
                            placeholder="e.g. 22"
                            className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-zinc-250 focus:outline-none focus:border-brand/70 font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-surface-1 px-4 py-3 border-t border-surface-2 flex items-center gap-2.5">
              {spawnSessionError && (
                <p className="mr-auto text-[10px] font-mono text-red-400" role="alert">
                  Failed to spawn: {spawnSessionError}
                </p>
              )}
              <button
                onClick={() => setShowNewSessionModal(false)}
                disabled={isSpawningSession}
                className="bg-surface-3 text-zinc-400 font-semibold px-3.5 py-1.5 rounded text-xs hover:bg-surface-2 cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSession}
                disabled={isSpawningSession}
                className="bg-brand text-white font-semibold px-4 py-1.5 rounded text-xs hover:bg-brand/90 cursor-pointer transition disabled:opacity-60 disabled:cursor-wait"
              >
                {isSpawningSession ? 'Spawning…' : 'Spawn Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Status Bar */}
      <div className="h-6 bg-surface-2 border-t border-surface-3 px-3 flex items-center justify-between text-[10px] text-zinc-500 font-mono select-none shrink-0">
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1.5">
            <img src={brandIcon} alt="Logo" className="w-3.5 h-3.5 object-cover rounded-sm shrink-0" />
            <span>Workspace: <strong className="text-zinc-300">{activeWorkspace?.name || 'None'}</strong></span>
          </span>
          <span className="flex items-center space-x-1">
            <GitBranch size={10} className="text-brand-light" />
            <span>Branch: <strong className="text-zinc-300">{gitBranch}</strong></span>
          </span>
        </div>
        <div className="flex items-center space-x-4">
          {activeSessionId && (
            <span>Active Session: <strong className="text-brand-light">{activeSessionId}</strong></span>
          )}
          <span className="text-zinc-650">UTF-8</span>
        </div>
      </div>
    </div>
  );
}

export default App;
