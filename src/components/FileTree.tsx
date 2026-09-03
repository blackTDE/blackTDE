import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Folder,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
  Pencil,
  Trash2,
  Plus,
  FolderPlus,
  RefreshCw,
  ExternalLink,
  FilePlus,
  Copy,
  X,
  Check,
} from 'lucide-react';
import { useWorkspaceStore } from '../store/workspaceStore';
import {
  getParentDirectory,
  resolveCreationDirectory,
  getRelativeDisplayPath,
  getRelativePath,
} from '../utils/fileTreeUtils';

export interface FileTreeEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified_at: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  path: string;
  name: string;
  isDir: boolean;
}

interface NodeProps {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedAt: number;
  level: number;
  refreshToken: number;
  selectedPath: string | null;
  expandedMap: Record<string, boolean>;
  renamingPath: string | null;
  deletingPath: string | null;
  onToggleExpand: (path: string) => void;
  onSelect: (path: string, isDir: boolean, name: string) => void;
  onContextMenu: (x: number, y: number, path: string, name: string, isDir: boolean) => void;
  onStartRename: (path: string) => void;
  onCancelRename: () => void;
  onConfirmRename: (path: string, newName: string) => Promise<void>;
  onStartDelete: (path: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (path: string) => Promise<void>;
  onRenamed: (oldPath: string, newPath: string) => void;
  onDeleted: (path: string) => void;
  onChanged: () => void;
}

const FileNode: React.FC<NodeProps> = ({
  name,
  path,
  isDir,
  size,
  modifiedAt,
  level,
  refreshToken,
  selectedPath,
  expandedMap,
  renamingPath,
  deletingPath,
  onToggleExpand,
  onSelect,
  onContextMenu,
  onStartRename,
  onCancelRename,
  onConfirmRename,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
  onRenamed,
  onDeleted,
  onChanged,
}) => {
  const [children, setChildren] = useState<FileTreeEntry[]>([]);
  const [renameValue, setRenameValue] = useState(name);
  const [actionError, setActionError] = useState<string | null>(null);
  const { openFile } = useWorkspaceStore();

  const isExpanded = Boolean(expandedMap[path]);
  const isSelected = selectedPath === path;
  const isRenaming = renamingPath === path;
  const isDeleting = deletingPath === path;

  const formatSize = (bytes: number) => {
    if (isDir) return 'DIR';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatModified = (epochSec: number) =>
    epochSec
      ? new Date(epochSec * 1000).toLocaleString(undefined, {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Unknown';

  const reloadChildren = async () => {
    if (!isDir) return;
    try {
      const res = await invoke<FileTreeEntry[]>('list_directory', { path });
      setChildren(res);
    } catch (err) {
      console.error('Failed to list directory:', err);
    }
  };

  useEffect(() => {
    if (isExpanded && isDir) {
      void reloadChildren();
    }
  }, [isExpanded, refreshToken, path]);

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(name);
      setActionError(null);
    }
  }, [isRenaming, name]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(path, isDir, name);
    if (isDir) {
      onToggleExpand(path);
    } else {
      openFile(path, name);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(path, isDir, name);
    onContextMenu(e.clientX, e.clientY, path, name, isDir);
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextName = renameValue.trim();
    if (!nextName || nextName === name) {
      onCancelRename();
      return;
    }
    try {
      await onConfirmRename(path, nextName);
    } catch (err) {
      setActionError(String(err));
    }
  };

  const handleDeleteSubmit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await onConfirmDelete(path);
    } catch (err) {
      setActionError(String(err));
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        style={{ paddingLeft: `${level * 10 + 6}px` }}
        title={name}
        className={`group flex items-center space-x-1 py-1 px-1.5 rounded cursor-pointer select-none text-xs transition duration-75 ${
          isSelected
            ? 'bg-brand/20 text-slate-100 font-medium border-l-2 border-brand'
            : 'text-slate-300 hover:bg-slate-800/60'
        }`}
      >
        {isDir ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(path);
              onSelect(path, isDir, name);
            }}
            className="flex items-center gap-1 cursor-pointer"
          >
            {isExpanded ? (
              <ChevronDown size={12} className="text-slate-400" />
            ) : (
              <ChevronRight size={12} className="text-slate-400" />
            )}
            {isExpanded ? (
              <FolderOpen size={12} className="text-amber-400" />
            ) : (
              <Folder size={12} className="text-amber-400" />
            )}
          </span>
        ) : (
          <>
            <span className="w-3" />
            <FileText size={12} className="text-slate-400 shrink-0" />
          </>
        )}

        {isRenaming ? (
          <form
            onSubmit={handleRenameSubmit}
            onClick={(e) => e.stopPropagation()}
            className="flex min-w-0 flex-1 items-center gap-1"
          >
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') onCancelRename();
              }}
              className="min-w-0 flex-1 rounded border border-brand/60 bg-slate-900 px-1 py-0.5 text-[11px] text-slate-100 outline-none"
            />
            <button
              type="submit"
              title="Save rename"
              className="p-0.5 text-emerald-400 hover:text-emerald-300 cursor-pointer"
            >
              <Check size={12} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCancelRename();
              }}
              title="Cancel rename"
              className="p-0.5 text-slate-500 hover:text-slate-200 cursor-pointer"
            >
              <X size={12} />
            </button>
          </form>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={name}>
              {name}
            </span>
            <span className="shrink-0 text-[9px] text-slate-500 font-mono" title={name}>
              {formatModified(modifiedAt)}
            </span>
            <span className="shrink-0 text-[9px] text-slate-500 font-mono" title={name}>
              {formatSize(size)}
            </span>

            {isDeleting ? (
              <span
                onClick={(e) => e.stopPropagation()}
                className="flex shrink-0 items-center gap-1 text-[9px] text-rose-300 bg-rose-950/80 px-1 py-0.5 rounded border border-rose-800"
              >
                Delete?
                <button
                  onClick={handleDeleteSubmit}
                  title="Confirm delete"
                  className="text-rose-300 hover:text-white cursor-pointer font-bold"
                >
                  ✓
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelDelete();
                  }}
                  title="Cancel delete"
                  className="text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  ×
                </button>
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartRename(path);
                  }}
                  title="Rename"
                  className="p-0.5 text-slate-500 hover:text-slate-200 cursor-pointer"
                >
                  <Pencil size={11} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartDelete(path);
                  }}
                  title="Delete"
                  className="p-0.5 text-slate-500 hover:text-rose-400 cursor-pointer"
                >
                  <Trash2 size={11} />
                </button>
              </span>
            )}
          </>
        )}
      </div>

      {actionError && (
        <div
          className="truncate px-2 text-[9px] text-rose-400 font-mono"
          style={{ paddingLeft: `${level * 10 + 20}px` }}
        >
          {actionError}
        </div>
      )}

      {isExpanded && isDir && (
        <div className="mt-0.5">
          {children.length === 0 ? (
            <div
              className="py-0.5 text-[10px] text-zinc-600 font-mono italic"
              style={{ paddingLeft: `${level * 10 + 24}px` }}
            >
              (empty)
            </div>
          ) : (
            children.map((child) => (
              <FileNode
                key={child.path}
                name={child.name}
                path={child.path}
                isDir={child.is_dir}
                size={child.size}
                modifiedAt={child.modified_at}
                level={level + 1}
                refreshToken={refreshToken}
                selectedPath={selectedPath}
                expandedMap={expandedMap}
                renamingPath={renamingPath}
                deletingPath={deletingPath}
                onToggleExpand={onToggleExpand}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
                onStartRename={onStartRename}
                onCancelRename={onCancelRename}
                onConfirmRename={onConfirmRename}
                onStartDelete={onStartDelete}
                onCancelDelete={onCancelDelete}
                onConfirmDelete={onConfirmDelete}
                onRenamed={onRenamed}
                onDeleted={onDeleted}
                onChanged={onChanged}
              />
            ))
          )}
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
  const [selectedItem, setSelectedItem] = useState<{
    path: string;
    isDir: boolean;
    name: string;
  } | null>(null);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [newType, setNewType] = useState<'file' | 'directory' | null>(null);
  const [newTargetDir, setNewTargetDir] = useState<string>('');
  const [newName, setNewName] = useState('');
  const [treeError, setTreeError] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const contextMenuRef = useRef<HTMLDivElement>(null);
  const { activeFilePath, setActiveFileTab, openFile } = useWorkspaceStore();

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
    setRefreshToken((val) => val + 1);
  };

  useEffect(() => {
    setSelectedItem(null);
    setExpandedMap({});
    setNewType(null);
    setTreeError(null);
    setRenamingPath(null);
    setDeletingPath(null);
    setContextMenu(null);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [rootPath]);

  // Handle outside clicks to close context menu
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setRenamingPath(null);
        setDeletingPath(null);
        setNewType(null);
      }
    };

    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleToggleExpand = (path: string) => {
    setExpandedMap((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  const handleSelect = (path: string, isDir: boolean, name: string) => {
    setSelectedItem({ path, isDir, name });
  };

  const handleOpenContextMenu = (x: number, y: number, path: string, name: string, isDir: boolean) => {
    setContextMenu({ x, y, path, name, isDir });
  };

  const startCreate = (type: 'file' | 'directory', targetDir?: string) => {
    const destination =
      targetDir ||
      resolveCreationDirectory(rootPath, selectedItem?.path || null, selectedItem?.isDir ?? false);
    setNewTargetDir(destination);
    setNewType(type);
    setNewName('');
    setTreeError(null);
    setContextMenu(null);
    if (destination !== rootPath) {
      setExpandedMap((prev) => ({ ...prev, [destination]: true }));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!newType || !name) return;
    const parentPath = newTargetDir || rootPath;
    try {
      const createdPath = await invoke<string>(
        newType === 'file' ? 'create_file' : 'create_directory',
        {
          parentPath,
          name,
        }
      );
      setNewType(null);
      setNewName('');
      if (parentPath !== rootPath) {
        setExpandedMap((prev) => ({ ...prev, [parentPath]: true }));
      }
      await refresh();
      if (newType === 'file') {
        openFile(createdPath, name);
      }
      setSelectedItem({
        path: createdPath,
        isDir: newType === 'directory',
        name,
      });
    } catch (err) {
      setTreeError(String(err));
    }
  };

  const handleConfirmRename = async (path: string, nextName: string) => {
    const newPath = await invoke<string>('rename_path', { path, newName: nextName });
    setRenamingPath(null);
    handleRenamed(path, newPath);
    if (selectedItem?.path === path) {
      setSelectedItem({
        path: newPath,
        isDir: selectedItem.isDir,
        name: nextName,
      });
    }
    await refresh();
  };

  const handleConfirmDelete = async (path: string) => {
    await invoke('delete_path', { path });
    setDeletingPath(null);
    if (selectedItem?.path === path) {
      setSelectedItem(null);
    }
    handleDeleted(path);
    await refresh();
  };

  const handleRenamed = (oldPath: string, newPath: string) => {
    if (activeFilePath === oldPath) setActiveFileTab(newPath);
  };

  const handleDeleted = (_path: string) => {
    // Keep editor open so user can recreate/save if needed
  };

  const handleCopyText = async (text: string) => {
    try {
      await invoke('write_clipboard_text', { text });
    } catch {
      await navigator.clipboard.writeText(text);
    }
    setContextMenu(null);
  };

  const effectiveTargetDir =
    newTargetDir ||
    resolveCreationDirectory(rootPath, selectedItem?.path || null, selectedItem?.isDir ?? false);

  return (
    <div
      className="flex flex-col h-full overflow-y-auto space-y-0.5 pr-2 select-none"
      onClick={() => {
        // Clicking container background deselects or keeps selection
      }}
    >
      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-1 border-b border-surface-2 pb-1 text-xs">
        <div className="flex items-center gap-1 min-w-0 text-[10px] text-zinc-500 font-mono truncate">
          <span className="truncate" title={`Root: ${rootPath}`}>
            {selectedItem
              ? `Selected: ${getRelativeDisplayPath(rootPath, selectedItem.path)}`
              : 'Files'}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => startCreate('file')}
            title="New file in selected directory"
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 rounded transition cursor-pointer"
          >
            <Plus size={13} />
          </button>
          <button
            type="button"
            onClick={() => startCreate('directory')}
            title="New folder in selected directory"
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 rounded transition cursor-pointer"
          >
            <FolderPlus size={13} />
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            title="Refresh workspace files"
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 rounded transition cursor-pointer"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* New File / New Folder Form */}
      {newType && (
        <div className="my-1 flex flex-col gap-1 rounded border border-surface-3 bg-surface-2/80 p-1.5 text-[10px] shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 text-[9px] font-mono">
            <span className="truncate" title={effectiveTargetDir}>
              New {newType === 'file' ? 'file' : 'folder'} in:{' '}
              <strong className="text-zinc-200">{effectiveTargetDir}</strong>
            </span>
            <button
              type="button"
              onClick={() => setNewType(null)}
              className="text-zinc-500 hover:text-zinc-300 ml-1"
            >
              ×
            </button>
          </div>
          <form onSubmit={handleCreate} className="flex items-center gap-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setNewType(null);
              }}
              placeholder={newType === 'file' ? 'filename.ext' : 'folder name'}
              className="min-w-0 flex-1 rounded bg-slate-900 border border-slate-700 px-1.5 py-0.5 text-[10px] text-zinc-100 outline-none focus:border-brand"
            />
            <button
              type="submit"
              title="Create"
              className="px-1.5 py-0.5 rounded bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/50 cursor-pointer font-bold"
            >
              ✓
            </button>
            <button
              type="button"
              onClick={() => setNewType(null)}
              title="Cancel"
              className="px-1.5 py-0.5 rounded text-zinc-400 hover:bg-surface-3 cursor-pointer"
            >
              ×
            </button>
          </form>
        </div>
      )}

      {treeError && (
        <div className="truncate text-[9px] text-rose-400 font-mono py-0.5" title={treeError}>
          {treeError}
        </div>
      )}

      {/* Root File Tree List */}
      <div className="flex-grow overflow-y-auto space-y-0.5">
        {rootFiles.length === 0 ? (
          <div className="py-4 text-center text-xs text-zinc-600 font-mono">No files found</div>
        ) : (
          rootFiles.map((file) => (
            <FileNode
              key={file.path}
              name={file.name}
              path={file.path}
              isDir={file.is_dir}
              size={file.size}
              modifiedAt={file.modified_at}
              level={0}
              refreshToken={refreshToken}
              selectedPath={selectedItem?.path || null}
              expandedMap={expandedMap}
              renamingPath={renamingPath}
              deletingPath={deletingPath}
              onToggleExpand={handleToggleExpand}
              onSelect={handleSelect}
              onContextMenu={handleOpenContextMenu}
              onStartRename={(p) => {
                setRenamingPath(p);
                setDeletingPath(null);
              }}
              onCancelRename={() => setRenamingPath(null)}
              onConfirmRename={handleConfirmRename}
              onStartDelete={(p) => {
                setDeletingPath(p);
                setRenamingPath(null);
              }}
              onCancelDelete={() => setDeletingPath(null)}
              onConfirmDelete={handleConfirmDelete}
              onRenamed={handleRenamed}
              onDeleted={handleDeleted}
              onChanged={refresh}
            />
          ))
        )}
      </div>

      {/* Right Click Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 200),
            left: Math.min(contextMenu.x, window.innerWidth - 180),
          }}
          className="fixed z-50 min-w-[160px] rounded-md border border-surface-3 bg-[#161618]/95 p-1 shadow-2xl backdrop-blur text-[11px] font-sans text-zinc-200 select-none animate-in fade-in zoom-in-95 duration-75"
        >
          <div className="px-2 py-1 text-[9px] font-mono text-zinc-500 border-b border-surface-2 truncate">
            {contextMenu.name}
          </div>

          {!contextMenu.isDir && (
            <button
              onClick={() => {
                openFile(contextMenu.path, contextMenu.name);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-brand/20 hover:text-white transition text-left cursor-pointer"
            >
              <ExternalLink size={12} className="text-zinc-400" />
              <span>Open</span>
            </button>
          )}

          <button
            onClick={() => {
              const target = contextMenu.isDir
                ? contextMenu.path
                : getParentDirectory(contextMenu.path) || rootPath;
              startCreate('file', target);
            }}
            className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-brand/20 hover:text-white transition text-left cursor-pointer"
          >
            <FilePlus size={12} className="text-zinc-400" />
            <span>New File...</span>
          </button>

          <button
            onClick={() => {
              const target = contextMenu.isDir
                ? contextMenu.path
                : getParentDirectory(contextMenu.path) || rootPath;
              startCreate('directory', target);
            }}
            className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-brand/20 hover:text-white transition text-left cursor-pointer"
          >
            <FolderPlus size={12} className="text-zinc-400" />
            <span>New Folder...</span>
          </button>

          <button
            onClick={() => {
              const relPath = getRelativePath(rootPath, contextMenu.path);
              void handleCopyText(relPath);
            }}
            className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-3 transition text-left cursor-pointer text-zinc-300"
            title={getRelativePath(rootPath, contextMenu.path)}
          >
            <Copy size={12} className="text-zinc-400" />
            <span>Copy Relative Path</span>
          </button>

          <button
            onClick={() => {
              void handleCopyText(contextMenu.path);
            }}
            className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-3 transition text-left cursor-pointer text-zinc-300"
            title={contextMenu.path}
          >
            <Copy size={12} className="text-zinc-400" />
            <span>Copy Absolute Path</span>
          </button>

          <div className="my-1 border-t border-surface-2" />

          <button
            onClick={() => {
              setRenamingPath(contextMenu.path);
              setDeletingPath(null);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-3 transition text-left cursor-pointer text-zinc-300"
          >
            <Pencil size={12} className="text-zinc-400" />
            <span>Rename...</span>
          </button>

          <button
            onClick={() => {
              setDeletingPath(contextMenu.path);
              setRenamingPath(null);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition text-left cursor-pointer"
          >
            <Trash2 size={12} className="text-rose-400" />
            <span>Delete</span>
          </button>
        </div>
      )}
    </div>
  );
};
