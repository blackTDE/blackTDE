import React, { useState, useEffect } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { useWorkspaceStore } from '../store/workspaceStore';
import { AlertCircle, FileCode } from 'lucide-react';

interface GitDiffCompareProps {
  tabPath: string; // format: "git-diff:commit_hash:file_path"
}

export const GitDiffCompare: React.FC<GitDiffCompareProps> = ({ tabPath }) => {
  const { activeWorkspace } = useWorkspaceStore();
  const [originalContent, setOriginalContent] = useState<string>('');
  const [modifiedContent, setModifiedContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const workspacePath = activeWorkspace?.path || '/Users/ray/git-repo/black_tde';

  // Parse: git-diff:commit_hash:file_path
  const parts = tabPath.split(':');
  const commitHash = parts[1] || '';
  const isWorkingTree = commitHash === 'working';
  const filePath = parts.slice(2).join(':') || '';
  const fileName = filePath.split('/').pop() || filePath;

  const getLanguage = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'rs':
        return 'rust';
      case 'json':
        return 'json';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'md':
        return 'markdown';
      case 'sql':
        return 'sql';
      case 'toml':
        return 'ini';
      default:
        return 'plaintext';
    }
  };

  useEffect(() => {
    const loadContent = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Working changes compare HEAD to disk; commits compare parent to commit.
        const original = await invoke<string>('get_git_file_content_at_rev', {
          cwd: workspacePath,
          rev: isWorkingTree ? 'HEAD' : `${commitHash}~1`,
          filePath,
        });

        const modified = isWorkingTree
          ? await invoke<string>('get_git_worktree_file_content', { cwd: workspacePath, filePath })
          : await invoke<string>('get_git_file_content_at_rev', { cwd: workspacePath, rev: commitHash, filePath });

        setOriginalContent(original);
        setModifiedContent(modified);
      } catch (err: any) {
        console.error('Failed to load git diff content:', err);
        setError(err.toString());
      } finally {
        setIsLoading(false);
      }
    };

    if (commitHash && filePath) {
      loadContent();
    }
  }, [tabPath, commitHash, filePath, isWorkingTree, workspacePath]);

  if (isLoading) {
    return (
      <div className="w-full h-full bg-[#1e1e1e] flex items-center justify-center text-slate-500 font-mono text-xs">
        <span className="w-4 h-4 rounded-full border-2 border-brand-light border-t-transparent animate-spin mr-2"></span>
        <span>Loading comparison diff...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full bg-[#1e1e1e] flex flex-col items-center justify-center p-6 text-center font-mono">
        <AlertCircle size={32} className="text-rose-400 mb-2" />
        <h3 className="text-sm font-bold text-slate-200 mb-1">Failed to Load Diff</h3>
        <p className="text-[10px] text-slate-500 max-w-md">{error}</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-0 bg-[#1e1e1e] flex flex-col overflow-hidden select-none">
      {/* Header bar */}
      <div className="bg-[#171717] px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2 truncate">
          <FileCode size={14} className="text-brand-light shrink-0" />
          <span className="text-xs font-mono text-slate-300 font-bold truncate">
            {fileName}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-brand/60 text-brand-light border border-brand/50 uppercase tracking-wider font-mono">
            {isWorkingTree ? 'Working Tree' : `Commit: ${commitHash.substring(0, 8)}`}
          </span>
        </div>
        <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
          {isWorkingTree ? 'HEAD vs Working Tree' : 'Parent vs Commit'}
        </div>
      </div>

      {/* Monaco Diff Editor */}
      <div className="flex-1 w-full min-h-0">
        <DiffEditor
          height="100%"
          original={originalContent}
          modified={modifiedContent}
          language={getLanguage(filePath)}
          theme="vs-dark"
          options={{
            readOnly: true,
            fontSize: 12,
            fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
            minimap: { enabled: false },
            automaticLayout: true,
            renderSideBySide: true,
            scrollBeyondLastLine: false,
          }}
        />
      </div>
    </div>
  );
};
