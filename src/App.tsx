import { useState } from 'react';
import { useWorkspaceStore } from './store/workspaceStore';
import { TerminalPane } from './components/TerminalPane';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Terminal as TermIcon, Trash2, HardDrive } from 'lucide-react';

function App() {
  const { sessions, activeSessionId, addSession, setActiveSession, removeSession } = useWorkspaceStore();
  const [cmdInput, setCmdInput] = useState('/bin/zsh');
  const [argsInput, setArgsInput] = useState('');
  const [cwdInput, setCwdInput] = useState('/Users/ray/git-repo/black_tde');

  const handleCreateSession = async () => {
    const newSessionId = 'session_' + Math.random().toString(36).substring(2, 11);
    const mockWorkspaceId = 'default_workspace';
    
    // Parse arguments split by space
    const args = argsInput.trim() ? argsInput.split(/\s+/) : [];

    try {
      // Invoke Tauri command to spawn process in PTY backend
      await invoke('spawn_session', {
        id: newSessionId,
        workspaceId: mockWorkspaceId,
        command: cmdInput,
        args: args,
        cwd: cwdInput || '/Users/ray/git-repo/black_tde',
        rows: 24,
        cols: 80,
      });

      // Add to frontend state manager
      addSession({
        id: newSessionId,
        agentType: cmdInput.split('/').pop() || cmdInput,
        cwd: cwdInput,
        status: 'active',
      });

      setActiveSession(newSessionId);
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
      removeSession(id); // fallback cleanup from store
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#020617] text-slate-100 overflow-hidden font-sans">
      {/* Left Sidebar Panel */}
      <div className="w-80 border-r border-slate-800 bg-[#0b0f19] flex flex-col select-none">
        {/* App Title & Workspace Section */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center font-bold text-white shadow-md shadow-sky-500/20">
              T
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-wide bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">TDE COCKPIT</h1>
              <p className="text-[10px] text-slate-400 font-mono">v1.0.0 (Tauri + React)</p>
            </div>
          </div>
          <div className="flex items-center space-x-1 text-emerald-400 text-xs font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Online</span>
          </div>
        </div>

        {/* Workspace info */}
        <div className="px-4 py-3 bg-[#0d1527] border-b border-slate-800/80 flex items-center space-x-2">
          <HardDrive size={14} className="text-sky-400" />
          <div className="truncate">
            <p className="text-[10px] text-slate-400 font-medium">ACTIVE WORKSPACE</p>
            <p className="text-xs font-mono truncate text-slate-200">black_tde</p>
          </div>
        </div>

        {/* Spawn New Session Section */}
        <div className="p-4 border-b border-slate-800 flex flex-col space-y-3 bg-[#0c1220]/60">
          <h2 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Spawn Process</h2>
          <div className="space-y-2 text-xs">
            <div>
              <label className="block text-slate-400 font-mono mb-1">COMMAND</label>
              <input
                type="text"
                value={cmdInput}
                onChange={(e) => setCmdInput(e.target.value)}
                placeholder="/bin/zsh"
                className="w-full bg-[#1e293b] border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-mono mb-1">ARGS (SPACE SEPARATED)</label>
              <input
                type="text"
                value={argsInput}
                onChange={(e) => setArgsInput(e.target.value)}
                placeholder="--version"
                className="w-full bg-[#1e293b] border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-mono mb-1">WORKING DIRECTORY</label>
              <input
                type="text"
                value={cwdInput}
                onChange={(e) => setCwdInput(e.target.value)}
                placeholder="/Users/ray/git-repo/black_tde"
                className="w-full bg-[#1e293b] border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>
            <button
              onClick={handleCreateSession}
              className="w-full flex items-center justify-center space-x-1 bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white font-medium py-1.5 px-3 rounded shadow shadow-sky-500/20 transition duration-150"
            >
              <Plus size={14} />
              <span>Spawn Session</span>
            </button>
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <h2 className="text-xs font-semibold tracking-wider text-slate-400 uppercase mb-2">Active Sessions</h2>
          {Object.keys(sessions).length === 0 ? (
            <div className="text-xs text-slate-500 italic p-2 text-center">
              No sessions active. Spawn one above!
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
                  title="Kill Session"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Center Console Pane */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#090d16]">
        {activeSessionId && sessions[activeSessionId] ? (
          <div className="flex-1 flex flex-col p-4 h-full">
            {/* Session Header */}
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-sm font-bold flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
                  <span>Session Terminal</span>
                </h2>
                <p className="text-xs font-mono text-slate-400 mt-0.5">
                  ID: {activeSessionId} | CWD: {sessions[activeSessionId].cwd}
                </p>
              </div>
            </div>
            {/* Terminal Pane */}
            <div className="flex-1 min-h-0">
              <TerminalPane sessionId={activeSessionId} />
            </div>
          </div>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center text-center p-8 select-none">
            <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center text-slate-400 mb-4 border border-slate-700/50">
              <TermIcon size={32} />
            </div>
            <h2 className="text-lg font-bold text-slate-200">No Active Terminal Session</h2>
            <p className="text-sm text-slate-400 max-w-sm mt-2">
              Spawn a new session (e.g. <code className="font-mono text-xs bg-slate-800 px-1 py-0.5 rounded text-sky-300">/bin/zsh</code>) using the sidebar controller to start terminal operations.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
