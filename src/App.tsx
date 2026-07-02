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
  Terminal as TermIcon, 
  Trash2, 
  HardDrive, 
  Files, 
  GitBranch, 
  FileCode, 
  Sparkles,
  Maximize2,
  Minimize2,
  KeyRound,
  Settings
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
    setPaneSessionId
  } = useWorkspaceStore();

  const [leftTab, setLeftTab] = useState<'sessions' | 'files'>('sessions');
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
    <div className="flex h-screen w-screen bg-[#020617] text-slate-100 overflow-hidden font-sans flex-col">
      {/* Main Container */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        
        {/* Left Sidebar Panel */}
        <div className="w-80 border-r border-slate-800 bg-[#0b0f19] flex flex-col select-none">
          {/* Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center font-bold text-white shadow-md shadow-sky-500/20">
                T
              </div>
              <div>
                <h1 className="font-bold text-sm tracking-wide bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">TDE COCKPIT</h1>
                <p className="text-[10px] text-slate-400 font-mono">v1.0.0 (React + Monaco)</p>
              </div>
            </div>
            <div className="flex items-center space-x-1 text-emerald-400 text-xs font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Online</span>
            </div>
          </div>

          {/* Tab Switchers */}
          <div className="flex border-b border-slate-850 px-2 pt-2 bg-[#090d16]/80">
            <button
              onClick={() => setLeftTab('sessions')}
              className={`flex-1 flex items-center justify-center space-x-1.5 py-2 text-xs font-medium border-b-2 rounded-t transition ${
                leftTab === 'sessions'
                  ? 'border-sky-500 text-sky-400 bg-sky-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <TermIcon size={13} />
              <span>Sessions</span>
            </button>
            <button
              onClick={() => setLeftTab('files')}
              className={`flex-1 flex items-center justify-center space-x-1.5 py-2 text-xs font-medium border-b-2 rounded-t transition ${
                leftTab === 'files'
                  ? 'border-sky-500 text-sky-400 bg-sky-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Files size={13} />
              <span>File Explorer</span>
            </button>
          </div>

          {/* Left Tab Content */}
          <div className="flex-1 overflow-y-auto flex flex-col">
            {leftTab === 'sessions' ? (
              <div className="flex flex-col flex-1">
                {/* Spawn Process Form */}
                <div className="p-4 border-b border-slate-800 flex flex-col space-y-3 bg-[#0c1220]/40">
                  <h2 className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Spawn Process</h2>
                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="block text-slate-400 font-mono mb-1">COMMAND</label>
                      <input
                        type="text"
                        value={cmdInput}
                        onChange={(e) => setCmdInput(e.target.value)}
                        className="w-full bg-[#1e293b] border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-mono mb-1">ARGS</label>
                      <input
                        type="text"
                        value={argsInput}
                        onChange={(e) => setArgsInput(e.target.value)}
                        placeholder="e.g. -l"
                        className="w-full bg-[#1e293b] border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-mono mb-1">DIRECTORY</label>
                      <input
                        type="text"
                        value={cwdInput}
                        onChange={(e) => setCwdInput(e.target.value)}
                        className="w-full bg-[#1e293b] border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-mono mb-1 font-bold">RESUME PAST CONVERSATION</label>
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
                        className="w-full bg-[#1e293b] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
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
                      <label className="block text-slate-400 font-mono mb-1 font-bold">PROVIDER (ENV KEY)</label>
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
                        className="w-full bg-[#1e293b] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
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
                      className="w-full flex items-center justify-center space-x-1 bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white font-medium py-1.5 px-3 rounded shadow shadow-sky-500/20 transition"
                    >
                      <Plus size={14} />
                      <span>Spawn Session</span>
                    </button>
                  </div>
                </div>

                {/* Session list */}
                <div className="p-4 space-y-2 flex-grow overflow-y-auto">
                  <h2 className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-2">Sessions List</h2>
                  {Object.keys(sessions).length === 0 ? (
                    <div className="text-xs text-slate-500 italic p-2 text-center">
                      No active sessions. Spawn one above!
                    </div>
                  ) : (
                    Object.values(sessions).map((session) => (
                      <div
                        key={session.id}
                        onClick={() => setActiveSession(session.id)}
                        className={`flex items-center justify-between p-2 rounded cursor-pointer transition border ${
                          activeSessionId === session.id
                            ? 'bg-sky-500/10 border-sky-500/40 text-sky-200'
                            : 'bg-slate-800/40 border-transparent hover:bg-slate-800/80 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <TermIcon size={14} className={activeSessionId === session.id ? 'text-sky-400' : 'text-slate-400'} />
                          <div className="truncate">
                            <p className="text-xs font-mono font-medium truncate">{session.agentType}</p>
                            <p className="text-[10px] text-slate-500 font-mono truncate">{session.id}</p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTerminateSession(session.id);
                          }}
                          className="p-1 hover:bg-red-500/20 hover:text-red-400 text-slate-500 rounded transition"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 flex-grow flex flex-col min-h-0">
                <h2 className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-2">Workspace Files</h2>
                <div className="flex-1 overflow-y-auto min-h-0">
                  <FileTree rootPath={workspacePath} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center Panel (Split: Terminal + Editor/Git) */}
        <div className="flex-grow flex min-w-0 bg-[#090d16]">
          {/* Main vertical split panel */}
          <div className="flex-grow flex min-w-0 h-full p-4 space-x-4">
            
            {/* Split Left: Terminal splits cockpit */}
            <div className="flex-grow flex flex-col min-w-0 h-full">
              {/* Layout switcher toolbar */}
              <div className="flex items-center justify-between mb-2 select-none">
                <div>
                  <h2 className="text-xs font-bold flex items-center space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>
                    <span className="text-slate-200">Terminal splits cockpit</span>
                  </h2>
                </div>
                <div className="flex items-center space-x-2 bg-slate-800/40 p-0.5 rounded border border-slate-700/60 font-mono text-[9px] text-slate-400">
                  <span className="px-1.5 font-bold">SPLIT:</span>
                  <button
                    onClick={() => setPaneLayoutType('1x1')}
                    className={`px-2 py-0.5 rounded transition ${paneLayout.type === '1x1' ? 'bg-sky-500 text-white font-bold' : 'hover:text-slate-200 bg-slate-800'}`}
                  >
                    1x1
                  </button>
                  <button
                    onClick={() => setPaneLayoutType('1x2')}
                    className={`px-2 py-0.5 rounded transition ${paneLayout.type === '1x2' ? 'bg-sky-500 text-white font-bold' : 'hover:text-slate-200 bg-slate-800'}`}
                  >
                    1x2
                  </button>
                  <button
                    onClick={() => setPaneLayoutType('2x1')}
                    className={`px-2 py-0.5 rounded transition ${paneLayout.type === '2x1' ? 'bg-sky-500 text-white font-bold' : 'hover:text-slate-200 bg-slate-800'}`}
                  >
                    2x1
                  </button>
                  <button
                    onClick={() => setPaneLayoutType('2x2')}
                    className={`px-2 py-0.5 rounded transition ${paneLayout.type === '2x2' ? 'bg-sky-500 text-white font-bold' : 'hover:text-slate-200 bg-slate-800'}`}
                  >
                    2x2
                  </button>
                </div>
              </div>
              <div className="flex-grow min-h-0 bg-[#070b12] rounded-lg border border-slate-800">
                <TerminalGrid />
              </div>
            </div>

            {/* Split Right: Swappable Utility Panel (Monaco / Git) */}
            {isRightPaneExpanded && (
              <div className="flex-1 min-w-0 h-full flex flex-col">
                {/* Utilities Tab Switcher */}
                <div className="flex items-center justify-between mb-2 select-none">
                  <div className="flex space-x-2 bg-slate-800/40 p-0.5 rounded border border-slate-700/60">
                    <button
                      onClick={() => setActiveRightPanel('editor')}
                      className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-semibold transition ${
                        activeRightPanel === 'editor'
                          ? 'bg-slate-700 text-slate-100 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <FileCode size={13} />
                      <span>Code Editor</span>
                    </button>
                    <button
                      onClick={() => setActiveRightPanel('git')}
                      className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-semibold transition ${
                        activeRightPanel === 'git'
                          ? 'bg-slate-700 text-slate-100 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <GitBranch size={13} />
                      <span>Git status</span>
                    </button>
                    <button
                      onClick={() => setActiveRightPanel('vault')}
                      className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-semibold transition ${
                        activeRightPanel === 'vault'
                          ? 'bg-slate-700 text-slate-100 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <KeyRound size={13} className="text-amber-500" />
                      <span>Vault</span>
                    </button>
                    <button
                      onClick={() => setActiveRightPanel('settings')}
                      className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-semibold transition ${
                        activeRightPanel === 'settings'
                          ? 'bg-slate-700 text-slate-100 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Settings size={13} className="text-sky-400" />
                      <span>Settings</span>
                    </button>
                  </div>
                  <button
                    onClick={() => setIsRightPaneExpanded(false)}
                    className="p-1 hover:bg-slate-850 rounded text-slate-400 transition"
                    title="Collapse Utility Panel"
                  >
                    <Minimize2 size={13} />
                  </button>
                </div>

                {/* Swappable panel content */}
                <div className="flex-1 min-h-0">
                  {activeRightPanel === 'editor' ? (
                    <EditorPane />
                  ) : activeRightPanel === 'git' ? (
                    <GitPanel />
                  ) : activeRightPanel === 'vault' ? (
                    <SettingsPanel />
                  ) : activeRightPanel === 'settings' ? (
                    <SettingsPanel />
                  ) : (
                    <div className="w-full h-full bg-[#0f172a] rounded-lg border border-slate-700 flex flex-col items-center justify-center text-slate-500">
                      <Sparkles size={28} className="mb-1 text-slate-600" />
                      <span className="text-xs">Select Code Editor, Git, Vault, or Settings above</span>
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
                    setActiveRightPanel('editor');
                  }
                }}
                className="w-8 bg-[#0b0f19] border border-slate-700/60 rounded-lg flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
                title="Expand Utility Panel"
              >
                <Maximize2 size={13} className="rotate-90" />
              </button>
            )}

          </div>
        </div>

      </div>

      {/* Bottom Status Bar */}
      <div className="h-6 bg-[#090d16] border-t border-slate-800 px-3 flex items-center justify-between text-[10px] text-slate-400 font-mono select-none">
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1">
            <HardDrive size={10} className="text-sky-400" />
            <span>Workspace: <strong className="text-slate-300">black_tde</strong></span>
          </span>
          <span className="flex items-center space-x-1">
            <GitBranch size={10} className="text-indigo-400" />
            <span>Branch: <strong className="text-slate-300">{gitBranch}</strong></span>
          </span>
        </div>
        <div className="flex items-center space-x-4">
          {activeSessionId && (
            <span>Active Session: <strong className="text-sky-400">{activeSessionId}</strong></span>
          )}
          <span className="text-slate-500">UTF-8</span>
        </div>
      </div>
    </div>
  );
}

export default App;
