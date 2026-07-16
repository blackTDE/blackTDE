import React, { useEffect, useState } from 'react';
import { getVisiblePaneCount, useWorkspaceStore } from '../store/workspaceStore';
import { TerminalPane } from './TerminalPane';

const getGridPosition = (index: number, layout: string): React.CSSProperties => {
  if (layout === '1x2') return { gridColumn: index + 1, gridRow: 1 };
  if (layout === '2x1') return { gridColumn: 1, gridRow: index + 1 };
  if (layout === '2x2') return { gridColumn: (index % 2) + 1, gridRow: Math.floor(index / 2) + 1 };
  return { gridColumn: 1, gridRow: 1 };
};

export const TerminalGrid: React.FC = () => {
  const { paneLayout, sessions, setPaneSessionId, setActivePaneIndex, activeWorkspace } = useWorkspaceStore();
  const [mountedSessionIds, setMountedSessionIds] = useState<string[]>([]);

  const visibleCount = getVisiblePaneCount(paneLayout.type);
  const visiblePanes = paneLayout.panes.slice(0, visibleCount);
  const visibleSessionIds = visiblePanes.filter((id): id is string => Boolean(id));
  const renderedSessionIds = [...mountedSessionIds];
  for (const sessionId of visibleSessionIds) {
    if (!renderedSessionIds.includes(sessionId)) renderedSessionIds.push(sessionId);
  }

  // Keep every visited terminal mounted. Moving between sessions should only
  // change visibility; recreating xterm loses its stateful screen buffer.
  useEffect(() => {
    setMountedSessionIds((current) => {
      const additions = visibleSessionIds.filter((id) => !current.includes(id));
      return additions.length > 0 ? [...current, ...additions] : current;
    });
  }, [paneLayout.panes, visibleCount]);

  const renderHeader = (index: number, sessionId?: string) => {
    const isActive = paneLayout.activePaneIndex === index;
    const session = sessionId ? sessions[sessionId] : null;

    return (
      <div className="px-2 py-1 flex items-center justify-between text-[10px] font-mono select-none bg-surface-1 border-b border-surface-2">
        <div className="flex items-center space-x-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-zinc-300' : 'bg-zinc-600'}`} />
          <span className="text-[10px] text-slate-400 font-bold uppercase">Pane {index + 1}</span>
          {session && (
            <span className="text-slate-500 text-[9px] font-semibold bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700 max-w-[120px] truncate">
              {session.agentType} ({sessionId?.substring(0, 10)})
            </span>
          )}
        </div>
        {sessionId && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              setPaneSessionId(index, null);
            }}
            className="text-[9px] text-slate-500 hover:text-rose-400 px-1 rounded transition font-semibold"
            title="Detach session"
          >
            Detach
          </button>
        )}
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
      {renderedSessionIds.map((sessionId) => {
        const index = visiblePanes.indexOf(sessionId);
        if (!sessions[sessionId]) return null;

        return (
          <div
            key={sessionId}
            onClick={() => setActivePaneIndex(index)}
            style={index >= 0 ? getGridPosition(index, paneLayout.type) : undefined}
            className={`${index >= 0 ? 'flex' : 'hidden'} relative w-full h-full min-w-0 min-h-0 flex-col overflow-hidden ${
              paneLayout.activePaneIndex === index ? 'bg-surface-1' : 'bg-surface'
            }`}
            aria-hidden={index < 0}
          >
            {index >= 0 && renderHeader(index, sessionId)}
            <div className="flex-grow min-h-0 bg-[#0a0a0a]">
              <TerminalPane sessionId={sessionId} isVisible={index >= 0} />
            </div>
          </div>
        );
      })}

      {Array.from({ length: visibleCount }, (_, index) => {
        if (visiblePanes[index]) return null;
        const isActive = paneLayout.activePaneIndex === index;
        return (
          <div
            key={`empty:${index}`}
            onClick={() => setActivePaneIndex(index)}
            style={getGridPosition(index, paneLayout.type)}
            className={`relative w-full h-full min-w-0 min-h-0 flex flex-col overflow-hidden ${isActive ? 'bg-surface-1' : 'bg-surface'}`}
          >
            {renderHeader(index)}
            <div className="flex-grow min-h-0 bg-[#0a0a0a]">
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 select-none p-4">
                <span className="text-[10px] font-bold tracking-wider uppercase mb-2 font-mono">Empty Terminal Cell</span>
                <p className="text-[9px] text-slate-500 mb-3 max-w-[180px] text-center">
                  Select or spawn a code agent session in the left sidebar form.
                </p>
                <div className="flex flex-col space-y-1 w-full max-w-[180px]">
                  {Object.values(sessions)
                    .filter((session) => session.cwd === activeWorkspace?.path && !visiblePanes.includes(session.id))
                    .map((session) => (
                      <button
                        key={session.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          setPaneSessionId(index, session.id);
                        }}
                        className="text-[9px] bg-slate-800/50 hover:bg-slate-700 active:bg-slate-650 text-slate-300 font-mono py-1 px-2 rounded border border-slate-700 text-left truncate transition"
                      >
                        Attach: {session.agentType} ({session.id.substring(8, 13)})
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
