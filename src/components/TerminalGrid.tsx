import React, { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { TerminalPane } from './TerminalPane';

export const TerminalGrid: React.FC = () => {
  const { sessions, activeSessionId, activeWorkspace, setActiveSession, setPaneSessionId } = useWorkspaceStore();
  const [mountedSessionIds, setMountedSessionIds] = useState<string[]>([]);
  const visibleSessionId = activeSessionId && sessions[activeSessionId] ? activeSessionId : null;

  useEffect(() => {
    if (!visibleSessionId) return;
    setMountedSessionIds((current) => current.includes(visibleSessionId) ? current : [...current, visibleSessionId]);
  }, [visibleSessionId]);

  const selectSession = (sessionId: string) => {
    setActiveSession(sessionId);
    setPaneSessionId(0, sessionId);
  };

  return (
    <div className="relative w-full h-full min-h-0 bg-[#0a0a0a]">
      {mountedSessionIds.map((sessionId) => sessions[sessionId] && (
        <div
          key={sessionId}
          className={visibleSessionId === sessionId ? 'w-full h-full' : 'hidden'}
          aria-hidden={visibleSessionId !== sessionId}
        >
          <TerminalPane sessionId={sessionId} isVisible={visibleSessionId === sessionId} />
        </div>
      ))}

      {!visibleSessionId && (
        <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 select-none p-4">
          <span className="text-[10px] font-bold tracking-wider uppercase mb-2 font-mono">No Active Session</span>
          <p className="text-[9px] text-slate-500 mb-3 max-w-[220px] text-center">
            Select a shell or code-agent session. Shell splits are managed natively by tmux.
          </p>
          <div className="flex flex-col space-y-1 w-full max-w-[220px]">
            {Object.values(sessions)
              .filter((session) => session.cwd === activeWorkspace?.path)
              .map((session) => (
                <button
                  key={session.id}
                  onClick={() => selectSession(session.id)}
                  className="text-[9px] bg-slate-800/50 hover:bg-slate-700 text-slate-300 font-mono py-1 px-2 rounded border border-slate-700 text-left truncate transition"
                >
                  Open: {session.name || session.agentType} ({session.id.substring(8, 13)})
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
