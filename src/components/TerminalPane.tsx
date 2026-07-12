import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { restoreTerminal } from '../terminalRestore';
import { useWorkspaceStore } from '../store/workspaceStore';
import {
  Folder,
  File,
  Download,
  Upload,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  ArrowUp,
  FolderOpen
} from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

interface TerminalPaneProps {
  sessionId: string;
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({ sessionId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sftpHeight, setSftpHeight] = useState(180);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const session = useWorkspaceStore((state) => state.sessions[sessionId]);
  const sshHost = session?.ssh_host;

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

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = sftpHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const newHeight = Math.max(80, Math.min(500, startHeight - deltaY));
      setSftpHeight(newHeight);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  if (!sshHost) {
    return (
      <div className="w-full h-full min-h-0 bg-[#0a0a0a] overflow-hidden">
        <div ref={containerRef} className="w-full h-full min-h-0" />
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-0 bg-[#0a0a0a] flex flex-col overflow-hidden select-none">
      {/* Upper Panel: Terminal Console */}
      <div className="flex-grow min-h-0 relative">
        <div ref={containerRef} className="w-full h-full min-h-0" />
      </div>

      {/* Resizer Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="h-1 bg-surface-3 hover:bg-brand cursor-row-resize transition duration-150 relative z-10 border-y border-surface-2/40"
      />

      {/* Lower Panel: SFTP Remote Explorer */}
      <SftpExplorer
        host={sshHost}
        height={sftpHeight}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
      />
    </div>
  );
};

interface SftpExplorerProps {
  host: string;
  height: number;
  isCollapsed: boolean;
  setIsCollapsed: (val: boolean) => void;
}

const SftpExplorer: React.FC<SftpExplorerProps> = ({ host, height, isCollapsed, setIsCollapsed }) => {
  const [remoteCwd, setRemoteCwd] = useState('');
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferringFile, setTransferringFile] = useState<string | null>(null);
  const [transferType, setTransferType] = useState<'download' | 'upload' | null>(null);

  const loadDir = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<any[]>('sftp_list_dir', { host, path });
      setFiles(res);
    } catch (err: any) {
      setError(err?.toString() || 'Failed to list remote directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDir(remoteCwd);
  }, [remoteCwd, host]);

  const handleNavigate = (dirName: string) => {
    let newPath = remoteCwd;
    if (dirName === '..') {
      if (!remoteCwd || remoteCwd === '.' || remoteCwd === '/') {
        return;
      }
      const parts = remoteCwd.split('/');
      parts.pop();
      newPath = parts.join('/') || '';
    } else {
      if (!remoteCwd) {
        newPath = dirName;
      } else if (remoteCwd === '/') {
        newPath = '/' + dirName;
      } else {
        newPath = remoteCwd + '/' + dirName;
      }
    }
    setRemoteCwd(newPath);
  };

  const handleDownload = async (file: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (transferringFile) return;
    try {
      const localPath = await invoke<string | null>('select_local_download_destination', { fileName: file.name });
      if (!localPath) return;

      setTransferringFile(file.name);
      setTransferType('download');
      
      const remotePath = !remoteCwd ? file.name : `${remoteCwd}/${file.name}`;
      await invoke('sftp_download_file', { host, remotePath, localPath });
    } catch (err: any) {
      alert(`Download failed: ${err}`);
    } finally {
      setTransferringFile(null);
      setTransferType(null);
    }
  };

  const handleUpload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (transferringFile) return;
    try {
      const localPath = await invoke<string | null>('select_local_file_to_upload');
      if (!localPath) return;

      const fileName = localPath.split(/[/\\]/).pop() || 'uploaded_file';
      
      setTransferringFile(fileName);
      setTransferType('upload');

      const remotePath = !remoteCwd ? fileName : `${remoteCwd}/${fileName}`;
      await invoke('sftp_upload_file', { host, localPath, remotePath });
      loadDir(remoteCwd);
    } catch (err: any) {
      alert(`Upload failed: ${err}`);
    } finally {
      setTransferringFile(null);
      setTransferType(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatTime = (epochSeconds: number) => {
    if (epochSeconds === 0) return '-';
    const d = new Date(epochSeconds * 1000);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <div
      style={{ height: isCollapsed ? '26px' : `${height}px` }}
      className="w-full bg-[#0d0d0d] flex flex-col min-h-0 border-t border-surface-3 transition-[height] duration-200"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between px-3 py-1 bg-surface-1 border-b border-surface-2 text-[10px] font-mono select-none h-[26px]">
        <div className="flex items-center space-x-2 truncate">
          <FolderOpen size={12} className="text-brand-light" />
          <span className="text-[10px] font-bold text-zinc-300">SFTP Remote Files ({host})</span>
          <span className="text-zinc-500 font-semibold truncate">
            {remoteCwd ? `/ ${remoteCwd}` : '/ (Home)'}
          </span>
        </div>
        <div className="flex items-center space-x-2.5">
          {transferringFile && (
            <div className="flex items-center space-x-1 text-brand-light font-semibold animate-pulse">
              <Loader2 size={10} className="animate-spin" />
              <span>
                {transferType === 'upload' ? 'Uploading' : 'Downloading'} {transferringFile}...
              </span>
            </div>
          )}
          {!isCollapsed && (
            <>
              <button
                onClick={(e) => handleUpload(e)}
                disabled={!!transferringFile}
                className="flex items-center space-x-1 text-slate-400 hover:text-brand-light transition disabled:opacity-50 cursor-pointer"
                title="Upload file to remote directory"
              >
                <Upload size={11} />
                <span>Upload</span>
              </button>
              <button
                onClick={() => loadDir(remoteCwd)}
                className="text-slate-400 hover:text-zinc-200 transition cursor-pointer"
                title="Refresh remote files list"
              >
                <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              </button>
            </>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-slate-500 hover:text-zinc-350 transition cursor-pointer"
            title={isCollapsed ? 'Expand SFTP panel' : 'Collapse SFTP panel'}
          >
            {isCollapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {/* Directory Content Area */}
      {!isCollapsed && (
        <div className="flex-grow overflow-y-auto text-[11px] font-mono text-zinc-350 bg-[#070707] min-h-0 select-none font-sans">
          {loading && files.length === 0 ? (
            <div className="w-full py-8 flex flex-col items-center justify-center text-zinc-500 space-y-2">
              <Loader2 size={16} className="animate-spin text-brand" />
              <span>Reading remote folder...</span>
            </div>
          ) : error ? (
            <div className="w-full p-4 flex flex-col items-center justify-center text-rose-400 space-y-2 text-center">
              <span className="font-bold">Error reading remote files:</span>
              <p className="text-[10px] text-zinc-400 max-w-xs">{error}</p>
              <button
                onClick={() => loadDir(remoteCwd)}
                className="bg-surface-3 border border-surface-4 text-zinc-300 px-3 py-1 rounded hover:bg-surface-2 transition text-[10px] cursor-pointer"
              >
                Retry Connection
              </button>
            </div>
          ) : (
            <table className="w-full text-left border-collapse font-mono">
              <thead>
                <tr className="border-b border-surface-2/60 text-[9px] text-zinc-500 bg-surface-1/40 sticky top-0">
                  <th className="py-1 px-3 font-semibold w-1/2">Name</th>
                  <th className="py-1 px-3 font-semibold">Size</th>
                  <th className="py-1 px-3 font-semibold">Modified</th>
                  <th className="py-1 px-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {/* Back Link */}
                {remoteCwd && (
                  <tr
                    onClick={() => handleNavigate('..')}
                    className="border-b border-surface-2/30 hover:bg-surface-2/20 cursor-pointer transition"
                  >
                    <td className="py-1.5 px-3 flex items-center space-x-2 text-brand/80">
                      <ArrowUp size={12} />
                      <span className="font-bold">..</span>
                    </td>
                    <td className="py-1.5 px-3">-</td>
                    <td className="py-1.5 px-3">-</td>
                    <td className="py-1.5 px-3 text-right">-</td>
                  </tr>
                )}

                {files.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-zinc-600">
                      Empty directory
                    </td>
                  </tr>
                ) : (
                  files.map((file) => (
                    <tr
                      key={file.name}
                      onClick={() => file.is_dir && handleNavigate(file.name)}
                      className={`border-b border-surface-2/30 hover:bg-surface-2/30 transition ${
                        file.is_dir ? 'cursor-pointer text-zinc-200' : 'text-zinc-400'
                      }`}
                    >
                      <td className="py-1.5 px-3">
                        <div className="flex items-center space-x-2 truncate">
                          {file.is_dir ? (
                            <Folder size={12} className="text-amber-500/80 fill-amber-500/10" />
                          ) : (
                            <File size={12} className="text-zinc-500" />
                          )}
                          <span className={file.is_dir ? 'font-semibold' : ''}>{file.name}</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-zinc-500">{formatSize(file.size)}</td>
                      <td className="py-1.5 px-3 text-zinc-500">{formatTime(file.mtime)}</td>
                      <td className="py-1.5 px-3 text-right">
                        {!file.is_dir && (
                          <button
                            onClick={(e) => handleDownload(file, e)}
                            disabled={!!transferringFile}
                            className="p-1 hover:bg-surface-3 rounded text-zinc-500 hover:text-brand-light transition disabled:opacity-50 cursor-pointer"
                            title="Download file to local machine"
                          >
                            <Download size={11} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
