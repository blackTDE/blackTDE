import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  Plus, 
  Trash2, 
  Pencil, 
  Star, 
  Eye, 
  EyeOff, 
  Cpu, 
  Layers, 
  KeyRound, 
  Blocks, 
  RefreshCw,
  Info
} from 'lucide-react';
import { ProviderVault } from './ProviderVault';

interface ProxyProvider {
  name: string;
  type: string;
  base_url: string;
  api_key: string;
  default_model: string;
  is_default: boolean;
}

interface ProxyVirtualModel {
  name: string;
  provider: string;
  model: string;
}

interface McpServerEntry {
  name: string;
  command: string;
  args: string;
}

const getAgentIconClass = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.includes('claude')) return 'from-orange-500 to-amber-600';
  if (lower.includes('gemini')) return 'from-blue-500 to-indigo-600';
  if (lower.includes('codex')) return 'from-emerald-500 to-teal-600';
  if (lower.includes('aider')) return 'from-purple-500 to-indigo-600';
  return 'from-indigo-600 to-fuchsia-600';
};

const getInitials = (name: string): string => {
  const clean = name.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
  const parts = clean.split(/[\s-]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (clean.length >= 2) {
    return clean.slice(0, 2).toUpperCase();
  }
  return clean.slice(0, 1).toUpperCase() || 'AG';
};

export const SettingsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'vault' | 'virtual-models' | 'providers' | 'mcp' | 'versions'>('virtual-models');

  // Redesigned Providers States
  const [providers, setProviders] = useState<ProxyProvider[]>([]);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [providerForm, setProviderForm] = useState({
    name: '',
    type: 'openai',
    base_url: '',
    api_key: '',
    default_model: '',
    is_default: false,
  });

  // Redesigned Virtual Models States
  const [vms, setVms] = useState<ProxyVirtualModel[]>([]);
  const [showVmModal, setShowVmModal] = useState(false);
  const [editingVm, setEditingVm] = useState<string | null>(null);
  const [vmForm, setVmForm] = useState({
    name: '',
    provider: '',
    model: '',
  });

  // MCP States
  const [mcpServers, setMcpServers] = useState<McpServerEntry[]>([]);
  const [mcpName, setMcpName] = useState('');
  const [mcpCommand, setMcpCommand] = useState('');
  const [mcpArgs, setMcpArgs] = useState('');

  // CLI Versions States
  const [versions, setVersions] = useState<Record<string, string>>({
    claude: 'Checking...',
    aider: 'Checking...',
    git: 'Checking...',
  });
  const [isVerifying, setIsVerifying] = useState(false);

  // ── Loading Methods ──────────────────────────────────────────────────────────

  const loadProviders = async () => {
    try {
      const list = await invoke<ProxyProvider[]>('get_proxy_providers');
      setProviders(list);
    } catch (e) {
      console.error('Failed to load proxy providers:', e);
    }
  };

  const loadVirtualModels = async () => {
    try {
      const list = await invoke<ProxyVirtualModel[]>('get_proxy_virtual_models');
      setVms(list);
    } catch (e) {
      console.error('Failed to load proxy virtual models:', e);
    }
  };

  const loadMcpServers = async () => {
    try {
      const list = await invoke<McpServerEntry[]>('get_mcp_servers');
      setMcpServers(list);
    } catch (e) {
      console.error('Failed to load MCP servers:', e);
    }
  };

  const checkVersions = async () => {
    setIsVerifying(true);
    const newVersions: Record<string, string> = {};
    for (const bin of ['claude', 'aider', 'git']) {
      try {
        const ver = await invoke<string>('check_cli_version', { binary: bin });
        newVersions[bin] = ver;
      } catch (err) {
        newVersions[bin] = 'Not Installed';
      }
    }
    setVersions(newVersions);
    setIsVerifying(false);
  };

  const reloadAll = async () => {
    await Promise.all([
      loadProviders(),
      loadVirtualModels(),
      loadMcpServers(),
      checkVersions()
    ]);
  };

  useEffect(() => {
    reloadAll();
  }, []);

  // ── Provider CRUD Actions ─────────────────────────────────────────────────────

  const openAddProvider = () => {
    setEditingProvider(null);
    setProviderForm({
      name: '',
      type: 'openai',
      base_url: '',
      api_key: '',
      default_model: '',
      is_default: providers.length === 0, // Make default if it's the first one
    });
    setShowProviderModal(true);
  };

  const openEditProvider = (p: ProxyProvider) => {
    setEditingProvider(p.name);
    setProviderForm({
      name: p.name,
      type: p.type,
      base_url: p.base_url,
      api_key: p.api_key,
      default_model: p.default_model,
      is_default: p.is_default,
    });
    setShowProviderModal(true);
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerForm.name.trim() || !providerForm.base_url.trim()) {
      alert('Name and Base URL are required');
      return;
    }
    try {
      await invoke('save_proxy_provider', {
        name: providerForm.name.trim(),
        rType: providerForm.type,
        baseUrl: providerForm.base_url.trim(),
        apiKey: providerForm.api_key.trim(),
        defaultModel: providerForm.default_model.trim(),
        isDefault: providerForm.is_default,
      });
      setShowProviderModal(false);
      await loadProviders();
    } catch (err) {
      alert('Error saving provider: ' + err);
    }
  };

  const handleDeleteProvider = async (name: string) => {
    if (!confirm(`Delete provider "${name}"?`)) return;
    try {
      await invoke('delete_proxy_provider', { name });
      await loadProviders();
    } catch (err) {
      alert('Error deleting provider: ' + err);
    }
  };

  const handleSetDefaultProvider = async (name: string) => {
    try {
      await invoke('set_default_proxy_provider', { name });
      await loadProviders();
    } catch (err) {
      alert('Error setting default: ' + err);
    }
  };

  // ── Virtual Model CRUD Actions ──────────────────────────────────────────────

  const openAddVm = () => {
    setEditingVm(null);
    setVmForm({
      name: '',
      provider: providers[0]?.name || '',
      model: '',
    });
    setShowVmModal(true);
  };

  const openEditVm = (v: ProxyVirtualModel) => {
    setEditingVm(v.name);
    setVmForm({
      name: v.name,
      provider: v.provider,
      model: v.model,
    });
    setShowVmModal(true);
  };

  const handleSaveVm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vmForm.name.trim() || !vmForm.provider || !vmForm.model.trim()) {
      alert('Name, Provider, and Target Model are required');
      return;
    }
    try {
      await invoke('save_proxy_virtual_model', {
        name: vmForm.name.trim(),
        provider: vmForm.provider,
        model: vmForm.model.trim(),
      });
      setShowVmModal(false);
      await loadVirtualModels();
    } catch (err) {
      alert('Error saving virtual model: ' + err);
    }
  };

  const handleDeleteVm = async (name: string) => {
    if (!confirm(`Delete virtual model "${name}"?`)) return;
    try {
      await invoke('delete_proxy_virtual_model', { name });
      await loadVirtualModels();
    } catch (err) {
      alert('Error deleting virtual model: ' + err);
    }
  };

  // ── MCP Actions ──────────────────────────────────────────────────────────────

  const handleSaveMcp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mcpName.trim() || !mcpCommand.trim()) {
      alert('Name and Command are required');
      return;
    }
    const argsArray = mcpArgs.trim() ? mcpArgs.split(/\s+/) : [];
    try {
      await invoke('save_mcp_server', {
        name: mcpName.trim(),
        command: mcpCommand.trim(),
        args: JSON.stringify(argsArray),
      });
      setMcpName('');
      setMcpCommand('');
      setMcpArgs('');
      await loadMcpServers();
      alert('MCP Server registered!');
    } catch (err) {
      alert('Error saving MCP: ' + err);
    }
  };

  return (
    <div className="w-full h-full bg-[#070b12] flex flex-col font-sans text-slate-200">
      
      {/* Top Tab Switcher */}
      <div className="shrink-0 bg-[#0b0f19] px-6 py-3.5 border-b border-slate-800/80 flex items-center justify-between select-none">
        <div className="flex items-center space-x-2">
          <Cpu className="text-brand-light w-4 h-4" />
          <h2 className="text-xs font-mono font-bold tracking-wide uppercase text-slate-300">TDE Engine Cockpit</h2>
        </div>
        <div className="flex space-x-1.5">
          {[
            { id: 'virtual-models', name: 'Agent Models', icon: Cpu },
            { id: 'providers', name: 'Providers', icon: Layers },
            { id: 'vault', name: 'Vault', icon: KeyRound },
            { id: 'mcp', name: 'MCP Servers', icon: Blocks },
            { id: 'versions', name: 'Versions', icon: Info },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold font-mono border transition ${
                  activeTab === t.id
                    ? 'bg-brand/10 text-brand-light border-brand/25 font-bold shadow-md shadow-brand/5'
                    : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon size={12} />
                <span>{t.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Contents Area */}
      <div className="flex-grow p-6 overflow-y-auto min-h-0 bg-[#070b12]">
        
        {/* ── TAB: Agent Models (Virtual Models) ── */}
        {activeTab === 'virtual-models' && (
          <div className="space-y-4 max-w-4xl">
            <div className="flex items-center justify-between select-none">
              <div>
                <h3 className="text-sm font-bold text-slate-200 font-mono">Agent Virtual Models</h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Map agent command triggers to target provider endpoints and backend model configurations</p>
              </div>
              <button
                onClick={openAddVm}
                className="flex items-center space-x-1 bg-brand hover:bg-brand/80 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
              >
                <Plus size={13} />
                <span>Add Agent Model</span>
              </button>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-hidden bg-[#0b0f19]/35">
              <table className="w-full text-left border-collapse font-mono">
                <thead>
                  <tr className="bg-slate-900/60 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-500 select-none">
                    <th className="px-4 py-2.5">Agent Command</th>
                    <th className="px-4 py-2.5">Mapped Provider</th>
                    <th className="px-4 py-2.5">Target Model</th>
                    <th className="w-20 px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {vms.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-slate-600 py-8 italic">
                        No agent virtual models configured. Add one to customize CLI routing.
                      </td>
                    </tr>
                  ) : (
                    vms.map((v) => (
                      <tr key={v.name} className="border-b border-slate-800/50 hover:bg-slate-800/10 transition">
                        <td className="px-4 py-3">
                          <div className="flex items-center space-x-2.5">
                            <div className={`flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-tr ${getAgentIconClass(v.name)} text-white font-extrabold text-[9px] shadow select-none`}>
                              {getInitials(v.name)}
                            </div>
                            <span className="font-bold text-slate-200">{v.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="bg-slate-800 border border-slate-700 text-slate-300 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase select-none">
                            {v.provider}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-mono truncate max-w-[200px]" title={v.model}>
                          {v.model}
                        </td>
                        <td className="px-4 py-3 text-right select-none">
                          <div className="flex justify-end space-x-1">
                            <button
                              onClick={() => openEditVm(v)}
                              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => handleDeleteVm(v.name)}
                              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB: Providers ── */}
        {activeTab === 'providers' && (
          <div className="space-y-4 max-w-4xl">
            <div className="flex items-center justify-between select-none">
              <div>
                <h3 className="text-sm font-bold text-slate-200 font-mono">LLM Providers</h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Register upstream LLM providers (e.g. OpenAI, Anthropic, LM Studio, Ollama, Cysic)</p>
              </div>
              <button
                onClick={openAddProvider}
                className="flex items-center space-x-1 bg-brand hover:bg-brand/80 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
              >
                <Plus size={13} />
                <span>Add Provider</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {providers.length === 0 ? (
                <div className="col-span-2 text-center text-slate-600 py-10 bg-[#0b0f19]/20 border border-slate-800/80 rounded-xl font-mono text-xs">
                  No LLM providers registered yet.
                </div>
              ) : (
                providers.map((p) => (
                  <div 
                    key={p.name} 
                    className={`p-4 rounded-xl border flex flex-col justify-between transition bg-[#0b0f19]/35 ${
                      p.is_default ? 'border-brand/40 shadow shadow-brand/5' : 'border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <h4 className="text-xs font-bold font-mono text-slate-200 uppercase">{p.name}</h4>
                          <span className="text-[8px] px-1.5 py-0.2 bg-slate-800 border border-slate-750 text-slate-400 rounded-full font-mono uppercase font-bold select-none">
                            {p.type}
                          </span>
                        </div>
                        <button
                          onClick={() => handleSetDefaultProvider(p.name)}
                          className={`p-1 rounded transition select-none ${p.is_default ? 'text-amber-400 bg-amber-400/5' : 'text-slate-600 hover:text-slate-400'}`}
                          title={p.is_default ? 'Default Provider' : 'Set as Default'}
                        >
                          <Star size={13} fill={p.is_default ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                      <div className="mt-3 space-y-1 font-mono text-[9px]">
                        <p className="text-slate-500 truncate">URL: <span className="text-slate-350">{p.base_url}</span></p>
                        <p className="text-slate-500 truncate">Model: <span className="text-slate-350">{p.default_model}</span></p>
                        <p className="text-slate-500">Key: <span className="text-slate-550">{p.api_key ? '••••••••' : 'None'}</span></p>
                      </div>
                    </div>
                    <div className="flex justify-end space-x-1.5 mt-4 border-t border-slate-800/40 pt-2 select-none">
                      <button
                        onClick={() => openEditProvider(p)}
                        className="text-[10px] font-semibold text-slate-450 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-800/40 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteProvider(p.name)}
                        className="text-[10px] font-semibold text-slate-450 hover:text-rose-400 px-2 py-1 rounded hover:bg-slate-800/40 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── TAB: Vault (Credentials) ── */}
        {activeTab === 'vault' && (
          <div className="h-full">
            <ProviderVault />
          </div>
        )}

        {/* ── TAB: MCP Servers ── */}
        {activeTab === 'mcp' && (
          <div className="space-y-4 flex flex-col md:flex-row md:space-x-6 md:space-y-0 h-full max-w-5xl">
            
            {/* Left side list */}
            <div className="flex-1 space-y-3">
              <h3 className="text-xs font-bold font-mono text-slate-400 select-none">Registered Model Context Protocol (MCP) Servers</h3>
              {mcpServers.length === 0 ? (
                <div className="text-xs text-slate-500 bg-slate-900/10 border border-slate-800 rounded-xl p-6 text-center font-mono">
                  No MCP servers registered. Configure one on the right.
                </div>
              ) : (
                <div className="space-y-2 font-mono">
                  {mcpServers.map((s) => {
                    const argsArr = JSON.parse(s.args) as string[];
                    return (
                      <div
                        key={s.name}
                        className="p-3 bg-[#0b0f19]/35 border border-slate-800/80 rounded-lg flex items-center justify-between"
                      >
                        <div>
                          <h4 className="text-xs font-semibold text-slate-200">{s.name}</h4>
                          <p className="text-[9px] text-slate-400 mt-1">Command: <span className="text-amber-400/85">{s.command}</span></p>
                          <p className="text-[9px] text-slate-500 mt-0.5">Args: {argsArr.join(' ')}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right side form */}
            <div className="w-full md:w-80 bg-[#0b0f19]/30 border border-slate-800/80 rounded-xl p-4 flex flex-col space-y-3.5 h-fit select-none">
              <div className="flex items-center space-x-1.5 text-slate-400">
                <Layers size={14} className="text-brand-light" />
                <h3 className="text-[10px] font-bold uppercase tracking-wider">Register MCP Server</h3>
              </div>

              <form onSubmit={handleSaveMcp} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium font-mono text-[9px] uppercase">Server Name</label>
                  <input
                    type="text"
                    value={mcpName}
                    onChange={(e) => setMcpName(e.target.value)}
                    placeholder="e.g. memory-server"
                    className="w-full bg-[#161d2a] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium font-mono text-[9px] uppercase">Command Executable</label>
                  <input
                    type="text"
                    value={mcpCommand}
                    onChange={(e) => setMcpCommand(e.target.value)}
                    placeholder="npx"
                    className="w-full bg-[#161d2a] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium font-mono text-[9px] uppercase">Arguments (space separated)</label>
                  <input
                    type="text"
                    value={mcpArgs}
                    onChange={(e) => setMcpArgs(e.target.value)}
                    placeholder="-y @modelcontextprotocol/server-memory"
                    className="w-full bg-[#161d2a] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center space-x-1.5 bg-brand hover:bg-brand/80 text-white font-bold py-2 px-3 rounded shadow transition text-xs"
                >
                  <Plus size={13} />
                  <span>Add MCP Server</span>
                </button>
              </form>
            </div>

          </div>
        )}

        {/* ── TAB: CLI Versions ── */}
        {activeTab === 'versions' && (
          <div className="space-y-4 max-w-xl select-none">
            <h3 className="text-xs font-bold font-mono text-slate-400">Agent CLI Command Versions</h3>
            
            <div className="bg-[#0b0f19]/35 border border-slate-800/80 rounded-xl divide-y divide-slate-800/40 font-mono text-xs">
              {[
                { name: 'Claude Code CLI', bin: 'claude', val: versions.claude },
                { name: 'Aider Code Agent', bin: 'aider', val: versions.aider },
                { name: 'Git System CLI', bin: 'git', val: versions.git },
              ].map((item) => (
                <div key={item.bin} className="p-3.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-200">{item.name}</span>
                    <p className="text-[9px] text-slate-500 mt-1">Binary: <span className="text-slate-400">{item.bin}</span></p>
                  </div>
                  <div className="text-slate-350 bg-slate-800/50 px-2.5 py-1 rounded border border-slate-700/60 text-[10px]">
                    {item.val}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={checkVersions}
              disabled={isVerifying}
              className="flex items-center space-x-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 active:bg-slate-650 disabled:bg-slate-850 text-slate-200 px-3 py-1.5 rounded-lg transition text-xs font-semibold"
            >
              <RefreshCw size={12} className={isVerifying ? 'animate-spin' : ''} />
              <span>Verify Versions</span>
            </button>
          </div>
        )}

      </div>

      {/* ── PROMPT MODAL: Mapped Agent Model Form ── */}
      {showVmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm select-none">
          <div className="bg-[#0b0f19] border border-slate-800 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-200 border-b border-slate-800 pb-2">
              {editingVm ? `Edit Model "${editingVm}"` : 'Add Agent Model'}
            </h3>
            <form onSubmit={handleSaveVm} className="space-y-3.5 text-xs">
              {!editingVm && (
                <div>
                  <label className="block text-slate-400 mb-1 font-mono text-[9px] uppercase">Agent Trigger Name</label>
                  <input
                    type="text"
                    value={vmForm.name}
                    onChange={(e) => setVmForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. claude, codex, aider"
                    className="w-full bg-[#161d2a] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
                  />
                </div>
              )}
              <div>
                <label className="block text-slate-400 mb-1 font-mono text-[9px] uppercase">Mapped Provider</label>
                <select
                  value={vmForm.provider}
                  onChange={(e) => setVmForm(f => ({ ...f, provider: e.target.value }))}
                  className="w-full bg-[#161d2a] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-semibold font-mono"
                >
                  <option value="">— select —</option>
                  {providers.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-mono text-[9px] uppercase">Backend Model Name</label>
                <input
                  type="text"
                  value={vmForm.model}
                  onChange={(e) => setVmForm(f => ({ ...f, model: e.target.value }))}
                  placeholder="e.g. deepseek-v4-flash, claude-3-5-sonnet"
                  className="w-full bg-[#161d2a] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800/65">
                <button
                  type="button"
                  onClick={() => setShowVmModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-brand hover:bg-brand/80 text-white font-bold"
                >
                  Save Model
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── PROMPT MODAL: Provider Form ── */}
      {showProviderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm select-none">
          <div className="bg-[#0b0f19] border border-slate-800 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-200 border-b border-slate-800 pb-2">
              {editingProvider ? `Edit Provider "${editingProvider}"` : 'Add LLM Provider'}
            </h3>
            <form onSubmit={handleSaveProvider} className="space-y-3.5 text-xs">
              {!editingProvider && (
                <div>
                  <label className="block text-slate-400 mb-1 font-mono text-[9px] uppercase">Provider Name</label>
                  <input
                    type="text"
                    value={providerForm.name}
                    onChange={(e) => setProviderForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. cysic, ollama, lm-studio"
                    className="w-full bg-[#161d2a] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
                  />
                </div>
              )}
              <div>
                <label className="block text-slate-400 mb-1 font-mono text-[9px] uppercase">Protocol Type</label>
                <select
                  value={providerForm.type}
                  onChange={(e) => setProviderForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full bg-[#161d2a] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-semibold font-mono"
                >
                  <option value="openai">OpenAI Compatible</option>
                  <option value="anthropic">Anthropic API</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-mono text-[9px] uppercase">Base URL endpoint</label>
                <input
                  type="text"
                  value={providerForm.base_url}
                  onChange={(e) => setProviderForm(f => ({ ...f, base_url: e.target.value }))}
                  placeholder="https://token-ai.cysic.xyz/v1"
                  className="w-full bg-[#161d2a] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-mono text-[9px] uppercase">API Key / Token</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={providerForm.api_key}
                    onChange={(e) => setProviderForm(f => ({ ...f, api_key: e.target.value }))}
                    placeholder="Provide token if required..."
                    className="w-full bg-[#161d2a] border border-slate-700/60 rounded px-2.5 py-1.5 pr-8 text-slate-200 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-2 text-slate-500 hover:text-slate-350"
                  >
                    {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-mono text-[9px] uppercase">Default Model ID</label>
                <input
                  type="text"
                  value={providerForm.default_model}
                  onChange={(e) => setProviderForm(f => ({ ...f, default_model: e.target.value }))}
                  placeholder="deepseek-v4-flash"
                  className="w-full bg-[#161d2a] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
                />
              </div>

              <div className="flex items-center space-x-2 py-1">
                <input
                  type="checkbox"
                  id="prov-default"
                  checked={providerForm.is_default}
                  onChange={(e) => setProviderForm(f => ({ ...f, is_default: e.target.checked }))}
                  className="rounded bg-slate-900 border-slate-700 text-brand focus:ring-transparent w-3.5 h-3.5"
                />
                <label htmlFor="prov-default" className="text-slate-400 font-medium select-none">Set as Default Provider</label>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800/65">
                <button
                  type="button"
                  onClick={() => setShowProviderModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-brand hover:bg-brand/80 text-white font-bold"
                >
                  Save Provider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
