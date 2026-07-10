import React, { useState, useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { invoke } from '@tauri-apps/api/core';
import { Save, FileCode } from 'lucide-react';

export const EditorPane: React.FC = () => {
  const { activeFilePath, activeFileContent, setActiveFileContent } = useWorkspaceStore();
  const [editorVal, setEditorVal] = useState<string>('');
  const [isSaved, setIsSaved] = useState(true);

  useEffect(() => {
    if (!activeFilePath) return;

    const loadContent = async () => {
      try {
        const content = await invoke<string>('read_file_content', { path: activeFilePath });
        setEditorVal(content);
        setActiveFileContent(content);
        setIsSaved(true);
      } catch (err) {
        console.error('Failed to load file content:', err);
      }
    };

    loadContent();
  }, [activeFilePath]);

  if (!activeFilePath) {
    return (
      <div className="w-full h-full bg-[#1e1e1e] rounded-lg border border-slate-700 flex flex-col items-center justify-center text-slate-500">
        <FileCode size={32} className="mb-2" />
        <span className="text-xs">Select a file from the explorer tree to view or edit</span>
      </div>
    );
  }

  // Detect file language based on file extension
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
        return 'ini'; // toml highlighting maps well to ini in basic monaco
      default:
        return 'plaintext';
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    const val = value || '';
    setEditorVal(val);
    setIsSaved(val === activeFileContent);
  };

  const handleSave = async () => {
    try {
      await invoke('write_file_content', { path: activeFilePath, content: editorVal });
      setActiveFileContent(editorVal);
      setIsSaved(true);
    } catch (err) {
      alert('Failed to save file: ' + err);
    }
  };

  // Keyboard shortcut for Cmd+S or Ctrl+S
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      className="w-full h-full bg-[#1e1e1e] rounded-lg border border-slate-700 flex flex-col overflow-hidden"
    >
      {/* Editor Header */}
      <div className="bg-[#171717] px-3 py-2 border-b border-slate-800 flex items-center justify-between select-none">
        <div className="flex items-center space-x-2 truncate">
          <FileCode size={14} className="text-brand-light" />
          <span className="text-xs font-mono truncate text-slate-300">
            {activeFilePath.split('/').pop()}
          </span>
          {!isSaved && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Modified" />
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={isSaved}
          className={`flex items-center space-x-1 text-xs font-medium px-2 py-1 rounded transition ${
            isSaved
              ? 'text-slate-500 bg-slate-800/40 cursor-default'
              : 'text-white bg-brand hover:bg-brand/80 active:bg-brand/90 shadow-md shadow-brand/10'
          }`}
        >
          <Save size={12} />
          <span>Save</span>
        </button>
      </div>

      {/* Monaco Editor Container */}
      <div className="flex-1 w-full min-h-[350px]">
        <MonacoEditor
          height="100%"
          language={getLanguage(activeFilePath)}
          value={editorVal}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            fontSize: 12,
            fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
            minimap: { enabled: false },
            automaticLayout: true,
            tabSize: 2,
            scrollBeyondLastLine: false,
          }}
        />
      </div>
    </div>
  );
};
