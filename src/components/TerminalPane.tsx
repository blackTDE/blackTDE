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
        cursor: '#3794ff',
        black: '#262626',
        red: '#ff6568',
        green: '#86efac',
        yellow: '#fbbf24',
        blue: '#3794ff',
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

    let isHistoryLoaded = false;
    const incomingQueue: Uint8Array[] = [];

    // Fetch past session history first from database transcripts
    invoke<number[]>('get_session_history', { id: sessionId })
      .then((historyBytes) => {
        if (historyBytes && historyBytes.length > 0) {
          term.write(new Uint8Array(historyBytes));
        }
        isHistoryLoaded = true;
        // Flush any events queued during the fetch
        while (incomingQueue.length > 0) {
          const chunk = incomingQueue.shift();
          if (chunk) {
            term.write(chunk);
          }
        }

        // Check if the PTY process is currently active in the backend process manager
        invoke<string[]>('list_active_session_ids')
          .then((activeIds) => {
            if (!activeIds.includes(sessionId)) {
              // Fetch remote session ID to print it before resuming
              invoke<string | null>('get_remote_session_id', { id: sessionId })
                .then((remoteId) => {
                  const displayId = remoteId || "None (fresh shell)";
                  term.write(`\r\n\x1b[1;33m[Session disconnected - auto resuming agent/shell with remote ID: ${displayId}]\x1b[0m\r\n`);
                  
                  // Reset xterm context to prevent overlapping character mess
                  term.reset();
                  term.write(`\x1b[1;33m[Session disconnected - auto resuming agent/shell with remote ID: ${displayId}]\x1b[0m\r\n`);
                  term.write('\x1b[1;30m(Note: Re-connecting to PTY process and cleaning screen context...)\x1b[0m\r\n\r\n');

                  invoke('resume_terminated_session', { id: sessionId })
                    .then(() => {
                      term.write('\x1b[1;32m[Session resumed successfully]\x1b[0m\r\n\r\n');
                    })
                    .catch((err) => {
                      term.write(`\r\n\x1b[1;31m[Auto resume failed: ${err}]\x1b[0m\r\n`);
                    });
                })
                .catch((err) => {
                  console.error('Failed to get remote session id:', err);
                  // Fallback without printing remote ID
                  term.reset();
                  term.write('\x1b[1;33m[Session disconnected - auto resuming agent/shell...]\x1b[0m\r\n');
                  invoke('resume_terminated_session', { id: sessionId })
                    .then(() => {
                      term.write('\x1b[1;32m[Session resumed successfully]\x1b[0m\r\n\r\n');
                    })
                    .catch((resumeErr) => {
                      term.write(`\r\n\x1b[1;31m[Auto resume failed: ${resumeErr}]\x1b[0m\r\n`);
                    });
                });
            }
          })
          .catch((err) => console.error('Failed to query active session list:', err));
      })
      .catch((err) => {
        console.error('Failed to load session history:', err);
        isHistoryLoaded = true;
      });

    // Listen to stdout event stream from tauri event bus
    let unlistenFn: (() => void) | null = null;
    listen('tde-event', (event: any) => {
      const payload = event.payload;
      if (payload.session_id === sessionId) {
        if (payload.event_type === 'stdout') {
          const dataBytes = new Uint8Array(payload.data);
          if (isHistoryLoaded) {
            term.write(dataBytes);
          } else {
            incomingQueue.push(dataBytes);
          }
        } else if (payload.event_type === 'exit') {
          term.write('\r\n\x1b[1;31m[Process terminated]\x1b[0m\r\n');
        }
      }
    }).then((fn) => {
      unlistenFn = fn;
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
      try {
        fitAddon.fit();
        if (term.rows > 2 && term.cols > 2) {
          invoke('resize_session', {
            id: sessionId,
            rows: term.rows,
            cols: term.cols,
          }).catch((err) => {
            console.error('Failed to resize terminal:', err);
          });
        }
      } catch (err) {
        console.error(err);
      }
    });

    resizeObserver.observe(containerRef.current);

    // Initial resize sync (delayed slightly to allow DOM bounding box to stabilize)
    const resizeTimeout = setTimeout(() => {
      try {
        fitAddon.fit();
        if (term.rows > 2 && term.cols > 2) {
          invoke('resize_session', {
            id: sessionId,
            rows: term.rows,
            cols: term.cols,
          }).catch((err) => console.error(err));
        }
      } catch (e) {
        console.error(e);
      }
    }, 100);

    return () => {
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
    <div className="w-full h-full bg-[#0a0a0a] p-3 rounded-lg border border-slate-800/85 flex flex-col">
      <div ref={containerRef} className="w-full h-full flex-grow min-h-[400px]" />
    </div>
  );
};
