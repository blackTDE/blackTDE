import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown, Pencil, Trash2, Plus, FolderPlus, RefreshCw } from 'lucide-react';
import { useWorkspaceStore } from '../store/workspaceStore';

interface FileTreeEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified_at: number;
}

interface NodeProps {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedAt: number;
  level: number;
  refreshToken: number;
  onChanged: () => void;
  onRenamed: (oldPath: string, newPath: string) => void;
  onDeleted: (path: string) => void;
}

const FileNode: React.FC<NodeProps> = ({ name, path, isDir, size, modifiedAt, level, refreshToken, onChanged, onRenamed, onDeleted }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [children, setChildren] = useState<FileTreeEntry[]>([]);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { openFile } = useWorkspaceStore();

  const formatSize = (size: number) => {
    if (isDir) return 'DIR';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatModified = (modifiedAt: number) => modifiedAt
    ? new Date(modifiedAt * 1000).toLocaleString(undefined, {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    : 'Unknown';

  const reload = async () => {
    if (!isDir) return;
    try {
      const res = await invoke<FileTreeEntry[]>('list_directory', { path });
      setChildren(res);
    } catch (err) {
      console.error('Failed to list directory:', err);
    }
  };

  useEffect(() => {
    if (isOpen) void reload();
  }, [refreshToken]);

  const handleToggle = async () => {
    if (!isDir) {
      openFile(path, name);
      return;
    }

    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && children.length === 0) {
      try {
        await reload();
      } catch (err) {
        console.error('Failed to list directory:', err);
      }
    }
  };

  const startRename = (event: React.MouseEvent) => {
    event.stopPropagation();
    setActionError(null);
    setRenameValue(name);
    setIsRenaming(true);
  };

  const handleRename = async (event: React.FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const nextName = renameValue.trim();
    if (!nextName || nextName === name) {
      setIsRenaming(false);
      return;
    }
    try {
      const newPath = await invoke<string>('rename_path', { path, newName: nextName });
      onRenamed(path, newPath);
      setIsRenaming(false);
      await onChanged();
    } catch (err) {
      setActionError(String(err));
    }
  };

  const startDelete = (event: React.MouseEvent) => {
    event.stopPropagation();
    setActionError(null);
    setConfirmingDelete(true);
  };

  const handleDelete = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await invoke('delete_path', { path });
      onDeleted(path);
      await onChanged();
    } catch (err) {
      setActionError(String(err));
      setConfirmingDelete(false);
    }
  };

  return (
    <div>
      <div
        onClick={handleToggle}
        style={{ paddingLeft: `${level * 10}px` }}
        className="group flex items-center space-x-1 py-0.5 px-2 hover:bg-slate-800/60 rounded cursor-pointer select-none text-xs text-slate-300 transition duration-75"
      >
        {isDir ? (
          <>
            {isOpen ? <ChevronDown size={12} className="text-slate-500" /> : <ChevronRight size={12} className="text-slate-500" />}
            {isOpen ? <FolderOpen size={12} className="text-brand-light" /> : <Folder size={12} className="text-brand-light" />}
          </>
        ) : (
          <>
            <span className="w-3" />
            <FileText size={12} className="text-slate-400" />
          </>
        )}
        {isRenaming ? (
          <form onSubmit={handleRename} onClick={(event) => event.stopPropagation()} className="flex min-w-0 flex-1 items-center gap-1">
            <input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-1 text-[11px] text-slate-100 outline-none"
            />
            <button type="submit" title="Save rename" className="text-emerald-400 hover:text-emerald-300">✓</button>
            <button type="button" onClick={() => setIsRenaming(false)} title="Cancel rename" className="text-slate-500 hover:text-slate-200">×</button>
          </form>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={`Modified ${formatModified(modifiedAt)}`}>{name}</span>
            <span className="shrink-0 text-[9px] text-slate-600" title={`Modified ${formatModified(modifiedAt)}`}>{formatModified(modifiedAt)}</span>
            <span className="shrink-0 text-[9px] text-slate-600" title={`Modified ${formatModified(modifiedAt)}`}>{formatSize(size)}</span>
            {confirmingDelete ? (
              <span className="flex shrink-0 items-center gap-1 text-[9px] text-rose-300">
                Delete?
                <button onClick={handleDelete} title="Confirm delete" className="text-rose-400 hover:text-rose-300">✓</button>
                <button onClick={() => setConfirmingDelete(false)} title="Cancel delete" className="text-slate-500 hover:text-slate-200">×</button>
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-1 opacity-70">
                <button type="button" onClick={startRename} title="Rename" className="text-slate-500 hover:text-slate-200">
                  <Pencil size={11} />
                </button>
                <button type="button" onClick={startDelete} title="Delete" className="text-slate-500 hover:text-rose-400">
                  <Trash2 size={11} />
                </button>
              </span>
            )}
          </>
        )}
      </div>
      {actionError && <div className="truncate px-2 text-[9px] text-rose-400" style={{ paddingLeft: `${level * 10 + 20}px` }}>{actionError}</div>}
      {isOpen && isDir && (
        <div className="mt-0.5">
          {children.map((child) => (
            <FileNode
              key={child.path}
              name={child.name}
              path={child.path}
              isDir={child.is_dir}
              size={child.size}
              modifiedAt={child.modified_at}
              level={level + 1}
              refreshToken={refreshToken}
              onChanged={reload}
              onRenamed={onRenamed}
              onDeleted={onDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface FileTreeProps {
  rootPath: string;
}

export const FileTree: React.FC<FileTreeProps> = ({ rootPath }) => {
  const [rootFiles, setRootFiles] = useState<FileTreeEntry[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [newType, setNewType] = useState<'file' | 'directory' | null>(null);
  const [newName, setNewName] = useState('');
  const [treeError, setTreeError] = useState<string | null>(null);
  const { activeFilePath, setActiveFileTab } = useWorkspaceStore();

  const loadRoot = async () => {
    try {
      const res = await invoke<FileTreeEntry[]>('list_directory', { path: rootPath });
      setRootFiles(res);
    } catch (err) {
      console.error('Failed to list root directory:', err);
    }
  };

  const refresh = async () => {
    setTreeError(null);
    await loadRoot();
    setRefreshToken((value) => value + 1);
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [rootPath]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!newType || !name) return;
    try {
      await invoke(newType === 'file' ? 'create_file' : 'create_directory', {
        parentPath: rootPath,
        name,
      });
      setNewType(null);
      setNewName('');
      await refresh();
    } catch (err) {
      setTreeError(String(err));
    }
  };

  const handleRenamed = (oldPath: string, newPath: string) => {
    if (activeFilePath === oldPath) setActiveFileTab(newPath);
  };

  const handleDeleted = (_path: string) => {
    // Keep the editor open after deletion so saving can offer to recreate it.
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto space-y-0.5 pr-2">
      <div className="flex items-center justify-end gap-1 border-b border-surface-2 pb-1">
        <button type="button" onClick={() => { setNewType('file'); setTreeError(null); }} title="New file" className="p-1 text-zinc-500 hover:text-zinc-200"><Plus size={13} /></button>
        <button type="button" onClick={() => { setNewType('directory'); setTreeError(null); }} title="New directory" className="p-1 text-zinc-500 hover:text-zinc-200"><FolderPlus size={13} /></button>
        <button type="button" onClick={() => void refresh()} title="Refresh files" className="p-1 text-zinc-500 hover:text-zinc-200"><RefreshCw size={12} /></button>
      </div>
      {newType && (
        <form onSubmit={handleCreate} className="flex items-center gap-1 rounded border border-surface-3 bg-surface-2/50 p-1">
          <input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={newType === 'file' ? 'new file name' : 'new folder name'} className="min-w-0 flex-1 bg-transparent px-1 text-[10px] text-zinc-200 outline-none" />
          <button type="submit" className="text-emerald-400">✓</button>
          <button type="button" onClick={() => setNewType(null)} className="text-zinc-500">×</button>
        </form>
      )}
      {treeError && <div className="truncate text-[9px] text-rose-400" title={treeError}>{treeError}</div>}
      {rootFiles.map((file) => (
        <FileNode
          key={file.path}
          name={file.name}
          path={file.path}
          isDir={file.is_dir}
          size={file.size}
          modifiedAt={file.modified_at}
          level={0}
          refreshToken={refreshToken}
          onChanged={refresh}
          onRenamed={handleRenamed}
          onDeleted={handleDeleted}
        />
      ))}
    </div>
  );
};
