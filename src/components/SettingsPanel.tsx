import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  KeyRound, 
  ShieldAlert, 
  Cpu, 
  Layers, 
  Save, 
  CheckCircle, 
  HelpCircle, 
  Terminal, 
  RefreshCw,
  Plus,
  Trash2
} from 'lucide-react';
import { ProviderVault } from './ProviderVault';

interface LocalProxyEntry {
  id: string;
  provider: string;
  base_url: string;
  default_model: string;
  active: boolean;
}

interface McpServerEntry {
  name: string;
  command: string;
  args: string;
}

export const SettingsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'vault' | 'proxies' | 'mcp' | 'versions'>('vault');

  // Proxies state
  const [proxies, setProxies] = useState<LocalProxyEntry[]>([]);
  const [proxyProvider, setProxyProvider] = useState('ollama');
  const [proxyUrl, setProxyUrl] = useState('http://localhost:11434');
  const [proxyModel, setProxyModel] = useState('llama3');
  const [proxyActive, setProxyActive] = useState(true);

  // MCP state
  const [mcpServers, setMcpServers] = useState<McpServerEntry[]>([]);
  const [mcpName, setMcpName] = useState('');
  const [mcpCommand, setMcpCommand] = useState('');
  const [mcpArgs, setMcpArgs] = useState('');

  // Versions state
  const [versions, setVersions] = useState<Record<string, string>>({
    claude: 'Checking...',
    aider: 'Checking...',
    git: 'Checking...',
  });
  const [isVerifying, setIsVerifying] = useState(false);

  // Load Proxies
  const loadProxies = async () => {
    try {
      const list = await invoke<LocalProxyEntry[]>('get_local_proxies');
      setProxies(list);
    } catch (e) {
      console.error(e);
    }
  };

  // Load MCP
  const loadMcpServers = async () => {
    try {
      const list = await invoke<McpServerEntry[]>('get_mcp_servers');
      setMcpServers(list);
    } catch (e) {
      console.error(e);
    }
  };

  // Check Versions
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

  // Save Proxy
  const handleSaveProxy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proxyUrl.trim() || !proxyModel.trim()) {
      alert('Please fill out all fields');
      return;
    }
    const newId = 'proxy_' + Math.random().toString(36).substring(2, 9);
    try {
      await invoke('save_local_proxy', {
        id: newId,
        provider: proxyProvider,
        baseUrl: proxyUrl.trim(),
        defaultModel: proxyModel.trim(),
        active: proxyActive,
      });
      setProxyUrl('');
      setProxyModel('');
      await loadProxies();
      alert('Local LLM Proxy config saved!');
    } catch (err) {
      alert('Error saving proxy: ' + err);
    }
  };

  // Set Proxy Active Toggle
  const handleToggleProxy = async (proxy: LocalProxyEntry) => {
    try {
      await invoke('save_local_proxy', {
        id: proxy.id,
        provider: proxy.provider,
        baseUrl: proxy.base_url,
        defaultModel: proxy.default_model,
        active: !proxy.active,
      });
      await loadProxies();
    } catch (err) {
      alert('Error toggling proxy: ' + err);
    }
  };

  // Save MCP
  const handleSaveMcp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mcpName.trim() || !mcpCommand.trim()) {
      alert('Please fill out Name and Command');
      return;
    }
    // Convert space separated arguments to JSON string array
    const argsArray = mcpArgs.trim() ? mcpArgs.split(/\s+/) : [];
    const argsJson = JSON.stringify(argsArray);

    try {
      await invoke('save_mcp_server', {
        name: mcpName.trim(),
        command: mcpCommand.trim(),
        args: argsJson,
      });
      setMcpName('');
      setMcpCommand('');
      setMcpArgs('');
      await loadMcpServers();
      alert('MCP Server registered successfully!');
    } catch (err) {
      alert('Error saving MCP server: ' + err);
    }
  };

  useEffect(() => {
    loadProxies();
    loadMcpServers();
    checkVersions();
  }, []);

  return (
    <div className="w-full h-full bg-[#0f172a] rounded-lg border border-slate-700 flex flex-col overflow-hidden">
      {/* Settings Navigation */}
      <div className="bg-[#0b0f19] px-3 py-2 border-b border-slate-800 flex items-center justify-between select-none">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('vault')}
            className={`px-3 py-1 rounded text-xs font-semibold font-mono border transition ${
              activeTab === 'vault'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            Vault
          </button>
          <button
            onClick={() => setActiveTab('proxies')}
            className={`px-3 py-1 rounded text-xs font-semibold font-mono border transition ${
              activeTab === 'proxies'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            Proxies
          </button>
          <button
            onClick={() => setActiveTab('mcp')}
            className={`px-3 py-1 rounded text-xs font-semibold font-mono border transition ${
              activeTab === 'mcp'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            MCP
          </button>
          <button
            onClick={() => setActiveTab('versions')}
            className={`px-3 py-1 rounded text-xs font-semibold font-mono border transition ${
              activeTab === 'versions'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            CLI Versions
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="flex-grow p-4 overflow-y-auto min-h-0">
        
        {/* TAB 1: credentials Vault */}
        {activeTab === 'vault' && (
          <div className="h-full">
            <ProviderVault />
          </div>
        )}

        {/* TAB 2: local LLM Proxies */}
        {activeTab === 'proxies' && (
          <div className="space-y-4 flex flex-col md:flex-row md:space-x-4 md:space-y-0 h-full">
            
            {/* Left side list */}
            <div className="flex-1 space-y-3">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Configured Local LLM Proxies</h3>
              {proxies.length === 0 ? (
                <div className="text-xs text-slate-500 bg-slate-900/30 border border-slate-800 rounded p-4 text-center font-mono">
                  No local LLM proxies configured. Add one on the right.
                </div>
              ) : (
                <div className="space-y-2">
                  {proxies.map(p => (
                    <div
                      key={p.id}
                      onClick={() => handleToggleProxy(p)}
                      className={`p-3 rounded border cursor-pointer transition flex items-center justify-between ${
                        p.active
                          ? 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10'
                          : 'bg-slate-900/40 border-slate-800 hover:bg-slate-850/60'
                      }`}
                    >
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <h4 className="text-xs font-semibold text-slate-200 uppercase">{p.provider}</h4>
                          <span className="text-[8px] bg-slate-800 border border-slate-700 text-slate-400 px-1 rounded font-mono">{p.default_model}</span>
                        </div>
                        <p className="text-[9px] text-slate-500 font-mono mt-1">{p.base_url}</p>
                      </div>
                      {p.active ? (
                        <div className="flex items-center space-x-1 text-emerald-400 text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          <CheckCircle size={10} />
                          <span>Active override</span>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-600 px-2 py-0.5">
                          Inactive
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right side form */}
            <div className="w-full md:w-80 bg-slate-900/30 border border-slate-800 rounded p-4 flex flex-col space-y-3.5 h-fit select-none">
              <div className="flex items-center space-x-1.5 text-slate-400">
                <Cpu size={14} className="text-amber-500" />
                <h3 className="text-[10px] font-bold uppercase tracking-wider">Add Local LLM Proxy</h3>
              </div>

              <form onSubmit={handleSaveProxy} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Provider Type</label>
                  <select
                    value={proxyProvider}
                    onChange={(e) => {
                      const val = e.target.value;
                      setProxyProvider(val);
                      if (val === 'ollama') {
                        setProxyUrl('http://localhost:11434');
                        setProxyModel('llama3');
                      } else if (val === 'lm-studio') {
                        setProxyUrl('http://localhost:1234');
                        setProxyModel('qwen2.5-coder');
                      }
                    }}
                    className="w-full bg-[#1e293b] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500 font-semibold"
                  >
                    <option value="ollama">Ollama</option>
                    <option value="lm-studio">LM Studio</option>
                    <option value="custom">Custom API Proxy</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Base URL endpoint</label>
                  <input
                    type="text"
                    value={proxyUrl}
                    onChange={(e) => setProxyUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="w-full bg-[#1e293b] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Model Name</label>
                  <input
                    type="text"
                    value={proxyModel}
                    onChange={(e) => setProxyModel(e.target.value)}
                    placeholder="llama3"
                    className="w-full bg-[#1e293b] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="proxy-active"
                    checked={proxyActive}
                    onChange={(e) => setProxyActive(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-transparent"
                  />
                  <label htmlFor="proxy-active" className="text-slate-400 font-medium">Set as active override</label>
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center space-x-1.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-bold py-2 px-3 rounded shadow shadow-amber-500/20 transition text-xs"
                >
                  <Save size={13} />
                  <span>Register Proxy</span>
                </button>
              </form>
            </div>

          </div>
        )}

        {/* TAB 3: MCP servers configurator */}
        {activeTab === 'mcp' && (
          <div className="space-y-4 flex flex-col md:flex-row md:space-x-4 md:space-y-0 h-full">
            
            {/* Left side List */}
            <div className="flex-1 space-y-3">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Registered Model Context Protocol (MCP) Servers</h3>
              {mcpServers.length === 0 ? (
                <div className="text-xs text-slate-500 bg-slate-900/30 border border-slate-800 rounded p-4 text-center font-mono">
                  No MCP servers registered. Configure one on the right.
                </div>
              ) : (
                <div className="space-y-2 font-mono">
                  {mcpServers.map(s => {
                    const argsArr = JSON.parse(s.args) as string[];
                    return (
                      <div
                        key={s.name}
                        className="p-3 bg-slate-900/40 border border-slate-850 rounded flex items-center justify-between"
                      >
                        <div>
                          <h4 className="text-xs font-semibold text-slate-200">{s.name}</h4>
                          <p className="text-[9px] text-slate-400 mt-1">Command: <span className="text-amber-400/80">{s.command}</span></p>
                          <p className="text-[9px] text-slate-500 mt-0.5">Args: {argsArr.join(' ')}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right side form */}
            <div className="w-full md:w-80 bg-slate-900/30 border border-slate-800 rounded p-4 flex flex-col space-y-3.5 h-fit select-none">
              <div className="flex items-center space-x-1.5 text-slate-400">
                <Layers size={14} className="text-amber-500" />
                <h3 className="text-[10px] font-bold uppercase tracking-wider">Register MCP Server</h3>
              </div>

              <form onSubmit={handleSaveMcp} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Server Name</label>
                  <input
                    type="text"
                    value={mcpName}
                    onChange={(e) => setMcpName(e.target.value)}
                    placeholder="e.g. memory-server"
                    className="w-full bg-[#1e293b] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Command Executable</label>
                  <input
                    type="text"
                    value={mcpCommand}
                    onChange={(e) => setMcpCommand(e.target.value)}
                    placeholder="npx"
                    className="w-full bg-[#1e293b] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Arguments (space separated)</label>
                  <input
                    type="text"
                    value={mcpArgs}
                    onChange={(e) => setMcpArgs(e.target.value)}
                    placeholder="-y @modelcontextprotocol/server-memory"
                    className="w-full bg-[#1e293b] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center space-x-1.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-bold py-2 px-3 rounded shadow shadow-amber-500/20 transition text-xs"
                >
                  <Plus size={13} />
                  <span>Add MCP Server</span>
                </button>
              </form>
            </div>

          </div>
        )}

        {/* TAB 4: CLI Versions & Verification */}
        {activeTab === 'versions' && (
          <div className="space-y-4 max-w-xl select-none">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Agent CLI Command Versions</h3>
            
            <div className="bg-slate-900/40 border border-slate-800 rounded divide-y divide-slate-850 font-mono text-xs">
              <div className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-200">Claude Code CLI</span>
                  <p className="text-[9px] text-slate-500 mt-1">Binary: <span className="text-slate-400">claude</span></p>
                </div>
                <div className="text-slate-300 bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700 text-[10px]">
                  {versions.claude}
                </div>
              </div>

              <div className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-200">Aider Code Agent</span>
                  <p className="text-[9px] text-slate-500 mt-1">Binary: <span className="text-slate-400">aider</span></p>
                </div>
                <div className="text-slate-300 bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700 text-[10px]">
                  {versions.aider}
                </div>
              </div>

              <div className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-200">Git System CLI</span>
                  <p className="text-[9px] text-slate-500 mt-1">Binary: <span className="text-slate-400">git</span></p>
                </div>
                <div className="text-slate-300 bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700 text-[10px]">
                  {versions.git}
                </div>
              </div>
            </div>

            <button
              onClick={checkVersions}
              disabled={isVerifying}
              className="flex items-center space-x-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 active:bg-slate-650 disabled:bg-slate-850 text-slate-200 px-3 py-1.5 rounded transition text-xs font-semibold"
            >
              <RefreshCw size={12} className={isVerifying ? 'animate-spin' : ''} />
              <span>Verify Versions</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
