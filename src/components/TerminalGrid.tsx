import React from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { TerminalPane } from './TerminalPane';

export const TerminalGrid: React.FC = () => {
  const { paneLayout, sessions, setPaneSessionId, setActivePaneIndex, activeWorkspace } = useWorkspaceStore();

  const getVisiblePaneCount = (layoutType: '1x1' | '1x2' | '2x1' | '2x2'): number => {
    switch (layoutType) {
      case '1x1': return 1;
      case '1x2': return 2;
      case '2x1': return 2;
      case '2x2': return 4;
    }
  };

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
        className={`relative w-full h-full rounded border flex flex-col overflow-hidden transition-all duration-200 ${
          isActive 
            ? 'border-sky-500 shadow-md shadow-sky-500/5' 
            : 'border-slate-800 hover:border-slate-700 bg-slate-900/10'
        }`}
      >
        {/* Cell Header */}
        <div className={`px-2 py-1 flex items-center justify-between text-[10px] font-mono select-none ${
          isActive ? 'bg-sky-950/40 border-b border-sky-500/20' : 'bg-slate-950/20 border-b border-slate-850'
        }`}>
          <div className="flex items-center space-x-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-sky-400 animate-pulse' : 'bg-slate-600'}`} />
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
        <div className="flex-grow min-h-0 bg-[#0f172a]">
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

  // Render grids by active layout type
  switch (paneLayout.type) {
    case '1x1':
      return (
        <div className="w-full h-full p-1">
          {renderCell(0)}
        </div>
      );
    case '1x2':
      return (
        <div className="w-full h-full flex flex-row p-1 space-x-2">
          <div className="flex-1 min-w-0 h-full">{renderCell(0)}</div>
          <div className="flex-1 min-w-0 h-full">{renderCell(1)}</div>
        </div>
      );
    case '2x1':
      return (
        <div className="w-full h-full flex flex-col p-1 space-y-2">
          <div className="flex-1 min-h-0 w-full">{renderCell(0)}</div>
          <div className="flex-1 min-h-0 w-full">{renderCell(1)}</div>
        </div>
      );
    case '2x2':
      return (
        <div className="w-full h-full flex flex-col p-1 space-y-2">
          <div className="flex-1 min-h-0 w-full flex flex-row space-x-2">
            <div className="flex-1 min-w-0 h-full">{renderCell(0)}</div>
            <div className="flex-1 min-w-0 h-full">{renderCell(1)}</div>
          </div>
          <div className="flex-1 min-h-0 w-full flex flex-row space-x-2">
            <div className="flex-1 min-w-0 h-full">{renderCell(2)}</div>
            <div className="flex-1 min-w-0 h-full">{renderCell(3)}</div>
          </div>
        </div>
      );
    default:
      return <div className="p-4 text-xs text-rose-500 font-mono">Unsupported Layout Type: {paneLayout.type}</div>;
  }
};
