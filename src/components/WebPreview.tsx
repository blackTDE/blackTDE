import React, { useState } from 'react';
import { useWorkspaceStore, WebTabItem } from '../store/workspaceStore';
import {
  Globe,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  ExternalLink,
  ShieldCheck,
  UserCheck,
  Bot,
  Layers,
  Terminal,
  Copy,
  Check
} from 'lucide-react';

interface WebPreviewProps {
  tabId: string;
  isVisible: boolean;
}

export const WebPreview: React.FC<WebPreviewProps> = ({ tabId, isVisible }) => {
  const { webTabs, updateWebTab, setWebTabOwnership } = useWorkspaceStore();
  const tab: WebTabItem | undefined = webTabs[tabId];

  const [inputUrl, setInputUrl] = useState<string>(tab?.url || 'https://google.com');
  const [iframeKey, setIframeKey] = useState<number>(Date.now());
  const [showAxTree, setShowAxTree] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  if (!tab) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 font-mono text-xs p-6">
        <Globe size={32} className="text-zinc-600 mb-2" />
        <span>Web page tab not found or closed ({tabId})</span>
      </div>
    );
  }

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    let target = inputUrl.trim();
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = `https://${target}`;
    }
    updateWebTab(tabId, { url: target, title: target.replace(/^https?:\/\//, '') });
    setInputUrl(target);
    setIframeKey(Date.now());
  };

  const handleReload = () => {
    setIsLoading(true);
    setIframeKey(Date.now());
    setTimeout(() => setIsLoading(false), 600);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(tab.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const toggleOwnership = () => {
    const next = tab.ownership === 'agent' ? 'user' : 'agent';
    setWebTabOwnership(tabId, next);
  };

  const dummyAxTree = `[Root WebArea, loc="page", url="${tab.url}"]
  [banner]
    [navigation]
      [link "Home", ref=1, loc="a:text('Home')"]
      [link "Documentation", ref=2, loc="a:text('Docs')"]
  [main]
    [heading "${tab.title}", level=1, ref=3]
    [searchbox "Search page content", ref=4, loc="input[type='search']"]
    [button "Submit", ref=5, loc="button.submit"]`;

  return (
    <div className={`w-full h-full flex flex-col bg-[#0f0f0f] text-zinc-200 font-sans ${isVisible ? '' : 'hidden'}`}>
      {/* Top Browser Navigation Bar */}
      <div className="shrink-0 h-10 px-3 border-b border-surface-2 bg-surface-1/90 flex items-center justify-between gap-2 select-none">
        {/* Navigation buttons */}
        <div className="flex items-center space-x-1 text-zinc-400">
          <button
            type="button"
            className="p-1 hover:bg-surface-2 rounded text-zinc-400 hover:text-zinc-200 transition"
            title="Back"
          >
            <ArrowLeft size={13} />
          </button>
          <button
            type="button"
            className="p-1 hover:bg-surface-2 rounded text-zinc-400 hover:text-zinc-200 transition"
            title="Forward"
          >
            <ArrowRight size={13} />
          </button>
          <button
            type="button"
            onClick={handleReload}
            className="p-1 hover:bg-surface-2 rounded text-zinc-400 hover:text-zinc-200 transition"
            title="Reload Page"
          >
            <RotateCw size={13} className={isLoading ? 'animate-spin text-brand' : ''} />
          </button>
        </div>

        {/* Address Bar Form */}
        <form onSubmit={handleNavigate} className="flex-1 max-w-2xl flex items-center">
          <div className="relative w-full flex items-center">
            <ShieldCheck size={12} className="w-3.5 h-3.5 text-emerald-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              onKeyUp={(e) => e.stopPropagation()}
              className="w-full bg-surface-2/80 hover:bg-surface-2 border border-surface-3 focus:border-brand rounded-md pl-8 pr-16 py-1 text-xs text-zinc-100 font-mono transition outline-none"
              placeholder="Enter URL or localhost port (e.g. http://localhost:3000)"
            />
            <div className="absolute right-1.5 flex items-center space-x-1">
              <button
                type="button"
                onClick={handleCopyUrl}
                className="p-1 hover:bg-surface-3 rounded text-zinc-400 hover:text-zinc-200 transition"
                title="Copy URL"
              >
                {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
              </button>
              <button
                type="button"
                onClick={() => window.open(tab.url, '_blank')}
                className="p-1 hover:bg-surface-3 rounded text-zinc-400 hover:text-zinc-200 transition"
                title="Open in external browser / ego lite"
              >
                <ExternalLink size={11} />
              </button>
            </div>
          </div>
        </form>

        {/* Right Controls: Ownership & AX Tree */}
        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowAxTree(!showAxTree)}
            className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1.5 border transition ${
              showAxTree
                ? 'bg-brand/20 border-brand/50 text-brand-light font-bold'
                : 'bg-surface-2 border-surface-3 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Toggle Accessibility Semantic Tree Inspector"
          >
            <Layers size={12} />
            <span>AX Tree</span>
          </button>

          <button
            type="button"
            onClick={toggleOwnership}
            className={`px-2.5 py-1 rounded text-[11px] font-sans font-medium flex items-center gap-1.5 border transition shadow-sm ${
              tab.ownership === 'agent'
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/50'
                : 'bg-amber-950/40 border-amber-800/60 text-amber-300 hover:bg-amber-900/50'
            }`}
            title={tab.ownership === 'agent' ? 'Click to take manual user control' : 'Click to return control to Agent'}
          >
            {tab.ownership === 'agent' ? (
              <>
                <Bot size={12} />
                <span>Agent Driving</span>
              </>
            ) : (
              <>
                <UserCheck size={12} />
                <span>User Control</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Web Iframe Viewport */}
        <div className="flex-1 h-full min-w-0 bg-white relative">
          <iframe
            key={iframeKey}
            src={tab.url}
            title={tab.title}
            className="w-full h-full border-none"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
            onLoad={() => setIsLoading(false)}
          />
        </div>

        {/* Optional Semantic AX Tree Inspector Drawer */}
        {showAxTree && (
          <div className="w-80 shrink-0 h-full border-l border-surface-2 bg-surface-1 flex flex-col text-xs font-mono">
            <div className="p-2.5 border-b border-surface-2 bg-surface-2/40 flex items-center justify-between text-zinc-300">
              <span className="font-semibold text-zinc-100 flex items-center gap-1.5">
                <Layers size={13} className="text-brand-light" />
                <span>Semantic Tree (@refs)</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-sans">ego-browser snapshot</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 text-[11px] leading-relaxed text-zinc-300">
              <pre className="whitespace-pre-wrap text-brand-light/90 font-mono">
                {dummyAxTree}
              </pre>
            </div>
            <div className="p-2 border-t border-surface-2 bg-surface-2/20 text-[10px] text-zinc-400 flex items-center gap-1">
              <Terminal size={11} className="text-brand-light" />
              <span>Agents interact using snapshot refs (e.g. click('@3'))</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
