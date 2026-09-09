import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWorkspaceStore } from '../store/workspaceStore';
import {
  Globe,
  Plus,
  X,
  ExternalLink,
  Bot,
  UserCheck,
  Terminal,
  Sparkles,
  Download,
  AlertCircle
} from 'lucide-react';

export const BrowserPanel: React.FC = () => {
  const {
    openFiles,
    activeFileTab,
    setActiveFileTab,
    closeFile,
    openWebTab,
    webTabs,
    setWebTabOwnership,
    setActiveRightPanel,
    activeWorkspace
  } = useWorkspaceStore();

  const [newUrlInput, setNewUrlInput] = useState<string>('');
  const [egoInstalled, setEgoInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    invoke<any>('check_ego_lite_status')
      .then((status) => {
        setEgoInstalled(Boolean(status?.is_installed));
      })
      .catch(() => {
        setEgoInstalled(false);
      });
  }, []);

  const handleOpenSettingsBrowser = () => {
    window.dispatchEvent(new CustomEvent('tde-open-settings', { detail: { tab: 'browser' } }));
  };

  // Extract all web tabs for the active workspace
  const currentProjectWebFiles = openFiles.filter((f) => f.path.startsWith('web:'));

  const handleOpenNewTab = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrlInput.trim()) return;
    openWebTab(newUrlInput.trim());
    setNewUrlInput('');
  };

  const handlePresetClick = (presetUrl: string) => {
    openWebTab(presetUrl);
  };

  return (
    <div className="flex flex-col h-full bg-surface-1 border-l border-surface-2 text-zinc-300 font-sans text-xs">
      {/* Header toolbar */}
      <div className="p-3 border-b border-surface-2 flex items-center justify-between bg-surface-2/30">
        <div className="flex items-center space-x-2">
          <Globe className="w-4 h-4 text-brand-light" />
          <span className="font-semibold text-zinc-100 text-sm">Web Tabs</span>
          <span className="text-[10px] bg-brand/20 text-brand-light px-1.5 py-0.5 rounded-full font-mono">
            {currentProjectWebFiles.length}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setActiveRightPanel('none')}
            className="p-1 hover:bg-surface-2 rounded text-zinc-400 hover:text-zinc-200 transition"
            title="Close panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Subtle banner if ego-lite is not yet installed on host */}
      {egoInstalled === false && (
        <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-[11px] flex items-center justify-between font-mono">
          <div className="flex items-center gap-1.5 truncate">
            <AlertCircle size={12} className="shrink-0 text-amber-400" />
            <span className="truncate">ego-lite not installed</span>
          </div>
          <button
            onClick={handleOpenSettingsBrowser}
            className="text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded transition font-bold shrink-0 ml-1.5 flex items-center gap-1"
            title="Open TDE Settings to install ego-lite"
          >
            <Download size={10} />
            <span>Install</span>
          </button>
        </div>
      )}

      {/* New Web Tab Input Form */}
      <div className="p-2.5 border-b border-surface-2 bg-surface-1 space-y-2">
        <form onSubmit={handleOpenNewTab} className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Enter URL (e.g. localhost:3000)..."
              value={newUrlInput}
              onChange={(e) => setNewUrlInput(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              onKeyUp={(e) => e.stopPropagation()}
              className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-brand font-mono"
            />
          </div>
          <button
            type="submit"
            className="px-2.5 py-1.5 bg-brand hover:bg-brand-dark text-white rounded text-xs font-medium transition flex items-center gap-1 shrink-0"
            title="Open in center preview panel"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Open</span>
          </button>
        </form>

        {/* Quick Presets */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[10px] font-mono scrollbar-none">
          <span className="text-zinc-500 font-sans text-[10px]">Presets:</span>
          {[
            { label: '3000', url: 'http://localhost:3000' },
            { label: '5173', url: 'http://localhost:5173' },
            { label: '8080', url: 'http://localhost:8080' },
            { label: 'GitHub', url: 'https://github.com' },
            { label: 'Google', url: 'https://google.com' },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handlePresetClick(preset.url)}
              className="px-1.5 py-0.5 rounded bg-surface-2/70 hover:bg-surface-2 text-zinc-400 hover:text-zinc-200 border border-surface-3/50 transition whitespace-nowrap"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs List for Current Project */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {currentProjectWebFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 space-y-3 text-zinc-500 text-center px-4">
            <Globe className="w-8 h-8 opacity-30 text-brand-light" />
            <div className="space-y-1">
              <p className="font-medium text-zinc-400 text-xs">No web tabs open</p>
              <p className="text-[11px] leading-relaxed">
                Web pages opened in this workspace will appear here. The web page content renders directly in the center preview panel.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openWebTab('https://github.com/citrolabs/ego-lite', 'ego-lite GitHub')}
              className="px-2.5 py-1 bg-surface-2 hover:bg-surface-3 text-zinc-300 border border-surface-3 rounded text-xs transition flex items-center gap-1.5"
            >
              <Sparkles size={12} className="text-brand-light" />
              <span>Open ego-lite Docs</span>
            </button>
          </div>
        ) : (
          currentProjectWebFiles.map((f) => {
            const tabId = f.path.replace('web:', '');
            const tabMeta = webTabs[tabId];
            const isActive = activeFileTab === f.path;
            const title = tabMeta?.title || f.name;
            const url = tabMeta?.url || 'https://google.com';
            const ownership = tabMeta?.ownership || 'agent';

            return (
              <div
                key={f.path}
                onClick={() => setActiveFileTab(f.path)}
                className={`p-2.5 rounded-lg border transition cursor-pointer group flex flex-col gap-1.5 ${
                  isActive
                    ? 'bg-surface-2/80 border-brand/50 shadow-sm'
                    : 'bg-surface-2/30 border-surface-3/60 hover:bg-surface-2/50'
                }`}
              >
                {/* Title and Close */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center space-x-1.5 truncate">
                    <Globe size={13} className={isActive ? 'text-brand-light' : 'text-zinc-400'} />
                    <span className="font-semibold text-zinc-100 truncate text-xs" title={title}>
                      {title}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeFile(f.path);
                      }}
                      className="p-1 hover:bg-rose-950/40 text-zinc-500 hover:text-rose-400 rounded transition"
                      title="Close web tab"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>

                {/* URL preview */}
                <div className="text-[10px] font-mono text-zinc-500 truncate" title={url}>
                  {url}
                </div>

                {/* Bottom status & action badges */}
                <div className="flex items-center justify-between pt-1 border-t border-surface-3/30 text-[10px] font-sans">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = ownership === 'agent' ? 'user' : 'agent';
                      setWebTabOwnership(tabId, next);
                    }}
                    className={`px-1.5 py-0.5 rounded font-mono text-[9px] border flex items-center gap-1 transition ${
                      ownership === 'agent'
                        ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40 hover:bg-emerald-900/50'
                        : 'bg-amber-950/40 text-amber-300 border-amber-800/40 hover:bg-amber-900/50'
                    }`}
                    title="Click to toggle Agent / User control"
                  >
                    {ownership === 'agent' ? <Bot size={10} /> : <UserCheck size={10} />}
                    <span>{ownership === 'agent' ? 'Agent' : 'User'}</span>
                  </button>

                  <div className="flex items-center space-x-1 text-zinc-400">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(url, '_blank');
                      }}
                      className="p-1 hover:bg-surface-3 rounded text-zinc-400 hover:text-zinc-200 transition"
                      title="Open in external browser"
                    >
                      <ExternalLink size={11} />
                    </button>
                    {isActive && (
                      <span className="text-[9px] text-brand-light font-medium bg-brand/10 px-1 rounded">
                        Active in Center
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-2.5 border-t border-surface-2 bg-surface-1/90 space-y-1 text-[10px] text-zinc-500 font-mono">
        <div className="flex items-center justify-between">
          <span>Project: {activeWorkspace?.name || 'Default'}</span>
          <span>{currentProjectWebFiles.length} tabs</span>
        </div>
        <div className="text-[9px] text-zinc-600 flex items-center gap-1">
          <Terminal size={10} />
          <span>Driven by ego-browser via Antigravity CLI</span>
        </div>
      </div>
    </div>
  );
};
