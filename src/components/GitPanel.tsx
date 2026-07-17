import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GitBranch, RefreshCw, Plus, Minus, Send, ChevronDown, ChevronRight, FileText, Clock, User, Download, Upload } from 'lucide-react';
import { useWorkspaceStore, GitFileStatus } from '../store/workspaceStore';

interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

interface GitUser {
  name: string;
  email: string;
}

interface GitRemoteStatus {
  remote_name: string;
  remote_url: string;
  upstream: string;
  ahead: number;
  behind: number;
}

export const GitPanel: React.FC = () => {
  const { gitFiles, setGitFiles, gitBranch, setGitBranch, activeWorkspace, openFile } = useWorkspaceStore();
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [gitUser, setGitUser] = useState<GitUser>({ name: '', email: '' });
  const [remoteStatus, setRemoteStatus] = useState<GitRemoteStatus>({ remote_name: '', remote_url: '', upstream: '', ahead: 0, behind: 0 });
  const [activeOperation, setActiveOperation] = useState<string | null>(null);
  const [operationMessage, setOperationMessage] = useState<{ error: boolean; text: string } | null>(null);

  // Git Commit History States
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [commitFiles, setCommitFiles] = useState<Record<string, GitFileStatus[]>>({});

  const workspacePath = activeWorkspace?.path || '/Users/ray/git-repo/black_tde';

  const loadGitStatus = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const [statusFiles, branchName, log, user, remote] = await Promise.all([
        invoke<GitFileStatus[]>('get_git_status', { cwd: workspacePath }),
        invoke<string>('get_git_branch', { cwd: workspacePath }),
        invoke<GitCommit[]>('get_git_commit_log', { cwd: workspacePath }),
        invoke<GitUser>('get_git_user', { cwd: workspacePath }),
        invoke<GitRemoteStatus>('get_git_remote_status', { cwd: workspacePath }),
      ]);
      setGitFiles(statusFiles);
      setGitBranch(branchName);
      setCommits(log);
      setGitUser(user);
      setRemoteStatus(remote);
    } catch (err) {
      console.error('Failed to load Git status/history:', err);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  const runGitOperation = async (command: string, label: string) => {
    if (activeOperation) return;
    setActiveOperation(command);
    setOperationMessage(null);
    try {
      const output = await invoke<string>(command, { cwd: workspacePath });
      setOperationMessage({ error: false, text: output || `${label} complete` });
      await loadGitStatus(false);
    } catch (err) {
      setOperationMessage({ error: true, text: `${label} failed: ${err}` });
    } finally {
      setActiveOperation(null);
    }
  };

  const handleStageFile = async (filePath: string) => {
    try {
      await invoke('git_stage_file', { cwd: workspacePath, filePath });
      await loadGitStatus();
    } catch (err) {
      alert('Failed to stage file: ' + err);
    }
  };

  const handleUnstageFile = async (filePath: string) => {
    try {
      await invoke('git_unstage_file', { cwd: workspacePath, filePath });
      await loadGitStatus();
    } catch (err) {
      alert('Failed to unstage file: ' + err);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) {
      alert('Please enter a commit message');
      return;
    }
    try {
      await invoke('git_commit_changes', { cwd: workspacePath, message: commitMessage });
      setCommitMessage('');
      await loadGitStatus();
      alert('Changes committed successfully!');
    } catch (err) {
      alert('Failed to commit changes: ' + err);
    }
  };

  const handleCommitClick = async (hash: string) => {
    if (expandedCommit === hash) {
      setExpandedCommit(null);
      return;
    }
    setExpandedCommit(hash);
    if (!commitFiles[hash]) {
      try {
        const files = await invoke<GitFileStatus[]>('get_git_commit_files', { cwd: workspacePath, hash });
        setCommitFiles(prev => ({ ...prev, [hash]: files }));
      } catch (err) {
        console.error('Failed to load commit files:', err);
        setCommitFiles(prev => ({ ...prev, [hash]: [] }));
      }
    }
  };

  const handleCommitFileClick = (hash: string, filePath: string) => {
    const fileName = filePath.split('/').pop() || filePath;
    openFile(`git-diff:${hash}:${filePath}`, fileName);
  };

  const handleWorkingFileClick = (filePath: string) => {
    const fileName = filePath.split('/').pop() || filePath;
    openFile(`git-diff:working:${filePath}`, fileName);
  };

  useEffect(() => {
    void loadGitStatus();
    const timer = window.setInterval(() => void loadGitStatus(false), 3000);
    return () => window.clearInterval(timer);
  }, [workspacePath]);

  const staged = gitFiles.filter(f => f.staged);
  const unstaged = gitFiles.filter(f => !f.staged);

  const getStatusColor = (status: string) => {
    switch (status.trim()) {
      case 'M':
        return 'text-amber-400';
      case 'A':
      case '??':
        return 'text-emerald-400';
      case 'D':
        return 'text-red-400';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <div className="w-full h-full bg-[#1e1e1e] rounded-lg border border-slate-700 flex flex-col overflow-hidden">
      {/* Git Header */}
      <div className="bg-[#171717] px-3 py-2 border-b border-slate-800 flex items-center justify-between select-none">
        <div className="min-w-0 font-mono">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-300">
            <GitBranch size={14} className="text-brand-light" />
            <span className="truncate">git: {gitBranch}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1 pl-5 text-[9px] text-slate-500" title={gitUser.email}>
            <User size={9} />
            <span className="truncate">{gitUser.name || 'Commit user not configured'}</span>
          </div>
        </div>
        <button
          onClick={() => void loadGitStatus()}
          disabled={isLoading}
          className="p-1 hover:bg-slate-800 text-slate-400 rounded transition"
          title="Refresh Git status"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Main content list */}
      <div className="flex-grow overflow-y-auto p-3 space-y-4">
        {/* Remote Status and Operations */}
        <div className="rounded border border-slate-800 bg-[#171717]/40 p-2 font-mono">
          {remoteStatus.remote_name ? (
            <>
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <span className="truncate font-bold text-slate-300" title={remoteStatus.remote_url}>
                  {remoteStatus.remote_name}{remoteStatus.upstream ? ` · ${remoteStatus.upstream}` : ''}
                </span>
                <span className="shrink-0 text-slate-500">
                  <span className={remoteStatus.ahead ? 'text-emerald-400' : ''}>↑{remoteStatus.ahead}</span>
                  {' '}
                  <span className={remoteStatus.behind ? 'text-amber-400' : ''}>↓{remoteStatus.behind}</span>
                </span>
              </div>
              <div className="mt-1 truncate text-[9px] text-slate-600" title={remoteStatus.remote_url}>{remoteStatus.remote_url}</div>
              <div className="mt-2 grid grid-cols-3 gap-1">
                <button type="button" onClick={() => void runGitOperation('git_fetch_remote', 'Fetch')} disabled={!!activeOperation} className="flex items-center justify-center gap-1 rounded bg-slate-800 px-1 py-1 text-[9px] text-slate-300 hover:bg-slate-700 disabled:opacity-50">
                  <RefreshCw size={10} className={activeOperation === 'git_fetch_remote' ? 'animate-spin' : ''} /> Fetch
                </button>
                <button type="button" onClick={() => void runGitOperation('git_pull_remote', 'Pull')} disabled={!!activeOperation} className="flex items-center justify-center gap-1 rounded bg-slate-800 px-1 py-1 text-[9px] text-slate-300 hover:bg-slate-700 disabled:opacity-50">
                  <Download size={10} /> Pull
                </button>
                <button type="button" onClick={() => void runGitOperation('git_push_remote', 'Push')} disabled={!!activeOperation} className="flex items-center justify-center gap-1 rounded bg-slate-800 px-1 py-1 text-[9px] text-slate-300 hover:bg-slate-700 disabled:opacity-50">
                  <Upload size={10} /> Push
                </button>
              </div>
            </>
          ) : (
            <div className="text-[10px] italic text-slate-500">No Git remote configured</div>
          )}
          {operationMessage && (
            <div className={`mt-2 break-words text-[9px] ${operationMessage.error ? 'text-rose-400' : 'text-emerald-400'}`}>
              {operationMessage.text}
            </div>
          )}
        </div>

        {/* Commit Form */}
        <div className="flex items-center space-x-2 select-none">
          <input
            type="text"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Type commit message..."
            className="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand font-mono"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCommit();
            }}
          />
          <button
            onClick={handleCommit}
            disabled={staged.length === 0 || !commitMessage.trim()}
            className={`flex items-center space-x-1 text-xs font-semibold px-2 py-1.5 rounded transition ${
              staged.length === 0 || !commitMessage.trim()
                ? 'text-slate-500 bg-slate-800 cursor-default'
                : 'text-white bg-brand hover:bg-brand/80 active:bg-brand/90'
            }`}
          >
            <Send size={12} />
            <span>Commit</span>
          </button>
        </div>

        {/* Staged Changes Group */}
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between font-mono">
            <span>Staged Changes</span>
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => void runGitOperation('git_unstage_all', 'Unstage all')} disabled={staged.length === 0 || !!activeOperation} className="rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-rose-400 disabled:opacity-40" title="Unstage all"><Minus size={10} /></button>
              <span className="bg-brand/15 text-brand-light px-1.5 py-0.2 rounded font-mono text-[9px]">{staged.length}</span>
            </span>
          </h3>
          {staged.length === 0 ? (
            <div className="text-[10px] text-slate-500 italic px-2 py-1 font-mono">No staged changes</div>
          ) : (
            <div className="space-y-1">
              {staged.map(file => (
                <div
                  key={file.path}
                  onClick={() => handleWorkingFileClick(file.path)}
                  className="flex items-center justify-between p-1.5 rounded text-xs font-mono cursor-pointer transition hover:bg-slate-850/60"
                >
                  <div className="flex items-center space-x-2 truncate pr-2">
                    <span className={`w-3 font-bold text-center ${getStatusColor(file.status)}`}>
                      {file.status}
                    </span>
                    <span className="truncate text-slate-300">{file.path}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnstageFile(file.path);
                    }}
                    className="p-1 hover:bg-slate-700/65 text-slate-400 rounded hover:text-red-400"
                    title="Unstage File"
                  >
                    <Minus size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Unstaged Changes Group */}
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between font-mono">
            <span>Unstaged Changes</span>
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => void runGitOperation('git_stage_all', 'Stage all')} disabled={unstaged.length === 0 || !!activeOperation} className="rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-emerald-400 disabled:opacity-40" title="Stage all"><Plus size={10} /></button>
              <span className="bg-amber-500/15 text-amber-400 px-1.5 py-0.2 rounded font-mono text-[9px]">{unstaged.length}</span>
            </span>
          </h3>
          {unstaged.length === 0 ? (
            <div className="text-[10px] text-slate-500 italic px-2 py-1 font-mono">No unstaged changes</div>
          ) : (
            <div className="space-y-1">
              {unstaged.map(file => (
                <div
                  key={file.path}
                  onClick={() => handleWorkingFileClick(file.path)}
                  className="flex items-center justify-between p-1.5 rounded text-xs font-mono cursor-pointer transition hover:bg-slate-850/60"
                >
                  <div className="flex items-center space-x-2 truncate pr-2">
                    <span className={`w-3 font-bold text-center ${getStatusColor(file.status)}`}>
                      {file.status}
                    </span>
                    <span className="truncate text-slate-300">{file.path}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStageFile(file.path);
                    }}
                    className="p-1 hover:bg-slate-700/65 text-slate-400 rounded hover:text-emerald-400"
                    title="Stage File"
                  >
                    <Plus size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Commit Log History Group */}
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between font-mono">
            <span>Commit History</span>
            <span className="bg-brand/15 text-brand-light px-1.5 py-0.2 rounded font-mono text-[9px]">{commits.length}</span>
          </h3>
          {commits.length === 0 ? (
            <div className="text-[10px] text-slate-500 italic px-2 py-1 font-mono">No commit history found</div>
          ) : (
            <div className="space-y-1">
              {commits.map(commit => {
                const isExpanded = expandedCommit === commit.hash;
                const files = commitFiles[commit.hash];

                return (
                  <div key={commit.hash} className="border border-slate-800 rounded bg-[#171717]/30 overflow-hidden">
                    {/* Commit Row */}
                    <div
                      onClick={() => handleCommitClick(commit.hash)}
                      className={`p-2 flex flex-col cursor-pointer transition hover:bg-slate-850/60 ${
                        isExpanded ? 'bg-slate-800/40 border-b border-slate-800' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center space-x-1 font-bold text-brand-light">
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          <span>{commit.hash.substring(0, 7)}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-[9px] text-slate-500">
                          <span className="flex items-center space-x-0.5">
                            <User size={10} />
                            <span className="truncate max-w-[60px]">{commit.author}</span>
                          </span>
                          <span className="flex items-center space-x-0.5">
                            <Clock size={10} />
                            <span>{commit.date}</span>
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-300 font-mono mt-1 line-clamp-1 leading-normal">
                        {commit.message}
                      </p>
                    </div>

                    {/* Commit Expanded Files list */}
                    {isExpanded && (
                      <div className="p-2 bg-slate-950/20 border-t border-slate-900 space-y-1">
                        {!files ? (
                          <div className="text-[9px] text-slate-500 italic font-mono pl-4">Loading changed files...</div>
                        ) : files.length === 0 ? (
                          <div className="text-[9px] text-slate-500 italic font-mono pl-4">No changed files</div>
                        ) : (
                          files.map(file => (
                            <div
                              key={file.path}
                              onClick={() => handleCommitFileClick(commit.hash, file.path)}
                              className="flex items-center space-x-2 p-1 rounded text-[10px] font-mono cursor-pointer transition hover:bg-slate-850/50"
                            >
                              <span className={`w-3 font-bold text-center text-[10px] ${getStatusColor(file.status)}`}>
                                {file.status}
                              </span>
                              <FileText size={10} className="text-slate-500" />
                              <span className="truncate text-slate-400 hover:text-slate-200">{file.path}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
