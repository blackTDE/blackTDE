import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { restoreTerminal } from '../terminalRestore';
import '@xterm/xterm/css/xterm.css';

interface TerminalPaneProps {
  sessionId: string;
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({ sessionId }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize fresh xterm instance with dark theme and Nerd Fonts to fix messy code glyphs
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'underline',
      fontSize: 13,
      fontFamily: "'MesloLGS NF', 'Meslo LGS NF', 'MesloLGS Nerd Font', 'JetBrainsMono Nerd Font', 'JetBrains Mono Nerd Font', 'FiraCode Nerd Font', 'Fira Code Nerd Font', 'Hack Nerd Font', 'Symbols Nerd Font Mono', 'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
      theme: {
        background: '#0a0a0a',
        foreground: '#fafafa',
        cursor: '#e5e5e5',
        black: '#262626',
        red: '#ff6568',
        green: '#86efac',
        yellow: '#fbbf24',
        blue: '#a1a1a1',
        magenta: '#b66dff',
        cyan: '#40b0a6',
        white: '#e5e5e5',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // Attach terminal to the DOM container
    containerRef.current.innerHTML = '';
    term.open(containerRef.current);
    
    // Initial measure fit
    try {
      fitAddon.fit();
    } catch (e) {
      console.error('Fit error on mount:', e);
    }

    let isReady = false;
    let isDisposed = false;
    const incomingQueue: Uint8Array[] = [];

    const flushIncoming = () => {
      while (incomingQueue.length > 0) {
        const chunk = incomingQueue.shift();
        if (chunk) term.write(chunk);
      }
    };

    const fitAndResize = async () => {
      if (isDisposed) return;
      try {
        fitAddon.fit();
        if (term.rows > 2 && term.cols > 2) {
          await invoke('resize_session', {
            id: sessionId,
            rows: term.rows,
            cols: term.cols,
          });
        }
      } catch (err) {
        console.error('Failed to fit terminal:', err);
      }
    };

    // Listen to stdout event stream from tauri event bus
    let unlistenFn: (() => void) | null = null;
    listen('tde-event', (event: any) => {
      const payload = event.payload;
      if (payload.session_id === sessionId) {
        if (payload.event_type === 'stdout') {
          const dataBytes = new Uint8Array(payload.data);
          if (isReady) {
            term.write(dataBytes);
          } else {
            incomingQueue.push(dataBytes);
          }
        } else if (payload.event_type === 'exit') {
          term.write('\r\n\x1b[1;31m[Process terminated]\x1b[0m\r\n');
        }
      }
    }).then((fn) => {
      if (isDisposed) {
        fn();
        return;
      }
      unlistenFn = fn;

      restoreTerminal({
        lookupActive: async () => {
          const activeIds = await invoke<string[]>('list_active_session_ids');
          return activeIds.includes(sessionId);
        },
        replayHistory: async () => {
          const historyBytes = await invoke<number[]>('get_session_history', { id: sessionId });
          if (!isDisposed && historyBytes.length > 0) {
            term.write(new Uint8Array(historyBytes));
          }
        },
        reset: () => {
          if (!isDisposed) term.reset();
        },
        resume: async () => {
          let displayId = 'None (fresh shell)';
          try {
            displayId = await invoke<string | null>('get_remote_session_id', { id: sessionId }) || displayId;
          } catch (error) {
            console.error('Failed to get remote session id:', error);
          }

          if (!isDisposed) {
            term.write(`\x1b[1;33m[Session disconnected - resuming remote ID: ${displayId}]\x1b[0m\r\n`);
          }

          try {
            await invoke('resume_terminated_session', { id: sessionId });
          } catch (error) {
            if (!isDisposed) {
              term.write(`\r\n\x1b[1;31m[Auto resume failed: ${error}]\x1b[0m\r\n`);
            }
          }
        },
        fitAndResize,
        setReady: () => {
          if (isDisposed) return;
          isReady = true;
          flushIncoming();
        },
        redraw: async () => {
          if (isDisposed) return;
          try {
            await invoke('write_to_session', { id: sessionId, data: [12] });
          } catch (error) {
            console.error('Failed to redraw terminal:', error);
          }
        },
        onLookupError: (error) => console.error('Failed to query active session list:', error),
      }).catch((error) => {
        console.error('Failed to restore terminal:', error);
        if (!isDisposed) {
          isReady = true;
          flushIncoming();
        }
      });
    });

    // Handle user keyboard/mouse input
    const dataDisposer = term.onData((data) => {
      const bytes = new TextEncoder().encode(data);
      invoke('write_to_session', { id: sessionId, data: Array.from(bytes) }).catch((err) => {
        console.error('Failed to write key to session:', err);
      });
    });

    // Resize tracking
    const resizeObserver = new ResizeObserver(() => {
      void fitAndResize();
    });

    resizeObserver.observe(containerRef.current);

    // Initial resize sync (delayed slightly to allow DOM bounding box to stabilize)
    const resizeTimeout = setTimeout(() => {
      void fitAndResize();
    }, 100);

    return () => {
      isDisposed = true;
      clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
      dataDisposer.dispose();
      if (unlistenFn) {
        unlistenFn();
      }
      term.dispose();
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [sessionId]);

  return (
    <div className="w-full h-full min-h-0 bg-[#0a0a0a] overflow-hidden">
      <div ref={containerRef} className="w-full h-full min-h-0" />
    </div>
  );
};
