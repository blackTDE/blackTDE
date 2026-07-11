import React from 'react';
import { getVisiblePaneCount, useWorkspaceStore } from '../store/workspaceStore';
import { TerminalPane } from './TerminalPane';

export const TerminalGrid: React.FC = () => {
  const { paneLayout, sessions, setPaneSessionId, setActivePaneIndex, activeWorkspace } = useWorkspaceStore();

  const visibleCount = getVisiblePaneCount(paneLayout.type);
  const visiblePanes = paneLayout.panes.slice(0, visibleCount);

  const renderCell = (index: number) => {
    const sessId = paneLayout.panes[index];
    const isActive = paneLayout.activePaneIndex === index;
    const session = sessId ? sessions[sessId] : null;

    return (
      <div
        key={index}
        onClick={() => setActivePaneIndex(index)}
        className={`relative w-full h-full min-w-0 min-h-0 flex flex-col overflow-hidden ${
          isActive ? 'bg-surface-1' : 'bg-surface'
        }`}
      >
        {/* Cell Header */}
        <div className="px-2 py-1 flex items-center justify-between text-[10px] font-mono select-none bg-surface-1 border-b border-surface-2">
          <div className="flex items-center space-x-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-zinc-300' : 'bg-zinc-600'}`} />
            <span className="text-[10px] text-slate-400 font-bold uppercase">Pane {index + 1}</span>
            {session && (
              <span className="text-slate-500 text-[9px] font-semibold bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700 max-w-[120px] truncate">
                {session.agentType} ({sessId?.substring(0, 10)})
              </span>
            )}
          </div>
          {sessId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPaneSessionId(index, null);
              }}
              className="text-[9px] text-slate-500 hover:text-rose-400 px-1 rounded transition font-semibold"
              title="Detach session"
            >
              Detach
            </button>
          )}
        </div>

        {/* Cell Content */}
        <div className="flex-grow min-h-0 bg-[#0a0a0a]">
          {sessId ? (
            <TerminalPane sessionId={sessId} />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 select-none p-4">
              <span className="text-[10px] font-bold tracking-wider uppercase mb-2 font-mono">Empty Terminal Cell</span>
              <p className="text-[9px] text-slate-500 mb-3 max-w-[180px] text-center">
                Select or spawn a code agent session in the left sidebar form.
              </p>
              
              {/* Attach Existing List */}
              <div className="flex flex-col space-y-1 w-full max-w-[180px]">
                {Object.values(sessions)
                  .filter(s => s.cwd === activeWorkspace?.path)
                  .map(s => {
                    const isAssigned = visiblePanes.includes(s.id);
                    if (isAssigned) return null;
                    return (
                      <button
                        key={s.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPaneSessionId(index, s.id);
                        }}
                        className="text-[9px] bg-slate-800/50 hover:bg-slate-700 active:bg-slate-650 text-slate-300 font-mono py-1 px-2 rounded border border-slate-700 text-left truncate transition"
                      >
                        Attach: {s.agentType} ({s.id.substring(8, 13)})
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const gridClass = {
    '1x1': 'grid-cols-1 grid-rows-1',
    '1x2': 'grid-cols-2 grid-rows-1',
    '2x1': 'grid-cols-1 grid-rows-2',
    '2x2': 'grid-cols-2 grid-rows-2',
  }[paneLayout.type];

  return (
    <div className={`grid w-full h-full min-h-0 gap-px bg-surface-2 ${gridClass}`}>
      {Array.from({ length: visibleCount }, (_, index) => renderCell(index))}
    </div>
  );
};
