import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GitBranch, RefreshCw, Plus, Minus, Send, ChevronDown, ChevronRight, FileText, Clock, User } from 'lucide-react';
import { useWorkspaceStore, GitFileStatus } from '../store/workspaceStore';

interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export const GitPanel: React.FC = () => {
  const { gitFiles, setGitFiles, gitBranch, setGitBranch, activeWorkspace, openFile } = useWorkspaceStore();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [, setDiffContent] = useState<string>('');
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Git Commit History States
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [commitFiles, setCommitFiles] = useState<Record<string, GitFileStatus[]>>({});

  const workspacePath = activeWorkspace?.path || '/Users/ray/git-repo/black_tde';

  const loadGitStatus = async () => {
    setIsLoading(true);
    try {
      const statusFiles = await invoke<GitFileStatus[]>('get_git_status', { cwd: workspacePath });
      setGitFiles(statusFiles);

      const branchName = await invoke<string>('get_git_branch', { cwd: workspacePath });
      setGitBranch(branchName);

      // Load Git Commit History
      const log = await invoke<GitCommit[]>('get_git_commit_log', { cwd: workspacePath });
      setCommits(log);

      // Refresh diff if a file is currently selected
      if (selectedFile) {
        if (!statusFiles.some(f => f.path === selectedFile)) {
          setSelectedFile(null);
          setDiffContent('');
        } else {
          await loadFileDiff(selectedFile);
        }
      }
    } catch (err) {
      console.error('Failed to load Git status/history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadFileDiff = async (filePath: string) => {
    try {
      const diff = await invoke<string>('get_git_diff', { cwd: workspacePath, filePath });
      setDiffContent(diff);
    } catch (err) {
      console.error('Failed to load file diff:', err);
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
      }
    }
  };

  const handleCommitFileClick = (hash: string, filePath: string) => {
    const fileName = filePath.split('/').pop() || filePath;
    openFile(`git-diff:${hash}:${filePath}`, fileName);
  };

  useEffect(() => {
    loadGitStatus();
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
        <div className="flex items-center space-x-2 text-xs font-mono font-bold text-slate-300">
          <GitBranch size={14} className="text-brand-light" />
          <span>git: {gitBranch}</span>
        </div>
        <button
          onClick={loadGitStatus}
          disabled={isLoading}
          className="p-1 hover:bg-slate-800 text-slate-400 rounded transition"
          title="Refresh Git status"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Main content list */}
      <div className="flex-grow overflow-y-auto p-3 space-y-4">
        
        {/* Staged Changes Group */}
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between font-mono">
            <span>Staged Changes</span>
            <span className="bg-brand/15 text-brand-light px-1.5 py-0.2 rounded font-mono text-[9px]">{staged.length}</span>
          </h3>
          {staged.length === 0 ? (
            <div className="text-[10px] text-slate-500 italic px-2 py-1 font-mono">No staged changes</div>
          ) : (
            <div className="space-y-1">
              {staged.map(file => (
                <div
                  key={file.path}
                  onClick={() => {
                    setSelectedFile(file.path);
                    loadFileDiff(file.path);
                  }}
                  className={`flex items-center justify-between p-1.5 rounded text-xs font-mono cursor-pointer transition ${
                    selectedFile === file.path ? 'bg-slate-800/80' : 'hover:bg-slate-850/60'
                  }`}
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
            <span className="bg-amber-500/15 text-amber-400 px-1.5 py-0.2 rounded font-mono text-[9px]">{unstaged.length}</span>
          </h3>
          {unstaged.length === 0 ? (
            <div className="text-[10px] text-slate-500 italic px-2 py-1 font-mono">No unstaged changes</div>
          ) : (
            <div className="space-y-1">
              {unstaged.map(file => (
                <div
                  key={file.path}
                  onClick={() => {
                    setSelectedFile(file.path);
                    loadFileDiff(file.path);
                  }}
                  className={`flex items-center justify-between p-1.5 rounded text-xs font-mono cursor-pointer transition ${
                    selectedFile === file.path ? 'bg-slate-800/80' : 'hover:bg-slate-850/60'
                  }`}
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
                const files = commitFiles[commit.hash] || [];

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
                        {files.length === 0 ? (
                          <div className="text-[9px] text-slate-500 italic font-mono pl-4">Loading changed files...</div>
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

      {/* Bottom Panel: Commit Form */}
      <div className="bg-[#171717] p-3 border-t border-slate-800 flex items-center space-x-3 select-none shrink-0">
        <input
          type="text"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Type commit message..."
          className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand font-mono"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCommit();
          }}
        />
        <button
          onClick={handleCommit}
          disabled={staged.length === 0 || !commitMessage.trim()}
          className={`flex items-center space-x-1 text-xs font-semibold px-3 py-1.5 rounded transition ${
            staged.length === 0 || !commitMessage.trim()
              ? 'text-slate-500 bg-slate-800 cursor-default'
              : 'text-white bg-brand hover:bg-brand/80 active:bg-brand/90'
          }`}
        >
          <Send size={12} />
          <span>Commit</span>
        </button>
      </div>
    </div>
  );
};
