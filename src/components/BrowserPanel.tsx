import React, { useState } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
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
  Sparkles,
  Terminal,
  X
} from 'lucide-react';

interface TaskSpaceSummary {
  id: string;
  name: string;
  url: string;
  title: string;
  ownership: 'agent' | 'user';
  lastActive: number;
}

export const BrowserPanel: React.FC = () => {
  const { setActiveRightPanel } = useWorkspaceStore();
  const [urlInput, setUrlInput] = useState<string>('https://google.com');
  const [currentUrl, setCurrentUrl] = useState<string>('https://google.com');
  const [ownership, setOwnership] = useState<'agent' | 'user'>('agent');
  const [activeTaskSpace] = useState<TaskSpaceSummary | null>({
    id: '1',
    name: 'ego-agent-session',
    url: 'https://google.com',
    title: 'Google',
    ownership: 'agent',
    lastActive: Date.now()
  });
  const [showInspector, setShowInspector] = useState<boolean>(false);
  const dummySnapshotTree = `[Root WebArea, loc="page"]\n  [banner]\n    [navigation]\n      [link "About", ref=1, loc="a:text('About')"]\n      [link "Store", ref=2, loc="a:text('Store')"]\n  [main]\n    [searchbox "Search", ref=3, loc="textarea[name='q']"]\n    [button "Google Search", ref=4, loc="input[name='btnK']"]\n    [button "I'm Feeling Lucky", ref=5, loc="input[name='btnI']"]`;

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    let target = urlInput.trim();
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = `https://${target}`;
    }
    setCurrentUrl(target);
    setUrlInput(target);
  };

  const toggleOwnership = () => {
    setOwnership((prev) => (prev === 'agent' ? 'user' : 'agent'));
  };

  return (
    <div className="flex flex-col h-full bg-surface-1 border-l border-surface-2 text-zinc-300 font-sans text-xs">
      {/* Top Header */}
      <div className="p-3 border-b border-surface-2 flex items-center justify-between bg-surface-2/30">
        <div className="flex items-center space-x-2">
          <Globe className="w-4 h-4 text-brand-light" />
          <span className="font-semibold text-zinc-100 text-sm">ego-lite Browser</span>
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono font-medium border flex items-center gap-1 ${
              ownership === 'agent'
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40'
                : 'bg-amber-950/40 text-amber-300 border-amber-800/40'
            }`}
          >
            {ownership === 'agent' ? <Bot className="w-2.5 h-2.5" /> : <UserCheck className="w-2.5 h-2.5" />}
            <span>{ownership === 'agent' ? 'Agent Driving' : 'User Control'}</span>
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

      {/* Navigation URL Toolbar */}
      <div className="p-2 border-b border-surface-2 bg-surface-1/80 flex items-center space-x-1.5">
        <div className="flex items-center space-x-1 text-zinc-400">
          <button
            type="button"
            className="p-1 hover:bg-surface-2 rounded hover:text-zinc-200 transition disabled:opacity-30"
            title="Back"
          >
            <ArrowLeft className="w-3 h-3" />
          </button>
          <button
            type="button"
            className="p-1 hover:bg-surface-2 rounded hover:text-zinc-200 transition disabled:opacity-30"
            title="Forward"
          >
            <ArrowRight className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => setCurrentUrl(currentUrl)}
            className="p-1 hover:bg-surface-2 rounded hover:text-zinc-200 transition"
            title="Reload"
          >
            <RotateCw className="w-3 h-3" />
          </button>
        </div>

        <form onSubmit={handleNavigate} className="flex-1 flex items-center">
          <div className="relative w-full flex items-center">
            <ShieldCheck className="w-3 h-3 text-emerald-400 absolute left-2 pointer-events-none" />
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              onKeyUp={(e) => e.stopPropagation()}
              className="w-full bg-surface-2 border border-surface-3 rounded pl-7 pr-6 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-brand font-mono truncate"
              placeholder="https://example.com"
            />
          </div>
        </form>

        <button
          type="button"
          onClick={() => window.open(currentUrl, '_blank')}
          className="p-1 hover:bg-surface-2 rounded text-zinc-400 hover:text-zinc-200 transition"
          title="Open in ego lite Desktop"
        >
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      {/* Control Banner & Handoff Action */}
      <div className="px-3 py-1.5 border-b border-surface-2 bg-surface-2/20 flex items-center justify-between text-[11px]">
        <div className="flex items-center space-x-1.5 truncate">
          <span className="text-zinc-500 font-mono">TaskSpace:</span>
          <span className="text-brand-light font-mono font-medium truncate">
            {activeTaskSpace?.name || 'default'}
          </span>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setShowInspector(!showInspector)}
            className={`px-2 py-0.5 rounded border text-[10px] font-mono flex items-center gap-1 transition ${
              showInspector
                ? 'bg-brand/20 border-brand/50 text-brand-light'
                : 'bg-surface-2 border-surface-3 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Toggle AX Semantic Tree Inspector"
          >
            <Layers className="w-2.5 h-2.5" />
            <span>AX Tree</span>
          </button>

          <button
            onClick={toggleOwnership}
            className={`px-2 py-0.5 rounded border text-[10px] font-sans font-medium flex items-center gap-1 transition ${
              ownership === 'agent'
                ? 'bg-amber-950/30 border-amber-800/40 text-amber-300 hover:bg-amber-900/40'
                : 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300 hover:bg-emerald-900/40'
            }`}
            title={ownership === 'agent' ? 'Take manual control (Pause Agent)' : 'Hand control back to Agent'}
          >
            {ownership === 'agent' ? (
              <>
                <UserCheck className="w-2.5 h-2.5" />
                <span>Take Control</span>
              </>
            ) : (
              <>
                <Bot className="w-2.5 h-2.5" />
                <span>Hand to Agent</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Viewport Content Area */}
      <div className="flex-1 flex flex-col min-h-0 bg-surface/50 relative overflow-hidden">
        {showInspector ? (
          <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed bg-surface-1 text-zinc-300 space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-surface-2 text-zinc-400">
              <span className="text-[10px] uppercase tracking-wider font-bold">Semantic AX Tree (@refs)</span>
              <span className="text-[9px] bg-surface-2 px-1 rounded text-zinc-400">snapshotText()</span>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-brand-light/90 selection:bg-brand/30">
              {dummySnapshotTree}
            </pre>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand-light shadow-lg">
              <Globe className="w-6 h-6" />
            </div>

            <div className="space-y-1.5 max-w-xs">
              <h4 className="font-semibold text-zinc-200 text-sm">ego-lite Browser Embedded</h4>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Antigravity CLI drives this browser session via Task Spaces. Login state is inherited without stealing your tabs.
              </p>
            </div>

            <div className="p-3 bg-surface-2/60 border border-surface-3 rounded-lg text-left w-full max-w-xs font-mono text-[10px] space-y-1 text-zinc-400">
              <div className="text-zinc-500 font-sans font-medium text-[11px] pb-1 border-b border-surface-3/50 flex items-center gap-1.5">
                <Terminal className="w-3 h-3 text-brand-light" />
                <span>CLI Usage in Terminal:</span>
              </div>
              <p className="text-zinc-300 pt-1">ego-browser nodejs &lt;&lt;'EOF'</p>
              <p className="text-zinc-400 pl-2">const task = await useOrCreateTaskSpace('inspect');</p>
              <p className="text-zinc-400 pl-2">await openOrReuseTab('{currentUrl}');</p>
              <p className="text-zinc-400 pl-2">cliLog(await snapshotText());</p>
              <p className="text-zinc-300">EOF</p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setOwnership('agent')}
                className="px-3 py-1.5 bg-brand hover:bg-brand-dark text-white rounded text-xs font-medium transition shadow-sm flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Ready for Agent</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Footer Info */}
      <div className="p-2 border-t border-surface-2 bg-surface-1/90 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
        <div className="truncate max-w-[200px]" title={currentUrl}>
          {currentUrl}
        </div>
        <div className="flex items-center space-x-2">
          <span>1280x800</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="CDP Connected" />
        </div>
      </div>
    </div>
  );
};
