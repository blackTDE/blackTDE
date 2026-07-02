import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useWorkspaceStore } from '../store/workspaceStore';
import '@xterm/xterm/css/xterm.css';

interface TerminalPaneProps {
  sessionId: string;
}

interface CachedTerminal {
  term: Terminal;
  fitAddon: FitAddon;
  unlisten: () => void;
  dataDisposer: any;
}

const terminalCache: Record<string, CachedTerminal> = {};

export const TerminalPane: React.FC<TerminalPaneProps> = ({ sessionId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { sessions } = useWorkspaceStore();

  // Cleanup cached terminals for sessions that no longer exist
  useEffect(() => {
    Object.keys(terminalCache).forEach((id) => {
      if (!sessions[id]) {
        const cached = terminalCache[id];
        if (cached) {
          cached.unlisten();
          cached.dataDisposer.dispose();
          cached.term.dispose();
          delete terminalCache[id];
        }
      }
    });
  }, [sessions]);

  useEffect(() => {
    if (!containerRef.current) return;

    let cached = terminalCache[sessionId];
    if (!cached) {
      // Initialize xterm with dark theme and Nerd Fonts to fix messy code glyphs
      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'underline',
        fontSize: 13,
        fontFamily: "'MesloLGS NF', 'Meslo LGS NF', 'MesloLGS Nerd Font', 'JetBrainsMono Nerd Font', 'JetBrains Mono Nerd Font', 'FiraCode Nerd Font', 'Fira Code Nerd Font', 'Hack Nerd Font', 'Symbols Nerd Font Mono', 'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
        theme: {
          background: '#0f172a', // Slate 900
          foreground: '#f8fafc', // Slate 50
          cursor: '#38bdf8',     // Sky 400
          black: '#1e293b',
          red: '#ef4444',
          green: '#22c55e',
          yellow: '#eab308',
          blue: '#3b82f6',
          magenta: '#a855f7',
          cyan: '#06b6d4',
          white: '#cbd5e1',
        },
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      // Listen to stdout event stream from event bus
      let unlistenFn: (() => void) | null = null;
      listen('tde-event', (event: any) => {
        const payload = event.payload;
        if (payload.session_id === sessionId) {
          if (payload.event_type === 'stdout') {
            term.write(new Uint8Array(payload.data));
          } else if (payload.event_type === 'exit') {
            term.write('\r\n\x1b[1;31m[Process terminated]\x1b[0m\r\n');
          }
        }
      }).then((fn) => {
        unlistenFn = fn;
      });

      // Handle user input
      const dataDisposer = term.onData((data) => {
        const bytes = new TextEncoder().encode(data);
        invoke('write_to_session', { id: sessionId, data: Array.from(bytes) }).catch((err) => {
          console.error('Failed to write key to session:', err);
        });
      });

      cached = {
        term,
        fitAddon,
        unlisten: () => {
          if (unlistenFn) unlistenFn();
        },
        dataDisposer,
      };
      terminalCache[sessionId] = cached;
    }

    // Attach cached terminal to the current DOM element
    containerRef.current.innerHTML = '';
    cached.term.open(containerRef.current);
    cached.fitAddon.fit();

    const currentTerm = cached.term;
    const currentFitAddon = cached.fitAddon;

    // Resize tracking
    const resizeObserver = new ResizeObserver(() => {
      try {
        currentFitAddon.fit();
        invoke('resize_session', {
          id: sessionId,
          rows: currentTerm.rows,
          cols: currentTerm.cols,
        }).catch((err) => {
          console.error('Failed to resize terminal:', err);
        });
      } catch (err) {
        console.error(err);
      }
    });

    resizeObserver.observe(containerRef.current);

    // Initial resize sync
    const resizeTimeout = setTimeout(() => {
      try {
        currentFitAddon.fit();
        invoke('resize_session', {
          id: sessionId,
          rows: currentTerm.rows,
          cols: currentTerm.cols,
        }).catch((err) => console.error(err));
      } catch (e) {
        console.error(e);
      }
    }, 100);

    return () => {
      clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
      // Detach elements by cleaning innerHTML on unmount, keeping xterm instance alive in cache
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [sessionId]);

  return (
    <div className="w-full h-full bg-[#0f172a] p-3 rounded-lg border border-slate-700 flex flex-col">
      <div ref={containerRef} className="w-full h-full flex-grow min-h-[400px]" />
    </div>
  );
};
