import { useState, useEffect } from 'react';
import { getVisiblePaneCount, useWorkspaceStore } from './store/workspaceStore';
import { dedupeSessions } from './sessionUtils';
import { TerminalGrid } from './components/TerminalGrid';
import { SettingsPanel } from './components/SettingsPanel';
import { FileTree } from './components/FileTree';
import { FilePreview } from './components/FilePreview';
import { GitPanel } from './components/GitPanel';
import { GitDiffCompare } from './components/GitDiffCompare';
import { SearchPanel } from './components/SearchPanel';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { 
  Plus, 
  Trash2, 
  GitBranch, 
  Sparkles,
  Maximize2,
  Minimize2,
  Settings,
  Folder,
  X,
  SquareTerminal,
  ChevronDown,
  ChevronRight,
  PlusCircle,
  PlayCircle,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Search
} from 'lucide-react';

const getAgentIconClass = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.includes('claude')) return 'from-orange-500 to-amber-600';
  if (lower.includes('gemini')) return 'from-brand to-brand-light';
  if (lower.includes('codex')) return 'from-emerald-500 to-teal-600';
  if (lower.includes('aider')) return 'from-brand to-slate-500';
  return 'from-brand to-slate-600';
};

const getInitials = (name: string): string => {
  const clean = name.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
  const parts = clean.split(/[\s-]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (clean.length >= 2) {
    return clean.slice(0, 2).toUpperCase();
  }
  return clean.slice(0, 1).toUpperCase() || 'AG';
};

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
    paneLayout,
    setPaneLayoutType,
    setPaneSessionId,
    setActivePaneIndex,
    openFiles,
    activeFileTab,
    closeFile,
    setActiveFileTab,
    activeWorkspace,
    workspaces,
    setWorkspace,
    setWorkspaces
  } = useWorkspaceStore();

  const [isRightPaneExpanded, setIsRightPaneExpanded] = useState(true);
  const [isSettingsFatherTabOpen, setIsSettingsFatherTabOpen] = useState(false);
  const [activeFatherTabId, setActiveFatherTabId] = useState('');
  const [isLeftPanelVisible, setIsLeftPanelVisible] = useState(true);

  // Expanded/Collapsed state for projects in Left Panel
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({
    'project_default': true
  });

  // Modal Dialog spawner state
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [modalTargetProject, setModalTargetProject] = useState<any>(null);

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
  const [detectedClis, setDetectedClis] = useState<string[]>([]);
  const [privileged, setPrivileged] = useState(true);

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
    if (!newProjectPath.trim()) {
      alert('Please enter or select a directory path.');
      return;
    }
    const finalName = newProjectName.trim() || 'unnamed_project';
    const id = 'project_' + Math.random().toString(36).substring(2, 11);
    try {
      await invoke('create_workspace', {
        id,
        name: finalName,
        path: newProjectPath.trim()
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

    const unlistenPromise = listen('tde-event', (event: any) => {
      const payload = event.payload;
      if (payload.event_type === 'exit') {
        removeSession(payload.session_id);
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    if (activeFileTab) {
      setIsRightPaneExpanded(true);
      setActiveRightPanel('files');
    }
  }, [activeFileTab]);

  const handleCreateSession = async () => {
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
          alert('Please enter an SSH host or IP address.');
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
        resumeSessionId: null,
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

      setPaneSessionId(paneLayout.activePaneIndex, newSessionId);
      setResumeSessionId('');
      loadPastSessions();
      setShowNewSessionModal(false);
    } catch (error) {
      alert('Failed to spawn session: ' + error);
    }
  };

  const handleDeleteSession = async (id: string) => {
    try {
      const activeIds = await invoke<string[]>('list_active_session_ids');
      const isAlive = activeIds.includes(id);

      if (isAlive) {
        const confirmDelete = window.confirm(
          "This session is currently active/running. Are you sure you want to terminate and delete it?"
        );
        if (!confirmDelete) return;
      }

      await invoke('delete_session', { id });
      removeSession(id);

      const state = useWorkspaceStore.getState();
      if (state.activeSessionId === id) {
        state.setActiveSession(null);
      }

      loadPastSessions();
    } catch (error) {
      console.error('Failed to delete session:', error);
      removeSession(id);
    }
  };

  const handleSelectSession = (ws: any, sessionId: string) => {
    handleSelectProject(ws);
    setActiveFatherTabId(ws.id); // Ensure the project's father tab is active!
    
    // Read the updated state synchronously to avoid React closure batching issues
    const state = useWorkspaceStore.getState();
    const currentPaneLayout = state.paneLayout;

    setActiveSession(sessionId);
    setActiveFileTab(null); // Auto open the terminal sessions view!

    // Auto-focus this session in PTY split cell if not focused, considering only visible panes
    const visibleCount = getVisiblePaneCount(currentPaneLayout.type);
    const visiblePanes = currentPaneLayout.panes.slice(0, visibleCount);
    const isVisibleInPane = visiblePanes.some(p => p === sessionId);

    if (!isVisibleInPane) {
      // Find the first empty pane inside the visible range, or overwrite active pane if occupied
      const emptyIndex = visiblePanes.indexOf(null);
      const targetIndex = emptyIndex !== -1 ? emptyIndex : currentPaneLayout.activePaneIndex;
      const finalIndex = targetIndex < visibleCount ? targetIndex : 0;
      setPaneSessionId(finalIndex, sessionId);
      setActivePaneIndex(finalIndex);
    } else {
      // Focus the pane that already holds this session
      const paneIndex = visiblePanes.findIndex(p => p === sessionId);
      if (paneIndex !== -1) {
        setActivePaneIndex(paneIndex);
      }
    }
  };

  // Filters past sessions to target workspace path
  const getFilteredPastSessions = (projectPath: string) => {
    return pastSessions.filter(s => s.cwd === projectPath);
  };

  // Filter active sessions belonging to the active project path
  const activeProjectSessions = Object.values(sessions).filter(s => s.cwd === (activeWorkspace?.path || ''));

  return (
    <div className="flex h-screen w-screen bg-surface text-zinc-100 overflow-hidden font-sans flex-col select-none relative">
      
      {/* Main Container */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        
        {/* Left Sidebar Panel (Projects Tree Viewer) */}
        {isLeftPanelVisible && (
          <div className="w-80 shrink-0 border-r border-surface-2 bg-surface-1 flex flex-col select-none overflow-hidden font-sans">
          {/* Header */}
          <div className="p-4 border-b border-surface-2 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <img src={brandIcon} alt="Black TDE Logo" className="w-8 h-8 rounded object-cover" />
              <div>
                <h1 className="font-bold text-xs tracking-wider text-zinc-100 font-mono uppercase">TDE Cockpit</h1>
                <p className="text-[9px] text-zinc-500 font-mono">v1.2.0 (Crest Visuals)</p>
              </div>
            </div>
            <div className="flex items-center space-x-1 text-success text-[10px] font-semibold bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
              <span>Online</span>
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
                // Filter active sessions inside this project
                const projectSessions = Object.values(sessions).filter(s => s.cwd === ws.path);

                return (
                  <div key={ws.id} className="space-y-1">
                    {/* Project Folder Row (Father Node) */}
                    <div
                      onClick={(e) => {
                        handleSelectProject(ws);
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
                        <span className="text-xs truncate font-mono">{ws.name}</span>
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
                            className={`flex items-center justify-between p-1.5 rounded transition cursor-pointer border text-[11px] ${
                              activeSessionId === session.id
                                ? 'bg-brand/10 border-brand/20 text-brand-light font-medium'
                                : 'bg-surface-2/10 border-transparent hover:bg-surface-2 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            <div className="flex items-center space-x-2 truncate">
                              <div className={`flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-tr ${getAgentIconClass(session.agentType)} text-white font-extrabold text-[8px] shadow-sm select-none shrink-0`}>
                                {getInitials(session.agentType)}
                              </div>
                              <div className="truncate font-mono">
                                <span>{session.agentType}</span>
                                <span className="text-[9px] text-zinc-650 ml-1.5">({session.id.substring(8, 14)})</span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSession(session.id);
                              }}
                              className="p-0.5 hover:bg-error/25 hover:text-error text-zinc-550 rounded transition cursor-pointer"
                            >
                              <Trash2 size={11} />
                            </button>
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

        {/* Center Panel (Swappable Workbench) */}
        <div className="flex-grow flex flex-col min-w-0 bg-surface">
          {/* Level 1: Father Tabs (Projects/Workspaces list + Settings Tab) */}
          <div className="shrink-0 flex items-center border-b border-surface-2 bg-surface-2/20 overflow-x-auto select-none">
            {/* Toggle Sidebar Button */}
            <button
              onClick={() => setIsLeftPanelVisible(!isLeftPanelVisible)}
              className="flex items-center justify-center px-3 py-3 border-r border-surface-2 hover:bg-surface-2/15 transition cursor-pointer text-zinc-500 hover:text-zinc-200 shrink-0"
              title={isLeftPanelVisible ? "Hide Project Tree Panel" : "Show Project Tree Panel"}
            >
              {isLeftPanelVisible ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />}
            </button>

            {/* Settings button on the far left of Level 1 */}
            <button
              onClick={() => {
                setIsSettingsFatherTabOpen(true);
                setActiveFatherTabId('settings');
              }}
              className={`flex items-center justify-center px-3 py-3 border-r border-surface-2 hover:bg-surface-2/15 transition cursor-pointer text-zinc-500 hover:text-zinc-200 shrink-0 ${
                activeFatherTabId === 'settings' ? 'bg-surface-1/40 text-brand-light' : ''
              }`}
              title="Open Settings Tab"
            >
              <Settings size={13} />
            </button>

            {/* Project tabs */}
            {workspaces.map((ws) => {
              const isActive = activeFatherTabId === ws.id;
              return (
                <button
                  key={ws.id}
                  onClick={() => {
                    handleSelectProject(ws);
                    setActiveFatherTabId(ws.id);
                  }}
                  className={`flex items-center space-x-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition shrink-0 ${
                    isActive
                      ? 'border-brand text-brand-light bg-surface-1/40'
                      : 'border-transparent text-zinc-500 hover:text-zinc-350 hover:bg-surface-2/5'
                  }`}
                >
                  <Folder size={12} className={isActive ? 'text-brand-light' : 'text-zinc-650'} />
                  <span>{ws.name}</span>
                </button>
              );
            })}

            {/* Settings father tab (conditional) */}
            {isSettingsFatherTabOpen && (
              <div
                className={`flex items-center space-x-1 border-r border-surface-2 border-b-2 transition shrink-0 ${
                  activeFatherTabId === 'settings'
                    ? 'border-brand text-brand-light bg-surface-1/40'
                    : 'border-transparent text-zinc-500 hover:text-zinc-350 hover:bg-surface-2/5'
                }`}
              >
                <button
                  onClick={() => setActiveFatherTabId('settings')}
                  className="flex items-center space-x-1.5 px-3 py-2.5"
                >
                  <Settings size={12} className={activeFatherTabId === 'settings' ? 'text-brand-light' : 'text-zinc-650'} />
                  <span>Settings</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSettingsFatherTabOpen(false);
                    if (activeFatherTabId === 'settings') {
                      setActiveFatherTabId(activeWorkspace?.id || '');
                    }
                  }}
                  className="pr-2 text-zinc-600 hover:text-rose-450 transition cursor-pointer"
                  title="Close Settings Tab"
                >
                  <X size={10} />
                </button>
              </div>
            )}
          </div>

          {activeFatherTabId === 'settings' ? (
            /* Render full page Settings Dashboard */
            <div className="flex-grow min-h-0 bg-[#0a0a0a] overflow-hidden">
              <SettingsPanel />
            </div>
          ) : (
            /* Render Workspace Content */
            <>
              {/* Level 2: Child Tabs (sessions and open files) */}
              <div className="shrink-0 flex items-center justify-between border-b border-surface-2 bg-[#171717] select-none">
                <div className="flex-1 flex items-center overflow-x-auto scrollbar-none relative">
                  {/* Sessions Tab - sticky to the left */}
                  <button
                    onClick={() => setActiveFileTab(null)}
                    className={`sticky left-0 z-10 flex items-center space-x-1.5 px-4 py-2.5 text-xs font-semibold border-r border-surface-2 transition bg-[#171717] shrink-0 border-b-2 ${
                      activeFileTab === null
                        ? 'border-b-brand text-zinc-100'
                        : 'border-b-transparent text-zinc-500 hover:text-zinc-350'
                    }`}
                  >
                    <SquareTerminal size={13} className={activeFileTab === null ? 'text-brand-light' : 'text-zinc-500'} />
                    <span className="font-mono">sessions</span>
                  </button>

                  {/* Opened File Tabs */}
                  {openFiles.map(f => {
                    const isGitDiff = f.path.startsWith('git-diff:');
                    const displayName = isGitDiff ? `Diff: ${f.name}` : f.name;
                    return (
                      <div
                        key={f.path}
                        className={`flex items-center space-x-1 border-r border-surface-2 border-b-2 transition shrink-0 ${
                          activeFileTab === f.path
                            ? 'border-brand text-zinc-100 bg-surface/40'
                            : 'border-transparent text-zinc-550 hover:text-zinc-350 hover:bg-surface-2/10'
                        }`}
                      >
                        <button
                          onClick={() => setActiveFileTab(f.path)}
                          className="px-3 py-2 text-xs font-mono font-medium truncate max-w-[150px]"
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
                        >
                          <X size={10} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tab content area */}
              <div className="flex-grow min-h-0 overflow-hidden">
                {activeFileTab === null ? (
                  <div className="w-full h-full flex flex-col bg-[#0a0a0a] overflow-hidden">
                    {/* Clean Terminal Toolbar */}
                    <div className="shrink-0 bg-surface-1 border-b border-surface-2 px-4 py-2 flex items-center justify-between select-none overflow-x-auto">
                      <div className="flex items-center space-x-2 overflow-x-auto">
                        <SquareTerminal size={14} className="text-brand-light shrink-0" />
                        <span className="text-[10px] text-zinc-450 font-mono uppercase tracking-wider font-semibold mr-1.5 shrink-0">PTY Sessions:</span>
                        {activeProjectSessions.map((session) => {
                          const isSelected = activeSessionId === session.id;
                          return (
                            <div
                              key={session.id}
                              className={`flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono border transition shrink-0 ${
                                isSelected
                                  ? 'bg-brand/10 border-brand/40 text-brand-light font-bold'
                                  : 'bg-surface-3/30 border-surface-3 text-zinc-450 hover:text-zinc-200'
                              }`}
                            >
                              <button
                                onClick={() => handleSelectSession(activeWorkspace, session.id)}
                                className="flex items-center space-x-1.5 cursor-pointer py-0.5"
                              >
                                <div className={`flex items-center justify-center w-4 h-4 rounded-full bg-gradient-to-tr ${getAgentIconClass(session.agentType)} text-white font-extrabold text-[7px] shadow-sm select-none shrink-0`}>
                                  {getInitials(session.agentType)}
                                </div>
                                <span>{session.agentType}</span>
                                <span className="text-[8px] text-zinc-500 font-normal">({session.id.substring(8, 12)})</span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteSession(session.id);
                                }}
                                className="p-0.5 hover:bg-red-500/20 hover:text-red-400 text-zinc-550 rounded transition cursor-pointer"
                                title="Delete Session"
                              >
                                <X size={10} />
                              </button>
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

                      {/* Splits layout toolbar in same row for space optimization */}
                      <div className="flex items-center space-x-1 bg-surface-2/70 p-0.5 rounded border border-surface-3 font-mono text-[8px] text-zinc-450 ml-4 shrink-0">
                        <span className="px-1 font-bold">SPLIT:</span>
                        {['1x1', '1x2', '2x1', '2x2'].map((type) => (
                          <button
                            key={type}
                            onClick={() => setPaneLayoutType(type as any)}
                            className={`px-1.5 py-0.5 rounded transition cursor-pointer ${paneLayout.type === type ? 'bg-brand text-white font-bold' : 'hover:text-zinc-200 bg-surface-3/50'}`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Terminal Grid */}
                    <div className="flex-grow min-h-0 p-0 bg-[#0a0a0a] overflow-hidden">
                      <TerminalGrid />
                    </div>
                  </div>
                ) : activeFileTab.startsWith('git-diff:') ? (
                  <div className="w-full h-full">
                    <GitDiffCompare tabPath={activeFileTab} />
                  </div>
                ) : (
                  <div className="w-full h-full">
                    <FilePreview />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right Panel (Inspector tabs) */}
        {isRightPaneExpanded && (
          <div className="w-80 border-l border-surface-2 bg-surface-1 flex flex-col overflow-hidden">
            {/* Swappable Panel Tabs */}
            <div className="shrink-0 flex border-b border-surface-2 select-none bg-surface-1/40">
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
                onClick={() => setIsRightPaneExpanded(false)}
                className="px-3 text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
                title="Collapse Panel"
              >
                <Minimize2 size={13} />
              </button>
            </div>

            {/* Tab content area */}
            <div className="flex-grow overflow-y-auto p-4 min-h-0 bg-surface-1/60 font-sans">
              {activeRightPanel === 'files' ? (
                <div className="h-full flex flex-col">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2 font-mono">Workspace Files</h3>
                  <div className="flex-grow overflow-y-auto">
                    <FileTree rootPath={activeWorkspace?.path || workspacePath} />
                  </div>
                </div>
              ) : activeRightPanel === 'git' ? (
                <GitPanel />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 font-mono text-[10px]">
                  <Sparkles size={20} className="mb-1.5 text-zinc-600" />
                  <span>Select a tab above</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Expand Right Pane Trigger */}
        {!isRightPaneExpanded && (
          <button
            onClick={() => {
              setIsRightPaneExpanded(true);
              if (activeRightPanel === 'none') {
                setActiveRightPanel('files');
              }
            }}
            className="w-8 bg-surface-1 border-l border-surface-2 flex items-center justify-center hover:bg-surface-2 text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
            title="Expand Panel"
          >
            <Maximize2 size={13} className="rotate-90" />
          </button>
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
                  <div>
                    <label className="block text-zinc-400 font-mono text-[10px] mb-1 font-bold">RESUME PAST CONVERSATION</label>
                    <select
                      value={resumeSessionId}
                      onChange={(e) => setResumeSessionId(e.target.value)}
                      className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-zinc-250 focus:outline-none focus:border-brand/70 font-mono cursor-pointer"
                    >
                      <option value="">Start Fresh (No Resume)</option>
                      {getFilteredPastSessions(modalTargetProject?.path || '').map(s => (
                        <option key={s.id} value={s.id}>
                          {s.agent_type} - {s.remote_session_id?.substring(0, 8)}...
                        </option>
                      ))}
                    </select>
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
            <div className="bg-surface-1 px-4 py-3 border-t border-surface-2 flex justify-end space-x-2.5">
              <button
                onClick={() => setShowNewSessionModal(false)}
                className="bg-surface-3 text-zinc-400 font-semibold px-3.5 py-1.5 rounded text-xs hover:bg-surface-2 cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSession}
                className="bg-brand text-white font-semibold px-4 py-1.5 rounded text-xs hover:bg-brand/90 cursor-pointer transition"
              >
                Spawn Session
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
