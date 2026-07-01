import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import '@xterm/xterm/css/xterm.css';

interface TerminalPaneProps {
  sessionId: string;
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({ sessionId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize xterm with dark theme
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'underline',
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
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
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    // Listen to stdout event stream from event bus
    const unlistenPromise = listen('tde-event', (event: any) => {
      const payload = event.payload;
      if (payload.session_id === sessionId) {
        if (payload.event_type === 'stdout') {
          term.write(new Uint8Array(payload.data));
        } else if (payload.event_type === 'exit') {
          term.write('\r\n\x1b[1;31m[Process terminated]\x1b[0m\r\n');
        }
      }
    });

    // Handle user input
    const dataDisposer = term.onData((data) => {
      const bytes = new TextEncoder().encode(data);
      invoke('write_to_session', { id: sessionId, data: Array.from(bytes) }).catch((err) => {
        console.error('Failed to write key to session:', err);
      });
    });

    // Resize tracking
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        invoke('resize_session', {
          id: sessionId,
          rows: term.rows,
          cols: term.cols,
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
        fitAddon.fit();
        invoke('resize_session', {
          id: sessionId,
          rows: term.rows,
          cols: term.cols,
        }).catch((err) => console.error(err));
      } catch (e) {
        console.error(e);
      }
    }, 100);

    return () => {
      clearTimeout(resizeTimeout);
      unlistenPromise.then((unlisten) => unlisten());
      dataDisposer.dispose();
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [sessionId]);

  return (
    <div className="w-full h-full bg-[#0f172a] p-3 rounded-lg border border-slate-700 flex flex-col">
      <div ref={containerRef} className="w-full h-full flex-grow min-h-[400px]" />
    </div>
  );
};
