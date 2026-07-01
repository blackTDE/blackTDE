import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import MonacoEditor from '@monaco-editor/react';
import { GitBranch, RefreshCw, Plus, Minus, Send, AlertCircle } from 'lucide-react';
import { useWorkspaceStore, GitFileStatus } from '../store/workspaceStore';

export const GitPanel: React.FC = () => {
  const { gitFiles, setGitFiles, gitBranch, setGitBranch } = useWorkspaceStore();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string>('');
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // We operate inside the active workspace repository
  const workspacePath = '/Users/ray/git-repo/black_tde';

  const loadGitStatus = async () => {
    setIsLoading(true);
    try {
      const statusFiles = await invoke<GitFileStatus[]>('get_git_status', { cwd: workspacePath });
      setGitFiles(statusFiles);

      const branchName = await invoke<string>('get_git_branch', { cwd: workspacePath });
      setGitBranch(branchName);

      // Refresh diff if a file is currently selected
      if (selectedFile) {
        // If selected file is no longer modified, clear it
        if (!statusFiles.some(f => f.path === selectedFile)) {
          setSelectedFile(null);
          setDiffContent('');
        } else {
          await loadFileDiff(selectedFile);
        }
      }
    } catch (err) {
      console.error('Failed to load Git status:', err);
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

  useEffect(() => {
    loadGitStatus();
  }, []);

  const staged = gitFiles.filter(f => f.staged);
  const unstaged = gitFiles.filter(f => !f.staged);

  const getStatusColor = (status: string) => {
    switch (status) {
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
    <div className="w-full h-full bg-[#0f172a] rounded-lg border border-slate-700 flex flex-col overflow-hidden">
      {/* Git Header */}
      <div className="bg-[#0b0f19] px-3 py-2 border-b border-slate-800 flex items-center justify-between select-none">
        <div className="flex items-center space-x-2 text-xs font-mono font-bold text-slate-300">
          <GitBranch size={14} className="text-indigo-400" />
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

      {/* Main Grid: Status List & Diff Viewer */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 flex-grow min-h-0">
          
          {/* Left Sub-Panel: Git Changes List */}
          <div className="border-r border-slate-850 p-3 flex flex-col space-y-4 overflow-y-auto select-none">
            {/* Staged Changes Group */}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                <span>Staged Changes</span>
                <span className="bg-indigo-500/15 text-indigo-400 px-1.5 py-0.2 rounded font-mono text-[9px]">{staged.length}</span>
              </h3>
              {staged.length === 0 ? (
                <div className="text-[10px] text-slate-500 italic px-2 py-1">No staged changes</div>
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
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                <span>Changes</span>
                <span className="bg-amber-500/15 text-amber-400 px-1.5 py-0.2 rounded font-mono text-[9px]">{unstaged.length}</span>
              </h3>
              {unstaged.length === 0 ? (
                <div className="text-[10px] text-slate-500 italic px-2 py-1">No unstaged changes</div>
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
          </div>

          {/* Right Sub-Panel: Diff Viewer */}
          <div className="flex flex-col bg-[#0b0f19]/40 min-h-[250px]">
            {selectedFile ? (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="px-3 py-1.5 border-b border-slate-850 text-[10px] font-mono text-slate-400 truncate">
                  Diff: {selectedFile}
                </div>
                <div className="flex-grow min-h-0">
                  <MonacoEditor
                    height="100%"
                    language="diff"
                    value={diffContent}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      fontSize: 11,
                      fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
                      minimap: { enabled: false },
                      automaticLayout: true,
                      scrollBeyondLastLine: false,
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-4">
                <AlertCircle size={24} className="mb-1 text-slate-600" />
                <span className="text-xs">Select a modified file to view diff</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Panel: Commit Form */}
        <div className="bg-[#0b0f19] p-3 border-t border-slate-800 flex items-center space-x-3 select-none">
          <input
            type="text"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Type commit message..."
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
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
                : 'text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 shadow-lg shadow-indigo-500/10'
            }`}
          >
            <Send size={12} />
            <span>Commit</span>
          </button>
        </div>
      </div>
    </div>
  );
};
