import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CONTROL_ACTIONS,
  createRpcId,
  decodeBase64Bytes,
  parsePairingUrl,
  shouldSubmitPromptKey,
  terminalWriteText,
  toWebSocketUrl,
  validateSessionWrite,
  type ControlKey,
} from '../../../src/relayProtocol';
import { RemoteTerminal } from './RemoteTerminal';

type Tab = 'sessions' | 'files' | 'git' | 'settings';

type Workspace = { id: string; name: string; path: string };
type Session = {
  id: string;
  name?: string | null;
  agentType: string;
  cwd: string;
  status: string;
  workspaceId?: string | null;
  workspaceName?: string | null;
  running: boolean;
};
type FileEntry = { name: string; path: string; isDir: boolean; size: number };
type GitFile = { path: string; status: string; staged: boolean };
type GitCommit = { hash: string; author: string; date: string; message: string };

type Frame = Record<string, unknown>;
type TerminalApi = { write: (text: string) => void; reset: () => void; fit: () => void };

const DEFAULT_PAIR_HINT = 'Paste a TDE pairing URL from Settings → Remote Control.';

export function App() {
  const pairing = useMemo(() => parsePairingFromLocation(), []);
  const [relayUrl, setRelayUrl] = useState(pairing?.relayUrl ?? '');
  const [roomId, setRoomId] = useState(pairing?.roomId ?? '');
  const [token, setToken] = useState(pairing?.token ?? '');
  const [pasteUrl, setPasteUrl] = useState('');
  const [connected, setConnected] = useState(false);
  const [desktopOnline, setDesktopOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('sessions');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [filePath, setFilePath] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [gitFiles, setGitFiles] = useState<GitFile[]>([]);
  const [gitBranch, setGitBranch] = useState('');
  const [gitDiff, setGitDiff] = useState('');
  const [gitCommits, setGitCommits] = useState<GitCommit[]>([]);
  const [expandedCommit, setExpandedCommit] = useState('');
  const [commitFiles, setCommitFiles] = useState<GitFile[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef(new Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }>());
  const sessionIdRef = useRef('');
  const terminalRef = useRef<TerminalApi | null>(null);
  const replayQueueRef = useRef<string[]>([]);
  const replayingRef = useRef(false);
  const filePreviewUrlRef = useRef('');
  const handleFrameRef = useRef<(frame: Frame) => void>(() => {});
  const [resuming, setResuming] = useState(false);
  const [filePreviewUrl, setFilePreviewUrl] = useState('');
  sessionIdRef.current = sessionId;

  const workspace = workspaces.find((item) => item.id === workspaceId) ?? workspaces[0];
  const activeSession = sessions.find((item) => item.id === sessionId);

  useEffect(() => {
    if (roomId && token && relayUrl) {
      connect();
    }
    return () => {
      disconnect();
      replaceFilePreviewUrl();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function writeToTerminal(session: string, text: string) {
    if (session !== sessionIdRef.current || !text) {
      return;
    }
    if (replayingRef.current || !terminalRef.current) {
      replayQueueRef.current.push(text);
      return;
    }
    terminalRef.current.write(text);
  }

  function flushReplayQueue() {
    const queued = replayQueueRef.current;
    replayQueueRef.current = [];
    for (const chunk of queued) {
      terminalRef.current?.write(chunk);
    }
  }

  function connect(next = { relayUrl, roomId, token }) {
    disconnect();
    if (!next.relayUrl || !next.roomId || !next.token) {
      return;
    }
    setError(null);
    const ws = new WebSocket(toWebSocketUrl(next.relayUrl, next.roomId));
    socketRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'hello', role: 'browser', token: next.token }));
    };
    ws.onmessage = (event) => {
      handleFrameRef.current(JSON.parse(String(event.data)) as Frame);
    };
    ws.onerror = () => setError('WebSocket error');
    ws.onclose = (event) => {
      setConnected(false);
      if (event.reason) {
        setError(event.reason);
      }
    };
  }

  function disconnect() {
    socketRef.current?.close();
    socketRef.current = null;
    setConnected(false);
    for (const pending of pendingRef.current.values()) {
      pending.reject(new Error('disconnected'));
    }
    pendingRef.current.clear();
  }

  function handleFrame(frame: Frame) {
    if (frame.type === 'hello_ok') {
      setConnected(true);
      setDesktopOnline(Boolean(frame.desktopOnline));
      void refreshAll();
      return;
    }
    if (frame.type === 'hello_err') {
      setError(String(frame.error || 'pairing failed'));
      return;
    }
    if (frame.type === 'presence') {
      setDesktopOnline(Boolean(frame.desktopOnline));
      return;
    }
    if (frame.type === 'revoke') {
      setError('This room was revoked on the desktop.');
      disconnect();
      return;
    }
    if (frame.type === 'stream' && typeof frame.sessionId === 'string' && typeof frame.dataB64 === 'string') {
      writeToTerminal(frame.sessionId, terminalWriteText(decodeBase64Bytes(frame.dataB64)));
      return;
    }
    if ((frame.type === 'rpc_res' || frame.type === 'rpc_err') && typeof frame.id === 'string') {
      const pending = pendingRef.current.get(frame.id);
      if (!pending) {
        return;
      }
      pendingRef.current.delete(frame.id);
      if (frame.type === 'rpc_err') {
        pending.reject(new Error(String(frame.error || 'rpc failed')));
      } else {
        pending.resolve(frame.result);
      }
    }
  }
  handleFrameRef.current = handleFrame;

  function replaceFilePreviewUrl(next = '') {
    if (filePreviewUrlRef.current) {
      URL.revokeObjectURL(filePreviewUrlRef.current);
    }
    filePreviewUrlRef.current = next;
    setFilePreviewUrl(next);
  }

  function markSessionRunning(id: string) {
    setSessions((prev) => prev.map((session) => (
      session.id === id ? { ...session, running: true, status: 'active' } : session
    )));
  }

  async function ensureSessionReady(id: string, alreadyRunning = false) {
    if (!id) {
      return false;
    }
    if (alreadyRunning) {
      return true;
    }
    setResuming(true);
    try {
      await rpc('resume_session', { sessionId: id, rows: 24, cols: 80 });
      markSessionRunning(id);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setResuming(false);
    }
  }

  function rpc(method: string, params: Record<string, unknown> = {}) {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('not connected'));
    }
    const id = createRpcId();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRef.current.delete(id);
        reject(new Error('rpc timeout'));
      }, 60000);
      pendingRef.current.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      ws.send(JSON.stringify({ type: 'rpc_req', id, method, params }));
    });
  }

  async function refreshAll() {
    try {
      const wsResult = await rpc('list_workspaces') as { workspaces: Workspace[] };
      setWorkspaces(wsResult.workspaces || []);
      const nextWorkspace = workspaceId || wsResult.workspaces?.[0]?.id || '';
      setWorkspaceId(nextWorkspace);
      const sessionResult = await rpc('list_sessions', nextWorkspace ? { workspaceId: nextWorkspace } : {}) as { sessions: Session[] };
      const nextSessions = sessionResult.sessions || [];
      setSessions(nextSessions);
      const running = nextSessions.find((item) => item.running) || nextSessions[0];
      if (running) {
        await selectSession(running.id, nextSessions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function selectSession(id: string, list = sessions) {
    setSessionId(id);
    sessionIdRef.current = id;
    const selected = list.find((item) => item.id === id);
    await loadHistory(id, selected?.running ?? false);
    if (selected && !selected.running) {
      await ensureSessionReady(id, false);
    }
  }

  async function loadHistory(id: string, running = true) {
    replayingRef.current = true;
    replayQueueRef.current = [];
    terminalRef.current?.reset();
    try {
      const result = await rpc('get_session_history', { sessionId: id }) as { dataB64?: string };
      if (result.dataB64 && id === sessionIdRef.current) {
        const text = terminalWriteText(decodeBase64Bytes(result.dataB64));
        if (terminalRef.current) {
          terminalRef.current.write(text);
        } else {
          replayQueueRef.current.unshift(text);
        }
      }
    } catch (err) {
      if (running) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      replayingRef.current = false;
      flushReplayQueue();
      terminalRef.current?.fit();
    }
  }

  async function sendPrompt() {
    const problem = validateSessionWrite(sessionId);
    if (problem) {
      setError(problem);
      return;
    }
    if (!prompt.trim()) {
      return;
    }
    setSending(true);
    try {
      const ready = await ensureSessionReady(sessionId, activeSession?.running ?? false);
      if (!ready) {
        return;
      }
      await rpc('write_input', { sessionId, text: prompt });
      setPrompt('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  async function sendControl(key: ControlKey) {
    const problem = validateSessionWrite(sessionId);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      const ready = await ensureSessionReady(sessionId, activeSession?.running ?? false);
      if (!ready) {
        return;
      }
      await rpc('send_control', { sessionId, key });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function sendRaw(data: string) {
    const target = sessionIdRef.current;
    const running = sessions.find((item) => item.id === target)?.running ?? activeSession?.running ?? false;
    if (validateSessionWrite(target)) {
      return;
    }
    try {
      const ready = await ensureSessionReady(target, running);
      if (!ready) {
        return;
      }
      await rpc('write_bytes', { sessionId: target, text: data });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function resizeSession(size: { cols: number; rows: number }) {
    const target = sessionIdRef.current;
    if (!target || !size.cols || !size.rows) {
      return;
    }
    try {
      await rpc('resize_session', { sessionId: target, cols: size.cols, rows: size.rows });
    } catch {
      // resize is best-effort while a session is starting
    }
  }

  async function openWorkspace(id: string) {
    setWorkspaceId(id);
    const selected = workspaces.find((item) => item.id === id);
    const sessionResult = await rpc('list_sessions', { workspaceId: id }) as { sessions: Session[] };
    const nextSessions = sessionResult.sessions || [];
    setSessions(nextSessions);
    if (!nextSessions.some((session) => session.id === sessionIdRef.current)) {
      const pick = nextSessions.find((session) => session.running) || nextSessions[0];
      if (pick) {
        await selectSession(pick.id, nextSessions);
      } else {
        setSessionId('');
        sessionIdRef.current = '';
      }
    }
    if (selected) {
      setFilePath(selected.path);
      await loadWorkspaceFiles(selected.path);
      await loadGit(selected.path);
    }
  }

  async function loadWorkspaceFiles(path: string) {
    const listed = await rpc('list_files', { path }) as { entries: FileEntry[] };
    setFiles(listed.entries || []);
  }

  async function loadGit(path: string) {
    try {
      const status = await rpc('git_status', { cwd: path }) as { branch?: string; files?: GitFile[] };
      setGitBranch(status.branch || '');
      setGitFiles(status.files || []);
      const log = await rpc('git_log', { cwd: path }) as { commits?: GitCommit[] };
      setGitCommits(log.commits || []);
      setExpandedCommit('');
      setCommitFiles([]);
      setGitDiff('');
    } catch (err) {
      setGitBranch('no-git');
      setGitFiles([]);
      setGitCommits([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function openFile(entry: FileEntry) {
    if (entry.isDir) {
      replaceFilePreviewUrl();
      setFilePath(entry.path);
      const listed = await rpc('list_files', { path: entry.path }) as { entries: FileEntry[] };
      setFiles(listed.entries || []);
      setFileContent('');
      return;
    }
    const result = await rpc('read_file', { path: entry.path }) as {
      content?: string;
      isBinary?: boolean;
      mime?: string;
      dataB64?: string;
    };
    if (result.dataB64 && result.mime === 'application/pdf') {
      const bytes = decodeBase64Bytes(result.dataB64);
      const copy = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(copy).set(bytes);
      replaceFilePreviewUrl(URL.createObjectURL(new Blob([copy], { type: 'application/pdf' })));
      setFileContent('');
      return;
    }
    replaceFilePreviewUrl();
    setFileContent(result.isBinary ? '[binary file]' : (result.content || ''));
  }

  async function openDiff(path: string) {
    if (!workspace) {
      return;
    }
    const result = await rpc('git_diff', { cwd: workspace.path, path }) as { diff?: string };
    setGitDiff(result.diff || '');
  }

  async function openCommit(hash: string) {
    if (!workspace) {
      return;
    }
    if (expandedCommit === hash) {
      setExpandedCommit('');
      setCommitFiles([]);
      return;
    }
    setExpandedCommit(hash);
    try {
      const result = await rpc('git_commit_files', { cwd: workspace.path, hash }) as { files?: GitFile[] };
      setCommitFiles(result.files || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function applyPastedUrl() {
    const parsed = parsePairingUrl(pasteUrl);
    if (!parsed) {
      setError('Could not parse that pairing URL.');
      return;
    }
    setRelayUrl(parsed.relayUrl);
    setRoomId(parsed.roomId);
    setToken(parsed.token);
    window.history.replaceState(null, '', `/r/${parsed.roomId}#t=${parsed.token}`);
    connect(parsed);
  }

  if (!roomId || !token) {
    return (
      <div className="app">
        <div className="topbar"><strong>TDE Remote</strong></div>
        <div className="main">
          <div className="card">
            <p className="dim">{DEFAULT_PAIR_HINT}</p>
            <textarea rows={3} value={pasteUrl} onChange={(event) => setPasteUrl(event.target.value)} placeholder="https://…/r/room#t=token" />
            {error && <p className="error">{error}</p>}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="primary" onClick={applyPastedUrl}>Connect</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <strong>TDE Remote</strong>
        <span className={`badge ${connected && desktopOnline ? 'ok' : 'err'}`}>
          {connected ? (desktopOnline ? 'desktop online' : 'desktop offline') : 'disconnected'}
        </span>
      </div>
      <div className="main">
        {error && <div className="card error">{error}</div>}
        {tab === 'sessions' && (
          <div className="session-pane">
            <div className="selectors">
              <label>
                <span>Project</span>
                <select value={workspaceId} onChange={(event) => void openWorkspace(event.target.value)}>
                  {workspaces.length === 0 && <option value="">No projects</option>}
                  {workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label>
                <span>Session</span>
                <select
                  value={sessionId}
                  onChange={(event) => {
                    if (event.target.value) {
                      void selectSession(event.target.value);
                    }
                  }}
                >
                  {sessions.length === 0 && <option value="">No sessions</option>}
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.name || session.agentType}{session.running ? ' · running' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {sessionId ? (
              <RemoteTerminal
                sessionId={sessionId}
                disabled={!activeSession?.running || resuming}
                onData={(data) => void sendRaw(data)}
                onResize={(size) => void resizeSession(size)}
                onReady={(api) => {
                  terminalRef.current = api;
                  flushReplayQueue();
                  api.fit();
                }}
              />
            ) : (
              <div className="terminal-host dim" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Waiting for a session…
              </div>
            )}
            <div className="actions">
              {CONTROL_ACTIONS.map((item) => (
                <button key={item.key} className="ghost" onClick={() => void sendControl(item.key)}>{item.label}</button>
              ))}
            </div>
            <div className="row">
              <input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={
                  resuming
                    ? 'Resuming session…'
                    : activeSession?.running
                      ? 'Send a prompt'
                      : 'Session will resume when you send'
                }
                disabled={sending || resuming}
                onKeyDown={(event) => {
                  if (shouldSubmitPromptKey(event)) {
                    event.preventDefault();
                    void sendPrompt();
                  }
                }}
              />
              <button className="primary" disabled={sending || resuming} onClick={() => void sendPrompt()}>
                {sending ? 'Sending' : resuming ? 'Resuming' : 'Send'}
              </button>
            </div>
          </div>
        )}
        {tab === 'files' && (
          <div className="card">
            <div className="dim code">{filePath || workspace?.path || 'Select a workspace'}</div>
            {files.map((entry) => (
              <button key={entry.path} className="list-item" onClick={() => void openFile(entry)}>
                {entry.isDir ? '📁' : '📄'} {entry.name}
              </button>
            ))}
            {filePreviewUrl && (
              <object data={filePreviewUrl} type="application/pdf" className="file-preview-frame">
                <iframe title="PDF preview" src={filePreviewUrl} className="file-preview-frame" />
              </object>
            )}
            {fileContent && <pre className="stream">{fileContent}</pre>}
          </div>
        )}
        {tab === 'git' && (
          <div className="card">
            <div className="dim">branch {gitBranch || 'unknown'}</div>
            <div className="section-title">Changes</div>
            {gitFiles.map((file) => (
              <button key={`${file.path}-${file.staged ? 's' : 'u'}`} className="list-item" onClick={() => void openDiff(file.path)}>
                {file.status} {file.path}{file.staged ? ' (staged)' : ''}
              </button>
            ))}
            {gitFiles.length === 0 && <p className="dim">No uncommitted changes.</p>}
            {gitDiff && (
              <pre className="stream">
                {gitDiff.split('\n').map((line, index) => (
                  <div key={index} className={line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-del' : ''}>{line}</div>
                ))}
              </pre>
            )}
            <div className="section-title">Commit history</div>
            {gitCommits.map((commit) => (
              <div key={commit.hash}>
                <button
                  className={`list-item ${expandedCommit === commit.hash ? 'active' : ''}`}
                  onClick={() => void openCommit(commit.hash)}
                >
                  <div>{commit.message}</div>
                  <div className="dim">{commit.hash.slice(0, 8)} · {commit.author} · {commit.date}</div>
                </button>
                {expandedCommit === commit.hash && (
                  <div className="commit-files">
                    {commitFiles.length === 0 && <p className="dim">No files in this commit.</p>}
                    {commitFiles.map((file) => (
                      <div key={file.path} className="dim code commit-file">{file.status} {file.path}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {gitCommits.length === 0 && <p className="dim">No commits yet.</p>}
          </div>
        )}
        {tab === 'settings' && (
          <div className="card">
            <p className="dim">Relay: {relayUrl}</p>
            <p className="dim">Room: {roomId}</p>
            <div className="row">
              <button className="ghost" onClick={() => void refreshAll()}>Refresh</button>
              <button className="danger" onClick={disconnect}>Disconnect</button>
            </div>
          </div>
        )}
      </div>
      <div className="bottomnav">
        {(['sessions', 'files', 'git', 'settings'] as Tab[]).map((item) => (
          <button
            key={item}
            className={tab === item ? 'active' : ''}
            onClick={() => {
              setTab(item);
              if (item === 'files' || item === 'git') {
                void openWorkspace(workspaceId || workspaces[0]?.id || '');
              }
            }}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function parsePairingFromLocation() {
  const fromUrl = parsePairingUrl(window.location.href);
  if (fromUrl) {
    return fromUrl;
  }
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const token = hash.get('t') || '';
  const parts = window.location.pathname.split('/').filter(Boolean);
  const roomId = parts[0] === 'r' ? parts[1] : '';
  if (!roomId || !token) {
    return null;
  }
  return {
    relayUrl: `${window.location.protocol}//${window.location.host}`,
    roomId,
    token,
  };
}
