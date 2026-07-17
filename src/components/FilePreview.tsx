import React, { useState, useEffect, useRef } from 'react';
import MonacoEditor, { type OnMount } from '@monaco-editor/react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { invoke } from '@tauri-apps/api/core';
import { Save, FileText, Edit3, Eye, FileCode } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidBlock } from './MermaidBlock';
import { isMermaidClass } from '../markdown';

export const FilePreview: React.FC = () => {
  const { activeFilePath, activeFileLine, fileNavigationCounter, setActiveFileContent, fileUpdateCounter } = useWorkspaceStore();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editorVal, setEditorVal] = useState<string>('');
  const [isSaved, setIsSaved] = useState(true);
  
  // Preview specific states
  const [textContent, setTextContent] = useState<string>('');
  const [base64Content, setBase64Content] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const ext = activeFilePath ? activeFilePath.split('.').pop()?.toLowerCase() || '' : '';

  // Determine if this file is a previewable type
  const isPreviewable = [
    'md', 'html', 'json', 
    'png', 'jpg', 'jpeg', 'gif', 'svg', 
    'pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls'
  ].includes(ext);

  const isBinary = [
    'png', 'jpg', 'jpeg', 'gif', 'svg', 
    'pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls'
  ].includes(ext);

  useEffect(() => {
    if (!activeFilePath) return;

    // Reset editing state on file swap
    setIsEditMode(activeFileLine ? true : !isPreviewable);
    setLoadError(null);
    setConfirmCreate(false);
    setSaveError(null);
    setIsLoading(true);
    setTextContent('');
    setBase64Content('');

    const loadData = async () => {
      try {
        if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) {
          // Read binary file in Base64
          const b64 = await invoke<string>('read_file_base64', { path: activeFilePath });
          setBase64Content(b64);
        } else if (['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls'].includes(ext)) {
          // Keep base64 or just load metadata (read-only system view)
          try {
            const b64 = await invoke<string>('read_file_base64', { path: activeFilePath });
            setBase64Content(b64);
          } catch {
            // Ignore if base64 read fails for huge documents
          }
        } else {
          // Regular text content
          const text = await invoke<string>('read_file_content', { path: activeFilePath });
          setTextContent(text);
          setEditorVal(text);
          setActiveFileContent(text);
        }
      } catch (err: any) {
        console.error('Error loading file preview:', err);
        setLoadError(err.toString());
        // Fallback to raw text mode if preview load fails
        setIsEditMode(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [activeFilePath, fileUpdateCounter]);

  useEffect(() => {
    if (!activeFileLine || isLoading) return;
    setIsEditMode(true);
    editorRef.current?.setPosition({ lineNumber: activeFileLine, column: 1 });
    editorRef.current?.revealLineInCenter(activeFileLine);
  }, [activeFileLine, fileNavigationCounter, isLoading]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    const editorNode = editor.getDomNode();
    const suppressFindControlTooltip = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest('.find-widget [role="button"]')) {
        event.stopImmediatePropagation();
      }
    };
    editorNode?.addEventListener('mouseover', suppressFindControlTooltip, true);
    editor.onDidDispose(() => editorNode?.removeEventListener('mouseover', suppressFindControlTooltip, true));

    if (activeFileLine) {
      editor.setPosition({ lineNumber: activeFileLine, column: 1 });
      editor.revealLineInCenter(activeFileLine);
      editor.focus();
    }
  };

  if (!activeFilePath) {
    return (
      <div className="w-full h-full bg-surface-1 rounded-lg border border-surface-2 flex flex-col items-center justify-center text-zinc-500 font-mono">
        <FileCode size={32} className="mb-2 text-zinc-600 animate-pulse" />
        <span className="text-xs">Select a file from the explorer tree to preview or edit</span>
      </div>
    );
  }

  // Detect file language based on file extension for Monaco
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

  const handleEditorChange = (value: string | undefined) => {
    const val = value || '';
    setEditorVal(val);
    setIsSaved(val === textContent);
  };

  const saveFile = async (allowCreate = false) => {
    try {
      if (!allowCreate && !(await invoke<boolean>('path_exists', { path: activeFilePath }))) {
        setConfirmCreate(true);
        return;
      }
      await invoke('write_file_content', { path: activeFilePath, content: editorVal });
      setTextContent(editorVal);
      setActiveFileContent(editorVal);
      setIsSaved(true);
      setConfirmCreate(false);
      setSaveError(null);
    } catch (err: any) {
      setSaveError(String(err));
    }
  };

  const handleSave = () => { void saveFile(); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (isEditMode) {
        handleSave();
      }
    }
  };

  // Main Preview Content router
  const renderPreviewContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full text-zinc-500 font-mono text-xs">
          <span className="w-4 h-4 rounded-full border-2 border-brand border-t-transparent animate-spin mr-2"></span>
          <span>Generating preview...</span>
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="p-4 text-xs font-mono text-error/85 bg-error/5 border border-error/20 rounded-lg max-w-lg mx-auto mt-10">
          <p className="font-bold mb-1">Failed to generate preview:</p>
          <p>{loadError}</p>
        </div>
      );
    }

    switch (ext) {
      case 'md':
        return (
          <div className="h-full overflow-y-auto px-6 py-4 bg-surface select-text">
            <div className="mx-auto max-w-3xl space-y-3 py-4 text-sm leading-relaxed text-zinc-300">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                h1: ({ children }) => <h1 className="mt-5 border-b border-surface-3 pb-1.5 text-2xl font-bold text-zinc-100">{children}</h1>,
                h2: ({ children }) => <h2 className="mt-4 border-b border-surface-2 pb-1 text-xl font-semibold text-zinc-100">{children}</h2>,
                h3: ({ children }) => <h3 className="mt-3 text-lg font-medium text-zinc-200">{children}</h3>,
                p: ({ children }) => <p className="my-2">{children}</p>,
                ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-6">{children}</ul>,
                ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-6">{children}</ol>,
                blockquote: ({ children }) => <blockquote className="my-2 rounded-r border-l-4 border-brand bg-surface-2/40 px-3.5 py-2 text-zinc-400">{children}</blockquote>,
                table: ({ children }) => <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-left">{children}</table></div>,
                th: ({ children }) => <th className="border border-surface-3 bg-surface-2 px-3 py-2 font-semibold text-zinc-100">{children}</th>,
                td: ({ children }) => <td className="border border-surface-3 px-3 py-2">{children}</td>,
                a: ({ href, children }) => <a href={href} className="text-brand-light underline" target="_blank" rel="noreferrer">{children}</a>,
                pre: ({ children }) => {
                  const child = React.Children.toArray(children)[0];
                  if (React.isValidElement<{ className?: string }>(child) && isMermaidClass(child.props.className)) return <>{children}</>;
                  return <pre className="my-3 overflow-x-auto rounded-lg border border-surface-3 bg-surface-2 p-3.5 font-mono text-xs text-brand-light">{children}</pre>;
                },
                code: ({ className, children }) => isMermaidClass(className)
                  ? <MermaidBlock source={String(children).replace(/\n$/, '')} />
                  : <code className={className}>{children}</code>,
                }}
              >
                {textContent}
              </ReactMarkdown>
            </div>
          </div>
        );
      case 'html':
        return (
          <div className="h-full w-full bg-white rounded overflow-hidden shadow border border-surface-3">
            <iframe
              title="HTML Visual Preview"
              srcDoc={textContent}
              sandbox="allow-scripts"
              className="w-full h-full bg-white"
            />
          </div>
        );
      case 'json':
        try {
          const parsed = JSON.parse(textContent);
          return (
            <div className="h-full overflow-y-auto p-4 bg-surface select-text">
              <pre className="text-emerald-400 font-mono text-xs leading-relaxed bg-surface-2 p-4 rounded border border-surface-3 shadow-inner">
                <code>{JSON.stringify(parsed, null, 2)}</code>
              </pre>
            </div>
          );
        } catch {
          return (
            <div className="h-full overflow-y-auto p-4 bg-surface select-text">
              <pre className="text-zinc-300 font-mono text-xs bg-surface-2 p-4 rounded border border-surface-3">{textContent}</pre>
            </div>
          );
        }
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg':
        const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
        return (
          <div className="h-full w-full flex items-center justify-center p-6 bg-surface-2/20 rounded">
            <div className="relative group max-w-full max-h-full">
              <img
                src={`data:${mimeType};base64,${base64Content}`}
                alt={activeFilePath.split('/').pop()}
                className="max-w-full max-h-[70vh] object-contain rounded border border-surface-3 shadow-lg bg-surface-1"
              />
              <div className="absolute top-2 right-2 bg-surface/85 border border-surface-3 px-2 py-0.5 rounded text-[10px] font-mono text-zinc-400 opacity-0 group-hover:opacity-100 transition">
                {ext.toUpperCase()} IMAGE
              </div>
            </div>
          </div>
        );
      case 'pdf':
        return (
          <div className="h-full w-full flex flex-col items-center justify-center p-6 bg-surface-2/20 text-center font-mono">
            <div className="p-8 bg-surface-1 rounded-xl border border-surface-2 shadow-lg max-w-md">
              <FileText size={48} className="text-rose-400 mx-auto mb-4" />
              <h3 className="text-sm font-bold text-zinc-200 truncate mb-1">{activeFilePath.split('/').pop()}</h3>
              <p className="text-[10px] text-zinc-500 mb-6">Adobe PDF Document</p>
              <div className="bg-surface p-3 rounded border border-surface-3/50 text-[10px] text-left text-zinc-400 mb-6 space-y-1">
                <p>Location: <span className="text-zinc-300">{activeFilePath}</span></p>
                <p>Format: PDF (Binary Document)</p>
              </div>
              <button
                onClick={() => setIsEditMode(true)}
                className="inline-flex items-center space-x-1.5 bg-surface-3 hover:bg-surface-2 text-zinc-200 border border-surface-3 px-3 py-1.5 rounded text-xs transition cursor-pointer"
              >
                <FileCode size={13} />
                <span>Open in Code Viewer</span>
              </button>
            </div>
          </div>
        );
      case 'docx':
      case 'doc':
      case 'pptx':
      case 'ppt':
      case 'xlsx':
      case 'xls':
        const docColors: Record<string, string> = {
          docx: 'text-zinc-400',
          doc: 'text-zinc-400',
          xlsx: 'text-emerald-400',
          xls: 'text-emerald-400',
          pptx: 'text-orange-400',
          ppt: 'text-orange-400'
        };
        const docLabels: Record<string, string> = {
          docx: 'Word Document',
          doc: 'Word Document',
          xlsx: 'Excel Spreadsheet',
          xls: 'Excel Spreadsheet',
          pptx: 'PowerPoint Presentation',
          ppt: 'PowerPoint Presentation'
        };
        return (
          <div className="h-full w-full flex flex-col items-center justify-center p-6 bg-surface-2/20 text-center font-mono">
            <div className="p-8 bg-surface-1 rounded-xl border border-surface-2 shadow-lg max-w-md">
              <FileText size={48} className={`${docColors[ext] || 'text-zinc-400'} mx-auto mb-4`} />
              <h3 className="text-sm font-bold text-zinc-200 truncate mb-1">{activeFilePath.split('/').pop()}</h3>
              <p className="text-[10px] text-zinc-500 mb-6">{docLabels[ext] || 'Office Document'}</p>
              <div className="bg-surface p-3 rounded border border-surface-3/50 text-[10px] text-left text-zinc-400 mb-6 space-y-1">
                <p>Location: <span className="text-zinc-300">{activeFilePath}</span></p>
                <p>Type: Microsoft Office File</p>
              </div>
              <button
                onClick={() => setIsEditMode(true)}
                className="inline-flex items-center space-x-1.5 bg-surface-3 hover:bg-surface-2 text-zinc-200 border border-surface-3 px-3 py-1.5 rounded text-xs transition cursor-pointer"
              >
                <FileCode size={13} />
                <span>Open in Binary Viewer</span>
              </button>
            </div>
          </div>
        );
      default:
        return (
          <div className="h-full overflow-y-auto p-4 bg-surface select-text">
            <pre className="text-zinc-300 font-mono text-xs">{textContent}</pre>
          </div>
        );
    }
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      className="w-full h-full min-h-0 bg-surface flex flex-col overflow-hidden select-none"
    >
      {/* Visual Header */}
      <div className="bg-surface-1 px-4 py-3 border-b border-surface-2 flex items-center justify-between">
        <div className="flex items-center space-x-2 truncate">
          <FileText size={14} className="text-brand-light shrink-0" />
          <span className="text-xs font-mono truncate text-zinc-300 font-semibold">
            {activeFilePath.split('/').pop()}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-surface-3 text-zinc-500 uppercase tracking-wider font-mono">
            {isEditMode ? 'Edit Mode' : 'Preview Mode'}
          </span>
        </div>

        {/* Action button triggers */}
        <div className="flex items-center space-x-2">
          {isPreviewable && !isBinary && (
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className={`flex items-center space-x-1 text-xs font-medium px-2.5 py-1 rounded transition border cursor-pointer ${
                isEditMode
                  ? 'text-zinc-300 bg-surface-2 border-surface-3 hover:bg-surface-3'
                  : 'text-brand-light bg-brand/10 border-brand/20 hover:bg-brand/20'
              }`}
            >
              {isEditMode ? <Eye size={12} /> : <Edit3 size={12} />}
              <span>{isEditMode ? 'Visual Preview' : 'Edit File'}</span>
            </button>
          )}

          {isEditMode && (
            <button
              onClick={handleSave}
              disabled={isSaved}
              className={`flex items-center space-x-1.5 text-xs font-medium px-2.5 py-1 rounded transition border cursor-pointer ${
                isSaved
                  ? 'text-zinc-500 bg-surface-2/40 border-transparent cursor-default'
                  : 'text-white bg-brand border-brand/60 hover:bg-brand/90 active:bg-brand'
              }`}
            >
              <Save size={12} />
              <span>Save</span>
            </button>
          )}
        </div>
      </div>
      {confirmCreate && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-200">
          <span>“{activeFilePath.split('/').pop()}” was deleted. Create it and save your changes?</span>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => void saveFile(true)} className="rounded bg-amber-500/20 px-2 py-1 hover:bg-amber-500/30">Create &amp; Save</button>
            <button type="button" onClick={() => setConfirmCreate(false)} className="px-2 py-1 text-zinc-400 hover:text-zinc-200">Cancel</button>
          </div>
        </div>
      )}
      {saveError && <div className="border-b border-error/20 bg-error/5 px-4 py-1 text-[10px] text-error">Save failed: {saveError}</div>}

      {/* Render Workspace Content Body */}
      <div className="flex-1 w-full min-h-0">
        {isEditMode ? (
          <div className="w-full h-full">
            <MonacoEditor
              height="100%"
              language={getLanguage(activeFilePath)}
              value={editorVal}
              onMount={handleEditorMount}
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
        ) : (
          <div className="w-full h-full">
            {renderPreviewContent()}
          </div>
        )}
      </div>
    </div>
  );
};
