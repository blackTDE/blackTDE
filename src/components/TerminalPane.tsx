import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import {
  restoredTerminalViewportLine,
  terminalScrollOffset,
  restoreTerminal,
  isSpuriousTerminalQueryResponse,
} from '../terminalRestore';
import { isLocalShell, shellResumeMessage, type ShellResumeKind } from '../shellRestore';
import {
  applyDownloadProgress,
  downloadPercent,
  formatBytes,
  type DownloadProgress,
  type DownloadTransfer,
} from '../sftpTransfers';
import { canNavigateUp, resolveSftpPath } from '../sftpUtils';
import { handleTerminalKeyEvent } from '../terminalKeyHandler';
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
  ArrowLeft,
  FolderOpen,
  CheckCircle2,
  XCircle,
  X,
} from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

interface TerminalPaneProps {
  sessionId: string;
  isVisible: boolean;
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({ sessionId, isVisible }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isVisibleRef = useRef(isVisible);
  const fitAndResizeRef = useRef<((resize?: boolean) => Promise<void>) | null>(null);
  isVisibleRef.current = isVisible;
  const [sftpHeight, setSftpHeight] = useState(180);
  const [isCollapsed, setIsCollapsed] = useState(true);

  const session = useWorkspaceStore((state) => state.sessions[sessionId]);
  const sshHost = session?.ssh_host;

  useEffect(() => {
    if (isVisible) {
      void fitAndResizeRef.current?.();
      const timer = setTimeout(() => {
        void fitAndResizeRef.current?.();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isVisible, isCollapsed, sftpHeight]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize fresh xterm instance with dark theme and Nerd Fonts to fix messy code glyphs
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'underline',
      fontSize: 13,
      fontFamily: "'MesloLGS NF', 'Meslo LGS NF', 'MesloLGS Nerd Font', 'JetBrainsMono Nerd Font', 'JetBrains Mono Nerd Font', 'FiraCode Nerd Font', 'Fira Code Nerd Font', 'Hack Nerd Font', 'Symbols Nerd Font Mono', 'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
      allowProposedApi: true,
      mouseEventsRequireAlt: true,
      macOptionClickForcesSelection: true,
      rightClickSelectsWord: true,
      scrollback: 5000,
      theme: {
        background: '#0a0a0a',
        foreground: '#fafafa',
        cursor: '#e5e5e5',
        selectionBackground: 'rgba(249, 115, 22, 0.35)',
        selectionInactiveBackground: 'rgba(249, 115, 22, 0.2)',
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

    // Attach custom keyboard shortcut handler for Copy/Paste/SelectAll/Clear in terminal
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      return handleTerminalKeyEvent(event, {
        hasSelection: () => term.hasSelection(),
        getSelection: () => term.getSelection(),
        paste: (text: string) => term.paste(text),
        selectAll: () => term.selectAll(),
        clear: () => term.clear(),
        writeClipboard: async (text: string) => {
          try {
            await invoke('write_clipboard_text', { text });
          } catch {
            await navigator.clipboard.writeText(text);
          }
        },
        readClipboard: async () => {
          try {
            return await invoke<string>('read_clipboard_text');
          } catch {
            if (navigator?.clipboard?.readText) {
              return await navigator.clipboard.readText();
            }
            return '';
          }
        },
      });
    });
    
    // Initial measure fit
    try {
      fitAddon.fit();
    } catch (e) {
      console.error('Fit error on mount:', e);
    }

    let isReady = false;
    let isDisposed = false;
    let isReplaying = false;
    const incomingQueue: Uint8Array[] = [];
    const localShell = isLocalShell(session?.agentType, session?.ssh_host);

    const flushIncoming = () => {
      while (incomingQueue.length > 0) {
        const chunk = incomingQueue.shift();
        if (chunk) term.write(chunk);
      }
    };

    const fitAndResize = async (resize = true) => {
      if (isDisposed || !isVisibleRef.current) return;
      try {
        const scrollOffset = terminalScrollOffset(
          term.buffer.active.baseY,
          term.buffer.active.viewportY,
        );
        fitAddon.fit();
        term.scrollToLine(restoredTerminalViewportLine(term.buffer.active.baseY, scrollOffset));
        term.refresh(0, Math.max(0, term.rows - 1));
        if (resize && term.rows > 2 && term.cols > 2) {
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
    fitAndResizeRef.current = fitAndResize;

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
        reset: () => {
          if (!isDisposed) term.reset();
        },
        replayHistory: async () => {
          const history = await invoke<number[]>('get_session_history', { id: sessionId });
          if (!isDisposed && history && history.length > 0) {
            isReplaying = true;
            await new Promise<void>((resolve) => {
              term.write(new Uint8Array(history), () => {
                isReplaying = false;
                resolve();
              });
            });
          }
        },
        resume: async (rows = term.rows, cols = term.cols) => {
          try {
            if (localShell) {
              const outcome = await invoke<{ kind: ShellResumeKind }>('resume_terminated_session', {
                id: sessionId,
                rows,
                cols,
              });
              if (!isDisposed) {
                term.write(`\r\n\x1b[1;33m[${shellResumeMessage(outcome.kind)}]\x1b[0m\r\n`);
              }
              return;
            }

            let displayId = 'None';
            try {
              displayId = await invoke<string | null>('get_remote_session_id', { id: sessionId }) || displayId;
            } catch (error) {
              console.error('Failed to get remote session id:', error);
            }
            if (!isDisposed) {
              term.write(`\x1b[1;33m[Session disconnected - resuming remote ID: ${displayId}]\x1b[0m\r\n`);
            }
            await invoke('resume_terminated_session', { id: sessionId, rows, cols });
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
        onLookupError: (error) => console.error('Failed to query active session list:', error),
      }).catch((error) => {
        console.error('Failed to restore terminal:', error);
        if (!isDisposed) {
          isReady = true;
          flushIncoming();
        }
      });
    });

    const writeInput = (data: string) => {
      if (!isReady || isReplaying || isSpuriousTerminalQueryResponse(data)) {
        return;
      }
      const bytes = new TextEncoder().encode(data);
      invoke('write_to_session', { id: sessionId, data: Array.from(bytes) }).catch((err) => {
        console.error('Failed to write key to session:', err);
      });
    };

    // Handle user keyboard/mouse input
    const dataDisposer = term.onData(writeInput);

    // Resize tracking
    const resizeObserver = new ResizeObserver(() => {
      void fitAndResize();
    });

    resizeObserver.observe(containerRef.current);

    // Initial resize sync (delayed slightly to allow DOM bounding box to stabilize)
    const resizeTimeout = setTimeout(() => {
      void fitAndResize();
    }, 100);

    // Copy selection to clipboard on right click if text is selected
    const element = containerRef.current;
    const handleContextMenu = () => {
      if (term.hasSelection()) {
        const text = term.getSelection();
        if (text) {
          navigator.clipboard.writeText(text).catch(console.error);
        }
      }
    };
    element.addEventListener('contextmenu', handleContextMenu);

    return () => {
      isDisposed = true;
      fitAndResizeRef.current = null;
      clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
      dataDisposer.dispose();
      element.removeEventListener('contextmenu', handleContextMenu);
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
      <div className="w-full h-full min-h-0 bg-[#0a0a0a] overflow-hidden select-text">
        <div ref={containerRef} className="w-full h-full min-h-0 select-text" />
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-0 bg-[#0a0a0a] flex flex-col overflow-hidden">
      {/* Upper Panel: Terminal Console */}
      <div className="flex-grow min-h-0 relative select-text">
        <div ref={containerRef} className="w-full h-full min-h-0 select-text" />
      </div>

      {/* Resizer Handle */}
      {!isCollapsed && (
        <div
          onMouseDown={handleMouseDown}
          className="h-1 bg-surface-3 hover:bg-brand cursor-row-resize transition duration-150 relative z-10 border-y border-surface-2/40 select-none"
        />
      )}

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
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<DownloadTransfer[]>([]);
  const [showDownloads, setShowDownloads] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<DownloadProgress>('sftp-download-progress', ({ payload }) => {
      if (payload.host !== host) return;
      setDownloads((current) => applyDownloadProgress(current, payload));
      if (payload.status === 'completed' || payload.status === 'failed') {
        setDownloadNotice({
          error: payload.status === 'failed',
          text: payload.status === 'completed'
            ? `Downloaded ${payload.file_name}`
            : payload.error || `Download failed: ${payload.file_name}`,
        });
      }
    }).then((dispose) => { unlisten = dispose; });
    return () => unlisten?.();
  }, [host]);

  useEffect(() => {
    if (!downloadNotice) return;
    const timer = window.setTimeout(() => setDownloadNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [downloadNotice]);

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
    if (!isCollapsed) {
      loadDir(remoteCwd);
    }
  }, [remoteCwd, host, isCollapsed]);

  const handleNavigate = (dirName: string) => {
    if (loading) return;
    const nextPath = resolveSftpPath(remoteCwd, dirName);
    if (nextPath !== remoteCwd) {
      setRemoteCwd(nextPath);
    }
  };

  const handleDownload = async (file: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const localPath = await invoke<string | null>('select_local_download_destination', { fileName: file.name });
      if (!localPath) return;

      const remotePath = !remoteCwd ? file.name : `${remoteCwd}/${file.name}`;
      const transferId = crypto.randomUUID();
      const queued: DownloadTransfer = {
        transfer_id: transferId,
        host,
        file_name: file.name,
        local_path: localPath,
        transferred_bytes: 0,
        total_bytes: file.size,
        speed_bytes_per_second: 0,
        status: 'queued',
        error: null,
        started_at: Date.now(),
      };
      setDownloads((current) => [queued, ...current].slice(0, 20));
      setShowDownloads(true);
      void invoke('sftp_download_file', {
        host,
        remotePath,
        localPath,
        transferId,
        fileName: file.name,
        totalBytes: file.size,
      }).catch((err) => {
        const failed: DownloadProgress = { ...queued, status: 'failed', error: String(err) };
        setDownloads((current) => applyDownloadProgress(current, failed));
        setDownloadNotice({ error: true, text: `Download failed: ${file.name}` });
      });
    } catch (err: any) {
      setDownloadNotice({ error: true, text: `Download failed: ${err}` });
    }
  };

  const handleUpload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (uploadingFile) return;
    try {
      const localPath = await invoke<string | null>('select_local_file_to_upload');
      if (!localPath) return;

      const fileName = localPath.split(/[/\\]/).pop() || 'uploaded_file';
      
      setUploadingFile(fileName);

      const remotePath = !remoteCwd ? fileName : `${remoteCwd}/${fileName}`;
      await invoke('sftp_upload_file', { host, localPath, remotePath });
      void loadDir(remoteCwd);
      setDownloadNotice({ error: false, text: `Uploaded ${fileName}` });
    } catch (err: any) {
      setDownloadNotice({ error: true, text: `Upload failed: ${err}` });
    } finally {
      setUploadingFile(null);
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
      className="relative w-full bg-[#0d0d0d] flex flex-col min-h-0 border-t border-surface-3 transition-[height] duration-200"
    >
      {/* Header Row */}
      <div
        onClick={() => {
          if (isCollapsed) {
            setIsCollapsed(false);
          }
        }}
        className={`flex items-center justify-between px-3 py-1 bg-surface-1 border-b border-surface-2 text-[10px] font-mono select-none h-[26px] ${isCollapsed ? 'cursor-pointer hover:bg-surface-2/60' : ''}`}
      >
        <div className="flex items-center space-x-2 truncate">
          {!isCollapsed && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNavigate('..');
              }}
              disabled={loading || !canNavigateUp(remoteCwd)}
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded text-slate-400 hover:text-zinc-200 hover:bg-surface-2 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 cursor-pointer disabled:cursor-not-allowed shrink-0"
              title={canNavigateUp(remoteCwd) ? 'Return to parent directory (..)' : 'Already at top directory'}
            >
              <ArrowLeft size={11} />
              <span className="font-sans font-medium text-[10px]">Back</span>
            </button>
          )}
          <FolderOpen size={12} className="text-brand-light shrink-0" />
          <span className="text-[10px] font-bold text-zinc-300 shrink-0">SFTP ({host})</span>
          {!isCollapsed ? (
            <span className="text-zinc-500 font-semibold truncate" title={remoteCwd || 'Home'}>
              {remoteCwd ? `/ ${remoteCwd}` : '/ (Home)'}
            </span>
          ) : (
            <span className="text-zinc-500 text-[10px] truncate">
              (Click to connect and open SFTP)
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2.5">
          {uploadingFile && (
            <div className="flex items-center space-x-1 text-brand-light font-semibold animate-pulse">
              <Loader2 size={10} className="animate-spin" />
              <span>Uploading {uploadingFile}...</span>
            </div>
          )}
          {!isCollapsed && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDownloads((visible) => !visible);
              }}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition ${showDownloads ? 'bg-brand/15 text-brand-light' : 'text-slate-400 hover:text-zinc-200'}`}
              title={showDownloads ? 'Hide downloads' : 'Show downloads'}
            >
              <Download size={11} />
              <span>{downloads.filter((item) => item.status === 'queued' || item.status === 'running').length || downloads.length}</span>
            </button>
          )}
          {!isCollapsed && (
            <>
              <button
                onClick={(e) => handleUpload(e)}
                disabled={!!uploadingFile}
                className="flex items-center space-x-1 text-slate-400 hover:text-brand-light transition disabled:opacity-50 cursor-pointer"
                title="Upload file to remote directory"
              >
                <Upload size={11} />
                <span>Upload</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  loadDir(remoteCwd);
                }}
                disabled={loading}
                className="text-slate-400 hover:text-zinc-200 transition cursor-pointer disabled:opacity-50"
                title="Refresh remote files list"
              >
                <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              </button>
            </>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
            className="text-slate-500 hover:text-zinc-350 transition cursor-pointer"
            title={isCollapsed ? 'Expand SFTP panel' : 'Collapse SFTP panel'}
          >
            {isCollapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {showDownloads && (
        <div className="absolute bottom-[30px] right-2 z-50 flex max-h-64 w-[min(360px,calc(100%-16px))] flex-col overflow-hidden rounded-lg border border-surface-3 bg-[#111]/95 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-surface-3 px-3 py-2 font-mono text-[10px]">
            <span className="font-bold text-zinc-200">Downloads</span>
            <div className="flex items-center gap-2">
              {downloads.every((item) => item.status === 'completed' || item.status === 'failed') && downloads.length > 0 && (
                <button onClick={() => setDownloads([])} className="text-zinc-500 hover:text-zinc-300">Clear</button>
              )}
              <button onClick={() => setShowDownloads(false)} className="text-zinc-500 hover:text-zinc-200" aria-label="Hide downloads"><X size={12} /></button>
            </div>
          </div>
          <div className="overflow-y-auto">
            {downloads.length === 0 ? (
              <div className="px-3 py-5 text-center font-mono text-[10px] text-zinc-600">No downloads yet</div>
            ) : downloads.map((transfer) => {
              const percent = downloadPercent(transfer);
              const active = transfer.status === 'queued' || transfer.status === 'running';
              return (
                <div key={transfer.transfer_id} className="border-b border-surface-2/70 px-3 py-2 last:border-0">
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    {active ? <Loader2 size={11} className="shrink-0 animate-spin text-brand-light" /> : transfer.status === 'completed' ? <CheckCircle2 size={11} className="shrink-0 text-emerald-400" /> : <XCircle size={11} className="shrink-0 text-rose-400" />}
                    <span className="min-w-0 flex-1 truncate text-zinc-300" title={transfer.local_path}>{transfer.file_name}</span>
                    <span className="shrink-0 text-zinc-500">{active ? `${percent}%` : transfer.status}</span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded bg-surface-3">
                    <div className={`h-full transition-[width] duration-200 ${transfer.status === 'failed' ? 'bg-rose-500' : 'bg-brand'}`} style={{ width: `${transfer.status === 'completed' ? 100 : percent}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between font-mono text-[9px] text-zinc-600">
                    <span>{formatBytes(transfer.transferred_bytes)} / {transfer.total_bytes ? formatBytes(transfer.total_bytes) : 'unknown'}</span>
                    <span>{active ? `${formatBytes(transfer.speed_bytes_per_second)}/s` : transfer.error || ''}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {downloadNotice && (
        <div role={downloadNotice.error ? 'alert' : 'status'} aria-live="polite" className={`fixed bottom-4 right-4 z-[100] max-w-sm rounded border px-3 py-2 font-mono text-[10px] shadow-2xl ${downloadNotice.error ? 'border-rose-500/40 bg-rose-950/95 text-rose-200' : 'border-emerald-500/30 bg-[#102019]/95 text-emerald-200'}`}>
          {downloadNotice.text}
        </div>
      )}

      {/* Directory Content Area */}
      {!isCollapsed && (
        <div className="relative flex-grow overflow-y-auto text-[11px] font-mono text-zinc-350 bg-[#070707] min-h-0 select-none font-sans">
          {loading && files.length === 0 ? (
            <div className="w-full py-8 flex flex-col items-center justify-center text-zinc-500 space-y-2">
              <Loader2 size={16} className="animate-spin text-brand" />
              <span>Reading remote folder...</span>
            </div>
          ) : error ? (
            <div className="w-full p-4 flex flex-col items-center justify-center text-rose-400 space-y-2 text-center">
              <span className="font-bold">Error reading remote files:</span>
              <p className="text-[10px] text-zinc-400 max-w-xs">{error}</p>
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={() => loadDir(remoteCwd)}
                  disabled={loading}
                  className="bg-surface-3 border border-surface-4 text-zinc-300 px-3 py-1 rounded hover:bg-surface-2 transition text-[10px] cursor-pointer"
                >
                  Retry Connection
                </button>
                {canNavigateUp(remoteCwd) && (
                  <button
                    onClick={() => handleNavigate('..')}
                    disabled={loading}
                    className="bg-surface-3 border border-surface-4 text-zinc-300 px-3 py-1 rounded hover:bg-surface-2 transition text-[10px] cursor-pointer"
                  >
                    Return to Parent
                  </button>
                )}
                {remoteCwd && (
                  <button
                    onClick={() => setRemoteCwd('')}
                    disabled={loading}
                    className="bg-surface-3 border border-surface-4 text-zinc-300 px-3 py-1 rounded hover:bg-surface-2 transition text-[10px] cursor-pointer"
                  >
                    Return to Home
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="relative w-full min-h-full">
              {loading && (
                <div className="sticky top-0 z-20 flex items-center justify-center gap-1.5 bg-brand/15 text-brand-light py-1 text-[10px] font-mono border-b border-brand/30 backdrop-blur">
                  <Loader2 size={11} className="animate-spin" />
                  <span>Opening remote directory...</span>
                </div>
              )}
              <table className={`w-full text-left border-collapse font-mono ${loading ? 'pointer-events-none opacity-50' : ''}`}>
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
                      onClick={() => !loading && handleNavigate('..')}
                      className={`border-b border-surface-2/30 transition ${
                        loading ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface-2/20 cursor-pointer'
                      }`}
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
                        onClick={() => !loading && file.is_dir && handleNavigate(file.name)}
                        className={`border-b border-surface-2/30 transition ${
                          loading
                            ? 'cursor-not-allowed opacity-60'
                            : file.is_dir
                            ? 'cursor-pointer hover:bg-surface-2/30 text-zinc-200'
                            : 'text-zinc-400'
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
                              disabled={loading}
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
            </div>
          )}
        </div>
      )}
    </div>
  );
};
