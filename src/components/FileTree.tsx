import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown } from 'lucide-react';
import { useWorkspaceStore } from '../store/workspaceStore';

interface FileTreeEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

interface NodeProps {
  name: string;
  path: string;
  isDir: boolean;
  level: number;
}

const FileNode: React.FC<NodeProps> = ({ name, path, isDir, level }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [children, setChildren] = useState<FileTreeEntry[]>([]);
  const { setActiveFilePath, setActiveFileContent, setActiveRightPanel } = useWorkspaceStore();

  const handleToggle = async () => {
    if (!isDir) {
      try {
        const content = await invoke<string>('read_file_content', { path });
        setActiveFilePath(path);
        setActiveFileContent(content);
        setActiveRightPanel('editor');
      } catch (err) {
        console.error('Failed to read file:', err);
      }
      return;
    }

    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && children.length === 0) {
      try {
        const res = await invoke<FileTreeEntry[]>('list_directory', { path });
        setChildren(res);
      } catch (err) {
        console.error('Failed to list directory:', err);
      }
    }
  };

  return (
    <div>
      <div
        onClick={handleToggle}
        style={{ paddingLeft: `${level * 10}px` }}
        className="flex items-center space-x-1 py-0.5 px-2 hover:bg-slate-800/60 rounded cursor-pointer select-none text-xs text-slate-300 transition duration-75"
      >
        {isDir ? (
          <>
            {isOpen ? <ChevronDown size={12} className="text-slate-500" /> : <ChevronRight size={12} className="text-slate-500" />}
            {isOpen ? <FolderOpen size={12} className="text-sky-400" /> : <Folder size={12} className="text-sky-400" />}
          </>
        ) : (
          <>
            <span className="w-3" />
            <FileText size={12} className="text-slate-400" />
          </>
        )}
        <span className="truncate font-mono text-[11px]">{name}</span>
      </div>
      {isOpen && isDir && (
        <div className="mt-0.5">
          {children.map((child) => (
            <FileNode
              key={child.path}
              name={child.name}
              path={child.path}
              isDir={child.is_dir}
              level={level + 1}
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

  useEffect(() => {
    const loadRoot = async () => {
      try {
        const res = await invoke<FileTreeEntry[]>('list_directory', { path: rootPath });
        setRootFiles(res);
      } catch (err) {
        console.error('Failed to list root directory:', err);
      }
    };
    loadRoot();
  }, [rootPath]);

  return (
    <div className="flex flex-col h-full overflow-y-auto space-y-0.5 pr-2">
      {rootFiles.map((file) => (
        <FileNode
          key={file.path}
          name={file.name}
          path={file.path}
          isDir={file.is_dir}
          level={0}
        />
      ))}
    </div>
  );
};
