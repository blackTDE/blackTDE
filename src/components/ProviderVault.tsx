import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { KeyRound, ShieldAlert, CheckCircle, HelpCircle, Save } from 'lucide-react';

interface ProviderKeyEntry {
  provider: string;
  has_key: boolean;
}

const PROVIDER_METADATA: Record<string, { name: string; desc: string }> = {
  anthropic: {
    name: 'Anthropic (Claude Code)',
    desc: 'Pre-injects ANTHROPIC_API_KEY environment variable. Typical key format: sk-ant-...',
  },
  openai: {
    name: 'OpenAI (Aider / Custom)',
    desc: 'Pre-injects OPENAI_API_KEY environment variable. Typical key format: sk-proj-...',
  },
  gemini: {
    name: 'Google Gemini',
    desc: 'Pre-injects GEMINI_API_KEY environment variable. Typical key format: AIzaSy...',
  },
  deepseek: {
    name: 'DeepSeek API',
    desc: 'Pre-injects DEEPSEEK_API_KEY environment variable. Typical key format: sk-...',
  },
};

export const ProviderVault: React.FC = () => {
  const [configuredProviders, setConfiguredProviders] = useState<Record<string, boolean>>({});
  const [selectedProvider, setSelectedProvider] = useState('anthropic');
  const [keyInput, setKeyInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loadProviderKeys = async () => {
    try {
      const keys = await invoke<ProviderKeyEntry[]>('get_provider_keys');
      const statusMap: Record<string, boolean> = {};
      
      // Default all keys to false
      Object.keys(PROVIDER_METADATA).forEach(p => {
        statusMap[p] = false;
      });

      // Populate configured ones
      keys.forEach(entry => {
        statusMap[entry.provider] = entry.has_key;
      });

      setConfiguredProviders(statusMap);
    } catch (err) {
      console.error('Failed to load provider credentials status:', err);
    }
  };

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) {
      alert('Please enter a valid API key');
      return;
    }
    
    setIsLoading(true);
    try {
      await invoke('save_provider_key', {
        provider: selectedProvider,
        apiKey: keyInput.trim(),
      });
      setKeyInput('');
      await loadProviderKeys();
      alert(`API key for ${PROVIDER_METADATA[selectedProvider].name} saved successfully!`);
    } catch (err) {
      alert('Failed to save API key: ' + err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProviderKeys();
  }, []);

  return (
    <div className="w-full h-full bg-[#1e1e1e] rounded-lg border border-slate-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-[#171717] px-3 py-2 border-b border-slate-800 flex items-center space-x-2 select-none">
        <KeyRound size={14} className="text-amber-400" />
        <span className="text-xs font-mono font-bold text-slate-300">Credentials vault</span>
      </div>

      {/* Main split dashboard */}
      <div className="flex-grow p-4 flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4 overflow-y-auto min-h-0">
        
        {/* Left Side: Configuration status list */}
        <div className="flex-1 flex flex-col space-y-3 select-none">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vault Configuration Status</h3>
          <div className="space-y-2">
            {Object.entries(PROVIDER_METADATA).map(([id, meta]) => {
              const hasKey = configuredProviders[id] || false;
              return (
                <div
                  key={id}
                  onClick={() => setSelectedProvider(id)}
                  className={`p-3 rounded border cursor-pointer transition flex items-center justify-between ${
                    selectedProvider === id
                      ? 'bg-slate-800/80 border-amber-500/30'
                      : 'bg-slate-900/40 border-slate-800 hover:bg-slate-850/60'
                  }`}
                >
                  <div>
                    <h4 className="text-xs font-semibold text-slate-200">{meta.name}</h4>
                    <p className="text-[9px] text-slate-500 font-mono mt-0.5 max-w-xs">{meta.desc}</p>
                  </div>
                  {hasKey ? (
                    <div className="flex items-center space-x-1 text-emerald-400 text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      <CheckCircle size={10} />
                      <span>Active</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1 text-slate-500 text-[10px] bg-slate-800 px-2 py-0.5 rounded border border-slate-750">
                      <HelpCircle size={10} />
                      <span>Not Set</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Setup form */}
        <div className="w-full md:w-80 bg-slate-900/30 border border-slate-800 rounded p-3.5 flex flex-col space-y-3.5 select-none h-fit">
          <div className="flex items-center space-x-1.5 text-slate-400">
            <ShieldAlert size={14} className="text-amber-500" />
            <h3 className="text-[10px] font-bold uppercase tracking-wider">Configure Credentials</h3>
          </div>

          <form onSubmit={handleSaveKey} className="space-y-3">
            <div className="text-xs">
              <label className="block text-slate-400 mb-1 font-medium">Selected Provider</label>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="w-full bg-[#262626] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500 font-semibold"
              >
                {Object.entries(PROVIDER_METADATA).map(([id, meta]) => (
                  <option key={id} value={id}>
                    {meta.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-xs">
              <label className="block text-slate-400 mb-1 font-medium">API Token Key</label>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Paste API Key here..."
                className="w-full bg-[#262626] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center space-x-1.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 disabled:bg-slate-800 text-slate-950 font-bold py-2 px-3 rounded shadow shadow-amber-500/20 transition text-xs"
            >
              <Save size={13} />
              <span>Save Credentials</span>
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};
