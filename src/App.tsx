import { useState, useEffect } from 'react';
import { useWorkspaceStore } from './store/workspaceStore';
import { TerminalGrid } from './components/TerminalGrid';
import { SettingsPanel } from './components/SettingsPanel';
import { FileTree } from './components/FileTree';
import { EditorPane } from './components/EditorPane';
import { GitPanel } from './components/GitPanel';
import { invoke } from '@tauri-apps/api/core';
import { 
  Plus, 
  Trash2, 
  HardDrive, 
  GitBranch, 
  Sparkles,
  Maximize2,
  Minimize2,
  Settings,
  Folder,
  X,
  SquareTerminal
} from 'lucide-react';

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
    openFiles,
    activeFileTab,
    closeFile,
    setActiveFileTab
  } = useWorkspaceStore();

  const [isRightPaneExpanded, setIsRightPaneExpanded] = useState(true);

  // Spawning process parameters
  const [cmdInput, setCmdInput] = useState('/bin/zsh');
  const [argsInput, setArgsInput] = useState('');
  const [cwdInput, setCwdInput] = useState('/Users/ray/git-repo/black_tde');
  const [spawnProvider, setSpawnProvider] = useState('none');
  const [pastSessions, setPastSessions] = useState<any[]>([]);
  const [resumeSessionId, setResumeSessionId] = useState('');

  const workspacePath = '/Users/ray/git-repo/black_tde';

  const loadPastSessions = async () => {
    try {
      const list = await invoke<any[]>('list_past_sessions');
      setPastSessions(list.filter(s => s.remote_session_id));
    } catch (e) {
      console.error(e);
    }
  };

  // Load Git Branch name on load
  const loadGitBranch = async () => {
    try {
      const branchName = await invoke<string>('get_git_branch', { cwd: workspacePath });
      setGitBranch(branchName);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadGitBranch();
    loadPastSessions();
    // Default right panel to files tree list
    setActiveRightPanel('files');
  }, []);

  const handleCreateSession = async () => {
    const newSessionId = 'session_' + Math.random().toString(36).substring(2, 11);
    const mockWorkspaceId = 'default_workspace';
    const args = argsInput.trim() ? argsInput.split(/\s+/) : [];

    try {
      await invoke('spawn_session', {
        id: newSessionId,
        workspaceId: mockWorkspaceId,
        command: cmdInput,
        args: args,
        cwd: cwdInput || workspacePath,
        rows: 24,
        cols: 80,
        provider: spawnProvider,
        resumeSessionId: resumeSessionId || null,
      });

      addSession({
        id: newSessionId,
        agentType: cmdInput.split('/').pop() || cmdInput,
        cwd: cwdInput,
        status: 'active',
      });

      setPaneSessionId(paneLayout.activePaneIndex, newSessionId);
      setResumeSessionId('');
      loadPastSessions();
      // Auto-switch to terminal splits tab when launching process
      setActiveFileTab(null);
    } catch (error) {
      alert('Failed to spawn session: ' + error);
    }
  };

  const handleTerminateSession = async (id: string) => {
    try {
      await invoke('terminate_session', { id });
      removeSession(id);
    } catch (error) {
      console.error('Failed to terminate session:', error);
      removeSession(id);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-surface text-zinc-100 overflow-hidden font-sans flex-col select-none">
      {/* Main Container */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        
        {/* Left Sidebar Panel */}
        <div className="w-80 border-r border-surface-2 bg-surface-1 flex flex-col select-none overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-surface-2 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded bg-brand flex items-center justify-center font-bold text-white shadow-md shadow-brand/20">
                T
              </div>
              <div>
                <h1 className="font-bold text-xs tracking-wider text-zinc-100 font-mono uppercase">TDE Cockpit</h1>
                <p className="text-[9px] text-zinc-500 font-mono">v1.1.0 (Tauri v2)</p>
              </div>
            </div>
            <div className="flex items-center space-x-1 text-success text-[10px] font-semibold bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
              <span>Online</span>
            </div>
          </div>

          {/* Left panel forms and sessions */}
          <div className="flex-grow overflow-y-auto flex flex-col divide-y divide-surface-2 min-h-0">
            
            {/* Spawn Process Form */}
            <div className="p-4 flex flex-col space-y-3 bg-surface/30">
              <h2 className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase font-mono">Spawn Agent CLI</h2>
              <div className="space-y-2.5 text-xs">
                <div>
                  <label className="block text-zinc-400 font-mono mb-1 font-semibold">COMMAND</label>
                  <input
                    type="text"
                    value={cmdInput}
                    onChange={(e) => setCmdInput(e.target.value)}
                    className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-zinc-250 focus:outline-none focus:border-brand/70 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-mono mb-1 font-semibold">ARGS</label>
                  <input
                    type="text"
                    value={argsInput}
                    onChange={(e) => setArgsInput(e.target.value)}
                    placeholder="e.g. -l"
                    className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-zinc-250 focus:outline-none focus:border-brand/70 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-mono mb-1 font-semibold">DIRECTORY</label>
                  <input
                    type="text"
                    value={cwdInput}
                    onChange={(e) => setCwdInput(e.target.value)}
                    className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-zinc-250 focus:outline-none focus:border-brand/70 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-mono mb-1 font-bold">RESUME PAST CONVERSATION</label>
                  <select
                    value={resumeSessionId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setResumeSessionId(val);
                      if (val) {
                        const selected = pastSessions.find(s => s.remote_session_id === val);
                        if (selected) {
                          setCmdInput(selected.agent_type);
                          setCwdInput(selected.cwd);
                          if (selected.agent_type === 'claude') {
                            setSpawnProvider('anthropic');
                          } else if (selected.agent_type === 'aider') {
                            setSpawnProvider('openai');
                          }
                        }
                      }
                    }}
                    className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-zinc-250 focus:outline-none focus:border-brand/70 font-mono cursor-pointer"
                  >
                    <option value="">Start Fresh (No Resume)</option>
                    {pastSessions.map(s => (
                      <option key={s.id} value={s.remote_session_id}>
                        {s.agent_type} - {s.remote_session_id.substring(0, 8)}... ({s.cwd.split('/').pop()})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-400 font-mono mb-1 font-bold">PROVIDER (ENV KEY)</label>
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
                <button
                  onClick={handleCreateSession}
                  className="w-full flex items-center justify-center space-x-1.5 bg-brand hover:bg-brand/90 active:bg-brand text-white font-semibold py-2 px-3 rounded shadow shadow-brand/20 transition text-xs cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Spawn Session</span>
                </button>
              </div>
            </div>

            {/* Session list */}
            <div className="p-4 space-y-2 flex-grow overflow-y-auto min-h-0 bg-surface-1/40">
              <h2 className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase mb-2 font-mono">Sessions List</h2>
              {Object.keys(sessions).length === 0 ? (
                <div className="text-xs text-zinc-500 italic p-3 text-center bg-surface-2/20 rounded border border-surface-3/30 font-mono">
                  No active sessions. Spawn one above!
                </div>
              ) : (
                Object.values(sessions).map((session) => (
                  <div
                    key={session.id}
                    onClick={() => setActiveSession(session.id)}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer transition border ${
                      activeSessionId === session.id
                        ? 'bg-brand/10 border-brand/40 text-brand-light font-semibold'
                        : 'bg-surface-2/30 border-transparent hover:bg-surface-2 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <SquareTerminal size={13} className={activeSessionId === session.id ? 'text-brand-light' : 'text-zinc-500'} />
                      <div className="truncate">
                        <p className="text-xs font-mono truncate font-medium">{session.agentType}</p>
                        <p className="text-[9px] text-zinc-500 font-mono truncate">{session.id}</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTerminateSession(session.id);
                      }}
                      className="p-1 hover:bg-error/25 hover:text-error text-zinc-500 rounded transition cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Center Panel (Swappable Workbench) */}
        <div className="flex-grow flex flex-col min-w-0 bg-surface">
          {/* Tabs header bar */}
          <div className="shrink-0 flex items-center border-b border-surface-2 bg-surface-1 overflow-x-auto select-none">
            {/* Terminal Tab */}
            <button
              onClick={() => setActiveFileTab(null)}
              className={`flex items-center space-x-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
                activeFileTab === null
                  ? 'border-brand text-zinc-100 bg-surface/40'
                  : 'border-transparent text-zinc-500 hover:text-zinc-350'
              }`}
            >
              <SquareTerminal size={13} className={activeFileTab === null ? 'text-brand-light' : 'text-zinc-500'} />
              <span className="font-mono">Terminal splits cockpit</span>
            </button>

            {/* Opened File Tabs */}
            {openFiles.map(f => (
              <div
                key={f.path}
                className={`flex items-center space-x-1 border-r border-surface-2 border-b-2 transition ${
                  activeFileTab === f.path
                    ? 'border-brand text-zinc-100 bg-surface/40'
                    : 'border-transparent text-zinc-500 hover:text-zinc-350 hover:bg-surface-2/10'
                }`}
              >
                <button
                  onClick={() => setActiveFileTab(f.path)}
                  className="px-3 py-2.5 text-xs font-mono font-medium"
                >
                  {f.name}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeFile(f.path);
                  }}
                  className="pr-2.5 text-zinc-600 hover:text-rose-400 transition"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>

          {/* Tab content area */}
          <div className="flex-grow min-h-0 p-4 overflow-hidden">
            {activeFileTab === null ? (
              <div className="w-full h-full flex flex-col">
                {/* Splits Layout controls */}
                <div className="flex items-center justify-between mb-2 select-none">
                  <h2 className="text-xs font-bold font-mono text-zinc-400">Terminal splits grid</h2>
                  <div className="flex items-center space-x-2 bg-surface-2/60 p-0.5 rounded border border-surface-3 font-mono text-[9px] text-zinc-400">
                    <span className="px-1.5 font-bold">SPLIT:</span>
                    <button
                      onClick={() => setPaneLayoutType('1x1')}
                      className={`px-2 py-0.5 rounded transition ${paneLayout.type === '1x1' ? 'bg-brand text-white font-bold' : 'hover:text-zinc-200 bg-surface-3/50'}`}
                    >
                      1x1
                    </button>
                    <button
                      onClick={() => setPaneLayoutType('1x2')}
                      className={`px-2 py-0.5 rounded transition ${paneLayout.type === '1x2' ? 'bg-brand text-white font-bold' : 'hover:text-zinc-200 bg-surface-3/50'}`}
                    >
                      1x2
                    </button>
                    <button
                      onClick={() => setPaneLayoutType('2x1')}
                      className={`px-2 py-0.5 rounded transition ${paneLayout.type === '2x1' ? 'bg-brand text-white font-bold' : 'hover:text-zinc-200 bg-surface-3/50'}`}
                    >
                      2x1
                    </button>
                    <button
                      onClick={() => setPaneLayoutType('2x2')}
                      className={`px-2 py-0.5 rounded transition ${paneLayout.type === '2x2' ? 'bg-brand text-white font-bold' : 'hover:text-zinc-200 bg-surface-3/50'}`}
                    >
                      2x2
                    </button>
                  </div>
                </div>
                <div className="flex-grow min-h-0 bg-surface-1 rounded-lg border border-surface-2 overflow-hidden shadow-inner">
                  <TerminalGrid />
                </div>
              </div>
            ) : (
              <div className="w-full h-full">
                <EditorPane />
              </div>
            )}
          </div>
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
                onClick={() => setActiveRightPanel('settings')}
                className={`flex-1 flex items-center justify-center space-x-1.5 py-2.5 text-xs font-semibold border-b-2 transition ${
                  activeRightPanel === 'settings'
                    ? 'border-brand text-zinc-100 bg-surface/30'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Settings size={13} />
                <span>Settings</span>
              </button>
              <button
                onClick={() => setIsRightPaneExpanded(false)}
                className="px-3 text-zinc-500 hover:text-zinc-300 transition"
                title="Collapse Panel"
              >
                <Minimize2 size={13} />
              </button>
            </div>

            {/* Tab content area */}
            <div className="flex-grow overflow-y-auto p-4 min-h-0 bg-surface-1/60">
              {activeRightPanel === 'files' ? (
                <div className="h-full flex flex-col">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2 font-mono">Workspace Files</h3>
                  <div className="flex-grow overflow-y-auto">
                    <FileTree rootPath={workspacePath} />
                  </div>
                </div>
              ) : activeRightPanel === 'git' ? (
                <GitPanel />
              ) : activeRightPanel === 'settings' ? (
                <SettingsPanel />
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

      {/* Bottom Status Bar */}
      <div className="h-6 bg-surface-2 border-t border-surface-3 px-3 flex items-center justify-between text-[10px] text-zinc-500 font-mono select-none">
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1">
            <HardDrive size={10} className="text-brand-light" />
            <span>Workspace: <strong className="text-zinc-300">black_tde</strong></span>
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
          <span className="text-zinc-600">UTF-8</span>
        </div>
      </div>
    </div>
  );
}

export default App;
