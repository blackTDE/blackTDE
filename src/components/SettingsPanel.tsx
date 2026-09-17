import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
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
  Info,
  Globe,
  Download,
  CheckCircle2,
  AlertCircle,
  Terminal,
  ExternalLink,
  Radio,
  Send,
  ShieldCheck,
  Key,
  Smartphone,
  AlertTriangle,
  HelpCircle,
  Zap,
  Copy
} from 'lucide-react';
import { ProviderVault } from './ProviderVault';
import { AgentIcon } from './AgentIcon';
import { useWorkspaceStore } from '../store/workspaceStore';
import { normalizePairCode } from '../remoteUtils';

export interface EgoLiteStatus {
  is_installed: boolean;
  app_path: string | null;
  cli_installed: boolean;
  cli_path: string | null;
  cli_version: string | null;
  os_supported: boolean;
  architecture: string;
}

export interface EgoLiteInstallResult {
  success: boolean;
  message: string;
  app_path: string | null;
  logs: string[];
}

export interface RemoteBotConfig {
  platform: string;
  credentials: string;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RemotePairing {
  id: string;
  platform: string;
  chat_id: string;
  user_name?: string;
  pair_code: string;
  status: string;
  bound_workspace_id?: string;
  bound_session_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BotRuntimeStatus {
  platform: string;
  running: boolean;
  error?: string;
  last_poll_time?: string;
}

export interface RemoteMessageLog {
  id: number;
  platform: string;
  chat_id: string;
  direction: string;
  content: string;
  created_at: string;
}

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

export const SettingsPanel: React.FC<{ initialTab?: string }> = ({ initialTab }) => {
  const [activeTab, setActiveTab] = useState<'vault' | 'virtual-models' | 'providers' | 'mcp' | 'versions' | 'browser' | 'remote'>(
    (initialTab as any) || 'virtual-models'
  );

  const { workspaces, sessions } = useWorkspaceStore();

  // Remote Control States
  const [tgToken, setTgToken] = useState('');
  const [showTgToken, setShowTgToken] = useState(false);
  const [tgEnabled, setTgEnabled] = useState(false);
  const [isSavingTg, setIsSavingTg] = useState(false);

  const [larkAppId, setLarkAppId] = useState('');
  const [larkAppSecret, setLarkAppSecret] = useState('');
  const [showLarkSecret, setShowLarkSecret] = useState(false);
  const [larkEnabled, setLarkEnabled] = useState(false);
  const [isSavingLark, setIsSavingLark] = useState(false);
  const [larkEndpointType, setLarkEndpointType] = useState<'feishu' | 'lark' | 'custom'>('feishu');
  const [larkBaseUrl, setLarkBaseUrl] = useState('https://open.feishu.cn');
  const [larkWebhookPort, setLarkWebhookPort] = useState(19828);
  const [isTestingLark, setIsTestingLark] = useState(false);
  const [larkTestResult, setLarkTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const [botStatuses, setBotStatuses] = useState<Record<string, BotRuntimeStatus>>({});
  const [pairings, setPairings] = useState<RemotePairing[]>([]);
  const [pairCodeInput, setPairCodeInput] = useState('');
  const [authorizingPair, setAuthorizingPair] = useState(false);
  const [pairMessage, setPairMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [messageLogs, setMessageLogs] = useState<RemoteMessageLog[]>([]);
  const [simText, setSimText] = useState('');
  const [simPlatform, setSimPlatform] = useState('telegram');
  const [isSimulating, setIsSimulating] = useState(false);

  // Browser (ego-lite) States
  const [egoStatus, setEgoStatus] = useState<EgoLiteStatus | null>(null);
  const [isCheckingEgo, setIsCheckingEgo] = useState(false);
  const [isInstallingEgo, setIsInstallingEgo] = useState(false);
  const [installLogs, setInstallLogs] = useState<string[]>([]);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState<string | null>(null);

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
    for (const bin of ['claude', 'aider', 'git', 'agent']) {
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

  const checkEgoStatus = async () => {
    setIsCheckingEgo(true);
    try {
      const status = await invoke<EgoLiteStatus>('check_ego_lite_status');
      setEgoStatus(status);
    } catch (e) {
      console.error('Failed to check ego-lite status:', e);
    } finally {
      setIsCheckingEgo(false);
    }
  };

  const handleInstallEgo = async () => {
    setIsInstallingEgo(true);
    setInstallError(null);
    setInstallSuccess(null);
    setInstallLogs(['⚡ Initializing one-key installation of ego-lite browser...']);
    try {
      const res = await invoke<EgoLiteInstallResult>('install_ego_lite_browser');
      setInstallLogs(res.logs);
      if (res.success) {
        setInstallSuccess(res.message);
        await checkEgoStatus();
      } else {
        setInstallError(res.message);
      }
    } catch (err: any) {
      setInstallError(String(err));
      setInstallLogs((prev) => [...prev, `❌ Installation error: ${err}`]);
    } finally {
      setIsInstallingEgo(false);
    }
  };

  const handleOpenEgo = async () => {
    try {
      await invoke('open_in_ego_lite', { url: 'https://lite.ego.app' });
    } catch (e) {
      console.error('Failed to launch ego-lite:', e);
    }
  };

  // ── Remote Control Actions ──────────────────────────────────────────────────

  const loadRemoteControlData = async () => {
    try {
      // 1. Bot Configs
      const configs = await invoke<RemoteBotConfig[]>('get_remote_bot_configs');
      for (const cfg of configs) {
        if (cfg.platform === 'telegram') {
          setTgEnabled(cfg.enabled);
          try {
            const parsed = JSON.parse(cfg.credentials);
            if (parsed.bot_token) setTgToken(parsed.bot_token);
          } catch (_) {}
        } else if (cfg.platform === 'lark') {
          setLarkEnabled(cfg.enabled);
          try {
            const parsed = JSON.parse(cfg.credentials);
            if (parsed.app_id) setLarkAppId(parsed.app_id);
            if (parsed.app_secret) setLarkAppSecret(parsed.app_secret);
            if (parsed.base_url) {
              setLarkBaseUrl(parsed.base_url);
              if (parsed.base_url.includes('larksuite.com')) {
                setLarkEndpointType('lark');
              } else if (parsed.base_url.includes('feishu.cn')) {
                setLarkEndpointType('feishu');
              } else {
                setLarkEndpointType('custom');
              }
            }
            if (parsed.webhook_port) setLarkWebhookPort(parsed.webhook_port);
          } catch (_) {}
        }
      }

      // 2. Bot Statuses
      const statuses = await invoke<BotRuntimeStatus[]>('get_remote_bot_status');
      const statusMap: Record<string, BotRuntimeStatus> = {};
      for (const s of statuses) {
        statusMap[s.platform] = s;
      }
      setBotStatuses(statusMap);

      // 3. Pairings
      const pairList = await invoke<RemotePairing[]>('get_remote_pairings');
      setPairings(pairList);

      // 4. Message Logs
      const logs = await invoke<RemoteMessageLog[]>('get_remote_message_logs', { limit: 50 });
      setMessageLogs(logs);
    } catch (e) {
      console.error('Failed to load remote control data:', e);
    }
  };

  const handleTestLark = async () => {
    if (!larkAppId.trim() || !larkAppSecret.trim()) {
      alert('Please enter App ID and App Secret first to test');
      return;
    }
    setIsTestingLark(true);
    setLarkTestResult(null);
    try {
      const authMsg = await invoke<string>('test_lark_credentials', {
        appId: larkAppId.trim(),
        appSecret: larkAppSecret.trim(),
        baseUrl: larkBaseUrl.trim() || undefined,
      });
      let wsMsg = '';
      try {
        wsMsg = await invoke<string>('test_lark_ws_endpoint', {
          appId: larkAppId.trim(),
          appSecret: larkAppSecret.trim(),
          baseUrl: larkBaseUrl.trim() || undefined,
        });
      } catch (wsErr) {
        wsMsg = `Persistent WS notice: ${wsErr}`;
      }
      setLarkTestResult({ ok: true, msg: `${authMsg}\n${wsMsg}` });
    } catch (err) {
      setLarkTestResult({ ok: false, msg: String(err) });
    } finally {
      setIsTestingLark(false);
    }
  };

  const handleSaveTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tgEnabled && !tgToken.trim()) {
      alert('Bot Token is required to enable Telegram remote control');
      return;
    }
    setIsSavingTg(true);
    try {
      await invoke('save_remote_bot_config', {
        platform: 'telegram',
        credentials: JSON.stringify({ bot_token: tgToken.trim() }),
        enabled: tgEnabled,
      });
      await loadRemoteControlData();
      alert('Telegram bot configuration saved!');
    } catch (err) {
      alert('Failed to save Telegram config: ' + err);
    } finally {
      setIsSavingTg(false);
    }
  };

  const handleSaveLark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (larkEnabled && (!larkAppId.trim() || !larkAppSecret.trim())) {
      alert('App ID and App Secret are required to enable Lark remote control');
      return;
    }
    setIsSavingLark(true);
    try {
      await invoke('save_remote_bot_config', {
        platform: 'lark',
        credentials: JSON.stringify({
          app_id: larkAppId.trim(),
          app_secret: larkAppSecret.trim(),
          base_url: larkBaseUrl.trim() || 'https://open.feishu.cn',
          webhook_port: larkWebhookPort || 19828,
        }),
        enabled: larkEnabled,
      });
      await loadRemoteControlData();
      alert('Lark/Feishu bot configuration saved!');
    } catch (err) {
      alert('Failed to save Lark config: ' + err);
    } finally {
      setIsSavingLark(false);
    }
  };

  const handleAuthorizePair = async (codeToUse?: string) => {
    const code = normalizePairCode(codeToUse || pairCodeInput);
    if (!code) {
      alert('Please enter a 6-digit pair authorization code');
      return;
    }
    setAuthorizingPair(true);
    setPairMessage(null);
    try {
      const res = await invoke<RemotePairing>('authorize_pair_code', { pairCode: code });
      setPairMessage({
        type: 'success',
        text: `Pairing authorized for ${res.platform} chat (${res.chat_id})!`,
      });
      setPairCodeInput('');
      await loadRemoteControlData();
    } catch (err) {
      setPairMessage({
        type: 'error',
        text: String(err),
      });
    } finally {
      setAuthorizingPair(false);
    }
  };

  const handleRevokePair = async (pairingId: string) => {
    if (!confirm('Revoke authorization for this chat?')) return;
    try {
      await invoke('revoke_pairing', { pairingId });
      await loadRemoteControlData();
    } catch (err) {
      alert('Failed to revoke pairing: ' + err);
    }
  };

  const handleBindSession = async (
    pairingId: string,
    workspaceId?: string,
    sessionId?: string
  ) => {
    try {
      await invoke('bind_pairing_session', {
        pairingId,
        workspaceId: workspaceId || null,
        sessionId: sessionId || null,
      });
      await loadRemoteControlData();
    } catch (err) {
      alert('Failed to update session binding: ' + err);
    }
  };

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simText.trim()) return;
    setIsSimulating(true);
    try {
      await invoke('simulate_remote_message', {
        platform: simPlatform,
        chatId: 'test-simulated-chat',
        text: simText.trim(),
      });
      setSimText('');
      await loadRemoteControlData();
    } catch (err) {
      alert('Simulation error: ' + err);
    } finally {
      setIsSimulating(false);
    }
  };

  const reloadAll = async () => {
    await Promise.all([
      loadProviders(),
      loadVirtualModels(),
      loadMcpServers(),
      checkVersions(),
      checkEgoStatus(),
      loadRemoteControlData()
    ]);
  };

  useEffect(() => {
    reloadAll();

    // Listen to real-time pairing notifications
    const unlistenPairReq = listen('remote-pair-request', () => {
      loadRemoteControlData();
    });
    const unlistenPairUpd = listen('remote-pair-updated', () => {
      loadRemoteControlData();
    });

    return () => {
      unlistenPairReq.then((f) => f());
      unlistenPairUpd.then((f) => f());
    };
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
    <div className="w-full h-full bg-[#0a0a0a] flex flex-col font-sans text-slate-200">
      
      {/* Top Tab Switcher */}
      <div className="shrink-0 bg-[#171717] px-6 py-3.5 border-b border-slate-800/80 flex items-center justify-between select-none">
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
            { id: 'browser', name: 'Browser Engine', icon: Globe },
            { id: 'remote', name: 'Remote Control', icon: Radio },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold font-mono border transition ${
                  activeTab === t.id
                    ? 'bg-brand/10 text-brand-light border-brand/25 font-bold'
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
      <div className="flex-grow p-6 overflow-y-auto min-h-0 bg-[#0a0a0a]">
        
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

            <div className="border border-slate-800 rounded-xl overflow-hidden bg-[#171717]/35">
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
                            <AgentIcon name={v.name} size={28} />
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
                <div className="col-span-2 text-center text-slate-600 py-10 bg-[#171717]/20 border border-slate-800/80 rounded-xl font-mono text-xs">
                  No LLM providers registered yet.
                </div>
              ) : (
                providers.map((p) => (
                  <div 
                    key={p.name} 
                    className={`p-4 rounded-xl border flex flex-col justify-between transition bg-[#171717]/35 ${
                      p.is_default ? 'border-brand/40' : 'border-slate-800/80 hover:border-slate-700'
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
                        className="p-3 bg-[#171717]/35 border border-slate-800/80 rounded-lg flex items-center justify-between"
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
            <div className="w-full md:w-80 bg-[#171717]/30 border border-slate-800/80 rounded-xl p-4 flex flex-col space-y-3.5 h-fit select-none">
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
                    className="w-full bg-[#262626] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium font-mono text-[9px] uppercase">Command Executable</label>
                  <input
                    type="text"
                    value={mcpCommand}
                    onChange={(e) => setMcpCommand(e.target.value)}
                    placeholder="npx"
                    className="w-full bg-[#262626] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium font-mono text-[9px] uppercase">Arguments (space separated)</label>
                  <input
                    type="text"
                    value={mcpArgs}
                    onChange={(e) => setMcpArgs(e.target.value)}
                    placeholder="-y @modelcontextprotocol/server-memory"
                    className="w-full bg-[#262626] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
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
            
            <div className="bg-[#171717]/35 border border-slate-800/80 rounded-xl divide-y divide-slate-800/40 font-mono text-xs">
              {[
                { name: 'Claude Code CLI', bin: 'claude', val: versions.claude },
                { name: 'Aider Code Agent', bin: 'aider', val: versions.aider },
                { name: 'Cursor Agent CLI', bin: 'agent', val: versions.agent },
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

        {/* ── TAB: Browser Engine (ego-lite) ── */}
        {activeTab === 'browser' && (
          <div className="space-y-5 max-w-2xl select-none font-sans">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold font-mono text-slate-200 flex items-center gap-2">
                  <Globe className="text-brand-light w-4 h-4" />
                  ego-lite Browser Engine
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                  Ultra-lightweight macOS browser designed for autonomous AI agents. Integrates with the TDE inspector and Antigravity CLI to provide DOM inspection, live JS evaluation, and automated web workflows.
                </p>
              </div>
              <button
                onClick={checkEgoStatus}
                disabled={isCheckingEgo}
                className="flex items-center space-x-1 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded text-xs font-mono transition"
                title="Refresh browser status"
              >
                <RefreshCw size={12} className={isCheckingEgo ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>

            {/* Status Card */}
            <div className="bg-[#171717]/60 border border-slate-800/80 rounded-xl p-4 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/50">
                <span className="text-slate-400">Installation Status</span>
                {egoStatus?.is_installed ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 size={12} />
                    Installed & Ready
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <AlertCircle size={12} />
                    Not Installed
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Detected App Path</span>
                  <span className="text-slate-300 truncate block mt-0.5 font-mono" title={egoStatus?.app_path || 'None'}>
                    {egoStatus?.app_path || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">CLI Helper (ego-browser)</span>
                  <span className="text-slate-300 truncate block mt-0.5 font-mono" title={egoStatus?.cli_path || 'None'}>
                    {egoStatus?.cli_installed ? (egoStatus?.cli_path || 'Available') : 'Not linked'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Architecture</span>
                  <span className="text-slate-300 block mt-0.5 font-mono">
                    {egoStatus?.architecture === 'aarch64' || egoStatus?.architecture === 'arm64'
                      ? 'Apple Silicon (arm64)'
                      : 'Intel (x86_64)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Platform Compatibility</span>
                  <span className="text-slate-300 block mt-0.5 font-mono">
                    {egoStatus?.os_supported ? 'macOS (Supported)' : 'Unsupported OS'}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleInstallEgo}
                disabled={isInstallingEgo}
                className="flex items-center space-x-2 bg-brand hover:bg-brand/80 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-bold text-xs transition shadow-sm"
              >
                <Download size={14} className={isInstallingEgo ? 'animate-bounce' : ''} />
                <span>
                  {isInstallingEgo
                    ? 'Installing ego-lite (~127MB)...'
                    : egoStatus?.is_installed
                    ? 'Reinstall / Update Latest ego-lite'
                    : '⚡ One-Key Install Latest ego-lite Browser'}
                </span>
              </button>

              {egoStatus?.is_installed && (
                <button
                  onClick={handleOpenEgo}
                  className="flex items-center space-x-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-lg font-semibold text-xs transition"
                >
                  <ExternalLink size={13} />
                  <span>Launch ego-lite</span>
                </button>
              )}
            </div>

            {/* Messages */}
            {installSuccess && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-mono flex items-center gap-2">
                <CheckCircle2 size={14} className="shrink-0" />
                <span>{installSuccess}</span>
              </div>
            )}
            {installError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs font-mono flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{installError}</span>
              </div>
            )}

            {/* Live Install Logs Terminal */}
            {installLogs.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Terminal size={12} />
                    Installation Console
                  </span>
                  {isInstallingEgo && <span className="text-brand-light animate-pulse">Running step...</span>}
                </div>
                <div className="bg-black/80 border border-slate-800/80 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-1 select-text">
                  {installLogs.map((log, idx) => (
                    <div key={idx} className="leading-relaxed">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Integration Note */}
            <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 text-xs text-slate-400 space-y-2">
              <h4 className="font-semibold text-slate-300 text-xs flex items-center gap-1.5">
                <Info size={13} className="text-brand-light" />
                Antigravity CLI & TDE Automation
              </h4>
              <p className="text-[11px] leading-relaxed">
                Once installed, Antigravity CLI can use the <code className="text-slate-200 bg-slate-800 px-1 py-0.5 rounded font-mono">ego-browser</code> skill to evaluate JavaScript, capture screenshots, and automate web workflows. Web tabs opened in TDE are synchronized directly with your current workspace.
              </p>
            </div>
          </div>
        )}

        {/* ── TAB: Remote Control (Lark / Telegram) ── */}
        {activeTab === 'remote' && (
          <div className="space-y-6 max-w-4xl select-none font-sans">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold font-mono text-slate-200 flex items-center gap-2">
                  <Radio className="text-brand-light w-4 h-4" />
                  Remote Control Terminal Hub (Lark / Telegram)
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                  Connect your Lark (Feishu) or Telegram bot to TDE. Securely authorize mobile/desktop chat sessions with a 6-digit pair code, switch target agent sessions via slash commands, and stream real-time terminal output directly to your chat box.
                </p>
              </div>
              <button
                onClick={loadRemoteControlData}
                className="flex items-center space-x-1 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded text-xs font-mono transition"
                title="Refresh remote status"
              >
                <RefreshCw size={12} />
                <span>Refresh</span>
              </button>
            </div>

            {/* Top Grid: Telegram & Lark Bot Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Telegram Bot Card */}
              <div className="bg-[#171717]/60 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-sky-500/10 text-sky-400 flex items-center justify-center font-bold text-xs">
                        TG
                      </div>
                      <span className="font-semibold text-xs text-slate-200">Telegram Bot</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {botStatuses['telegram']?.running ? (
                        <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                          Polling Active
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-800/40 px-2 py-0.5 rounded-full">
                          Stopped
                        </span>
                      )}
                    </div>
                  </div>

                  {botStatuses['telegram']?.error && (
                    <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[10px] font-mono flex items-center gap-1.5">
                      <AlertTriangle size={12} className="shrink-0" />
                      <span className="truncate">{botStatuses['telegram']?.error}</span>
                    </div>
                  )}

                  <form onSubmit={handleSaveTelegram} className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-400 mb-1 font-mono text-[9px] uppercase">
                        Bot Token (from @BotFather)
                      </label>
                      <div className="relative">
                        <input
                          type={showTgToken ? 'text' : 'password'}
                          value={tgToken}
                          onChange={(e) => setTgToken(e.target.value)}
                          placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                          className="w-full bg-[#262626] border border-slate-700/60 rounded px-2.5 py-1.5 pr-8 text-slate-200 focus:outline-none font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowTgToken(!showTgToken)}
                          className="absolute right-2 top-2 text-slate-500 hover:text-slate-350"
                        >
                          {showTgToken ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-xs select-none">
                        <input
                          type="checkbox"
                          checked={tgEnabled}
                          onChange={(e) => setTgEnabled(e.target.checked)}
                          className="rounded bg-slate-900 border-slate-700 text-brand focus:ring-transparent w-3.5 h-3.5"
                        />
                        <span>Enable Long Polling</span>
                      </label>

                      <button
                        type="submit"
                        disabled={isSavingTg}
                        className="px-3 py-1.5 rounded bg-brand hover:bg-brand/80 text-white font-semibold text-xs transition disabled:opacity-50"
                      >
                        {isSavingTg ? 'Saving...' : 'Save & Connect'}
                      </button>
                    </div>
                  </form>
                </div>

                <p className="text-[10px] text-slate-500 font-mono border-t border-slate-800/40 pt-2">
                  💡 Tip: Message your bot on Telegram. On first message, it will reply with a pair code!
                </p>
              </div>

              {/* Lark (Feishu) Bot Card */}
              <div className="bg-[#171717]/60 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-xs">
                        LK
                      </div>
                      <span className="font-semibold text-xs text-slate-200">Lark / Feishu Bot</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {botStatuses['lark']?.running ? (
                        <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                          Listening & Active
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-800/40 px-2 py-0.5 rounded-full">
                          Stopped
                        </span>
                      )}
                    </div>
                  </div>

                  {botStatuses['lark']?.error && (
                    <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] font-mono flex items-start gap-1.5">
                      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                      <span className="break-all">{botStatuses['lark']?.error}</span>
                    </div>
                  )}

                  {/* Endpoint / Platform Selection */}
                  <div className="space-y-1.5">
                    <label className="block text-slate-400 font-mono text-[9px] uppercase">
                      Bot Base URL & Platform
                    </label>
                    <div className="grid grid-cols-3 gap-1 bg-[#202020] p-1 rounded-lg border border-slate-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          setLarkEndpointType('feishu');
                          setLarkBaseUrl('https://open.feishu.cn');
                        }}
                        className={`py-1 px-1.5 rounded font-medium transition text-center ${
                          larkEndpointType === 'feishu'
                            ? 'bg-brand text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        飞书 (Feishu CN)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLarkEndpointType('lark');
                          setLarkBaseUrl('https://open.larksuite.com');
                        }}
                        className={`py-1 px-1.5 rounded font-medium transition text-center ${
                          larkEndpointType === 'lark'
                            ? 'bg-brand text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Lark (Global)
                      </button>
                      <button
                        type="button"
                        onClick={() => setLarkEndpointType('custom')}
                        className={`py-1 px-1.5 rounded font-medium transition text-center ${
                          larkEndpointType === 'custom'
                            ? 'bg-brand text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Custom URL
                      </button>
                    </div>

                    <div className="pt-1">
                      <input
                        type="text"
                        value={larkBaseUrl}
                        onChange={(e) => setLarkBaseUrl(e.target.value)}
                        readOnly={larkEndpointType !== 'custom'}
                        placeholder="https://open.larksuite.com"
                        className={`w-full bg-[#262626] border border-slate-700/60 rounded px-2.5 py-1.5 font-mono text-xs ${
                          larkEndpointType !== 'custom' ? 'text-slate-400' : 'text-slate-200 focus:outline-none'
                        }`}
                      />
                    </div>
                  </div>

                  <form onSubmit={handleSaveLark} className="space-y-2.5 text-xs">
                    <div>
                      <label className="block text-slate-400 mb-1 font-mono text-[9px] uppercase">
                        App ID (cli_xxx)
                      </label>
                      <input
                        type="text"
                        value={larkAppId}
                        onChange={(e) => setLarkAppId(e.target.value)}
                        placeholder="cli_a1b2c3d4e5f6..."
                        className="w-full bg-[#262626] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1 font-mono text-[9px] uppercase">
                        App Secret
                      </label>
                      <div className="relative">
                        <input
                          type={showLarkSecret ? 'text' : 'password'}
                          value={larkAppSecret}
                          onChange={(e) => setLarkAppSecret(e.target.value)}
                          placeholder="App Secret from Lark / Feishu Developer Console..."
                          className="w-full bg-[#262626] border border-slate-700/60 rounded px-2.5 py-1.5 pr-8 text-slate-200 focus:outline-none font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLarkSecret(!showLarkSecret)}
                          className="absolute right-2 top-2 text-slate-500 hover:text-slate-350"
                        >
                          {showLarkSecret ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    </div>

                    {/* Persistent Connection vs Webhook Mode */}
                    <div className="p-2.5 bg-[#1f1f1f] border border-slate-800/80 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-emerald-400 font-semibold uppercase flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Mode 1: Persistent Connection (长连接模式 · 推荐)
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono bg-emerald-950/60 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-800/50">
                          无需公网IP / Webhook
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-300 leading-relaxed">
                        在飞书/Lark开放平台【事件与回调】页面，订阅方式选择<strong>【使用长连接接收事件】</strong>。TDE 启动后将自动与飞书消息网关建立加密 WebSocket 长连接，秒级接收并处理消息。
                      </p>

                      <div className="border-t border-slate-800/60 pt-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-slate-400 font-semibold uppercase">
                            Mode 2: Webhook 回调模式 (可选)
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono">Port: {larkWebhookPort}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <code className="flex-1 bg-[#141414] border border-slate-800 px-2 py-1 rounded text-[11px] font-mono text-brand-light truncate select-all">
                            http://127.0.0.1:{larkWebhookPort}/api/lark/event
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`http://127.0.0.1:${larkWebhookPort}/api/lark/event`);
                              setCopiedWebhook(true);
                              setTimeout(() => setCopiedWebhook(false), 2000);
                            }}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] font-mono flex items-center gap-1 transition shrink-0"
                            title="Copy Webhook URL"
                          >
                            {copiedWebhook ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            <span>{copiedWebhook ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                        <p className="text-[9px] text-slate-500">
                          若选择发送至开发者服务器，配置公网或穿透地址指向上述端口。
                        </p>
                      </div>
                    </div>

                    {larkTestResult && (
                      <div
                        className={`p-2 rounded text-[11px] font-mono flex items-start gap-1.5 whitespace-pre-line ${
                          larkTestResult.ok
                            ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-300'
                            : 'bg-rose-500/10 border border-rose-500/25 text-rose-300'
                        }`}
                      >
                        {larkTestResult.ok ? (
                          <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                        )}
                        <span className="break-all">{larkTestResult.msg}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 gap-2">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-xs select-none">
                        <input
                          type="checkbox"
                          checked={larkEnabled}
                          onChange={(e) => setLarkEnabled(e.target.checked)}
                          className="rounded bg-slate-900 border-slate-700 text-brand focus:ring-transparent w-3.5 h-3.5"
                        />
                        <span>Enable Service</span>
                      </label>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleTestLark}
                          disabled={isTestingLark || !larkAppId.trim() || !larkAppSecret.trim()}
                          className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition disabled:opacity-40"
                        >
                          {isTestingLark ? 'Testing...' : 'Test Auth & WS'}
                        </button>

                        <button
                          type="submit"
                          disabled={isSavingLark}
                          className="px-3 py-1.5 rounded bg-brand hover:bg-brand/80 text-white font-semibold text-xs transition disabled:opacity-50"
                        >
                          {isSavingLark ? 'Saving...' : 'Save & Listen'}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>

                <div className="text-[10px] text-slate-400 font-mono border-t border-slate-800/40 pt-2 space-y-1">
                  <div className="font-semibold text-slate-300">Setup Checklist in Lark/Feishu Console:</div>
                  <div>1. <strong>Events & Callbacks (事件与回调)</strong>: 订阅模式选择【使用长连接接收事件】并添加事件 <code>im.message.receive_v1</code></div>
                  <div>2. <strong>Permissions (权限管理)</strong>: 申请并开通 <code>im:message</code>, <code>im:message:send_as_bot</code></div>
                  <div>3. <strong>App Features (添加应用能力)</strong>: 启用 <code>Bot (机器人)</code>，并发布一个版本！</div>
                </div>
              </div>
            </div>

            {/* Pair Code Authorization Section */}
            <div className="bg-[#171717]/60 border border-slate-800/80 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-brand-light" />
                  <h4 className="font-semibold text-xs text-slate-200 uppercase font-mono tracking-wide">
                    Pair Code Authorization
                  </h4>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  Enter code from bot response to link chat
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <input
                    type="text"
                    value={pairCodeInput}
                    onChange={(e) => setPairCodeInput(normalizePairCode(e.target.value))}
                    placeholder="Enter 6-digit pair code (e.g. 749201)..."
                    maxLength={6}
                    className="w-full bg-[#262626] border border-slate-700/80 rounded-lg px-3 py-2 text-slate-100 font-mono text-sm tracking-widest uppercase focus:outline-none focus:border-brand"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleAuthorizePair()}
                  disabled={authorizingPair || !pairCodeInput.trim()}
                  className="w-full sm:w-auto px-5 py-2 bg-brand hover:bg-brand/80 disabled:opacity-50 text-white font-bold rounded-lg text-xs transition flex items-center justify-center gap-1.5 shadow"
                >
                  <ShieldCheck size={14} />
                  <span>{authorizingPair ? 'Authorizing...' : 'Authorize & Link Chat'}</span>
                </button>
              </div>

              {pairMessage && (
                <div
                  className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 ${
                    pairMessage.type === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-300'
                      : 'bg-rose-500/10 border border-rose-500/25 text-rose-300'
                  }`}
                >
                  {pairMessage.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  <span>{pairMessage.text}</span>
                </div>
              )}

              {/* Pending Requests Alert (if any) */}
              {pairings.filter((p) => p.status === 'pending').length > 0 && (
                <div className="space-y-2 pt-2">
                  <span className="text-[10px] font-mono uppercase text-amber-400 flex items-center gap-1.5 font-bold">
                    <AlertTriangle size={12} />
                    Incoming Pending Authorization Requests:
                  </span>
                  <div className="divide-y divide-slate-800/60 border border-amber-500/20 rounded-lg bg-amber-500/5">
                    {pairings
                      .filter((p) => p.status === 'pending')
                      .map((p) => (
                        <div key={p.id} className="p-3 flex items-center justify-between text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase font-bold bg-amber-500/20 text-amber-300">
                                {p.platform}
                              </span>
                              <span className="text-slate-200 font-medium">
                                {p.user_name ? `@${p.user_name}` : `Chat ID: ${p.chat_id}`}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              Code: <span className="text-amber-300 font-bold tracking-wider">{p.pair_code}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleAuthorizePair(p.pair_code)}
                            className="px-3 py-1 bg-brand hover:bg-brand/80 text-white rounded text-xs font-semibold font-mono"
                          >
                            One-Click Authorize
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Paired Chats & Session Binding Management */}
            <div className="bg-[#171717]/60 border border-slate-800/80 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-brand-light" />
                  <h4 className="font-semibold text-xs text-slate-200 uppercase font-mono tracking-wide">
                    Authorized Paired Chats & Session Routing
                  </h4>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {pairings.filter((p) => p.status === 'paired').length} active connections
                </span>
              </div>

              {pairings.filter((p) => p.status === 'paired').length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-xs font-mono">
                  No authorized chats yet. Configure a bot above and send your first message to begin pairing!
                </div>
              ) : (
                <div className="space-y-3">
                  {pairings
                    .filter((p) => p.status === 'paired')
                    .map((pairing) => {
                      // Find sessions for selected workspace or active sessions
                      const sessionList = Object.values(sessions);
                      return (
                        <div
                          key={pairing.id}
                          className="bg-[#212121]/60 border border-slate-800 rounded-lg p-3.5 space-y-3 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase font-bold bg-sky-500/20 text-sky-300">
                                {pairing.platform}
                              </span>
                              <span className="font-semibold text-slate-200">
                                {pairing.user_name ? `@${pairing.user_name}` : `Chat ${pairing.chat_id}`}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                (ID: {pairing.chat_id})
                              </span>
                            </div>
                            <button
                              onClick={() => handleRevokePair(pairing.id)}
                              className="text-[10px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-2 py-1 rounded transition font-mono"
                            >
                              Revoke
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                            <div>
                              <label className="block text-[9px] text-slate-400 uppercase mb-1">
                                Bound Project (Workspace)
                              </label>
                              <select
                                value={pairing.bound_workspace_id || ''}
                                onChange={(e) =>
                                  handleBindSession(pairing.id, e.target.value, pairing.bound_session_id)
                                }
                                className="w-full bg-[#171717] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none"
                              >
                                <option value="">— Select Workspace —</option>
                                {workspaces.map((ws) => (
                                  <option key={ws.id} value={ws.id}>
                                    {ws.name} ({ws.path})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[9px] text-slate-400 uppercase mb-1">
                                Connected Agent Session
                              </label>
                              <select
                                value={pairing.bound_session_id || ''}
                                onChange={(e) =>
                                  handleBindSession(pairing.id, pairing.bound_workspace_id, e.target.value)
                                }
                                className="w-full bg-[#171717] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none"
                              >
                                <option value="">— No Session Connected —</option>
                                {sessionList.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name || s.agentType} (ID: {s.id.slice(0, 8)}...)
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-800/40">
                            <span>
                              Current Target:{' '}
                              <span className="text-brand-light font-bold">
                                {pairing.bound_session_id ? pairing.bound_session_id : 'None'}
                              </span>
                            </span>
                            <span className="text-slate-500">
                              Switch anytime in chat via: <code className="text-slate-300">/switch project session &lt;id&gt;</code>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Quick Slash Commands Reference Card */}
            <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 text-xs text-slate-300 space-y-3 font-mono">
              <h4 className="font-semibold text-xs flex items-center gap-1.5 text-slate-200">
                <HelpCircle size={13} className="text-brand-light" />
                Remote Chat Slash Commands
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 bg-black/40 rounded border border-slate-800/80">
                  <span className="text-brand-light font-bold">/project list</span>
                  <p className="text-slate-400 text-[10px] mt-0.5">List all TDE project workspaces with path & IDs</p>
                </div>
                <div className="p-2.5 bg-black/40 rounded border border-slate-800/80">
                  <span className="text-brand-light font-bold">/project list session</span>
                  <p className="text-slate-400 text-[10px] mt-0.5">List active sessions in the project with statuses</p>
                </div>
                <div className="p-2.5 bg-black/40 rounded border border-slate-800/80">
                  <span className="text-brand-light font-bold">/switch project session &lt;id&gt;</span>
                  <p className="text-slate-400 text-[10px] mt-0.5">Switch active remote control target to specified session</p>
                </div>
                <div className="p-2.5 bg-black/40 rounded border border-slate-800/80">
                  <span className="text-brand-light font-bold">Any regular text message</span>
                  <p className="text-slate-400 text-[10px] mt-0.5">Sent directly to the bound terminal session stdin, output streams back</p>
                </div>
              </div>
            </div>

            {/* Interactive Live Simulator & Message Logs */}
            <div className="bg-[#171717]/60 border border-slate-800/80 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-brand-light" />
                  <h4 className="font-semibold text-xs text-slate-200 uppercase font-mono tracking-wide">
                    Interactive Chat Simulator & Live Audit
                  </h4>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">Test commands directly in TDE</span>
              </div>

              {/* Simulation input form */}
              <form onSubmit={handleSimulate} className="flex flex-col sm:flex-row items-center gap-2">
                <select
                  value={simPlatform}
                  onChange={(e) => setSimPlatform(e.target.value)}
                  className="bg-[#262626] border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                >
                  <option value="telegram">Telegram</option>
                  <option value="lark">Lark</option>
                </select>
                <input
                  type="text"
                  value={simText}
                  onChange={(e) => setSimText(e.target.value)}
                  placeholder="Simulate sending a message (e.g. /help, /project list, ls -la)..."
                  className="flex-1 w-full bg-[#262626] border border-slate-700/80 rounded px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand"
                />
                <button
                  type="submit"
                  disabled={isSimulating || !simText.trim()}
                  className="w-full sm:w-auto px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold font-mono flex items-center justify-center gap-1.5 border border-slate-700"
                >
                  <Send size={12} />
                  <span>Send</span>
                </button>
              </form>

              {/* Live Audit Log stream */}
              <div className="space-y-1.5 pt-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase">Recent Message Logs</span>
                <div className="bg-black/70 border border-slate-800/80 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-[10px] space-y-2 select-text">
                  {messageLogs.length === 0 ? (
                    <div className="text-slate-600 text-center py-4">No message logs recorded yet.</div>
                  ) : (
                    messageLogs.map((log) => (
                      <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                        <span
                          className={`px-1 rounded text-[8px] font-bold uppercase shrink-0 ${
                            log.direction === 'incoming'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-sky-500/20 text-sky-400'
                          }`}
                        >
                          {log.direction}
                        </span>
                        <span className="text-slate-500 shrink-0">[{log.platform}]</span>
                        <span className="text-slate-300 break-words flex-1">{log.content}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── PROMPT MODAL: Mapped Agent Model Form ── */}
      {showVmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm select-none">
          <div className="bg-[#171717] border border-slate-800 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4">
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
                    className="w-full bg-[#262626] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
                  />
                </div>
              )}
              <div>
                <label className="block text-slate-400 mb-1 font-mono text-[9px] uppercase">Mapped Provider</label>
                <select
                  value={vmForm.provider}
                  onChange={(e) => setVmForm(f => ({ ...f, provider: e.target.value }))}
                  className="w-full bg-[#262626] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-semibold font-mono"
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
                  className="w-full bg-[#262626] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
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
          <div className="bg-[#171717] border border-slate-800 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4">
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
                    className="w-full bg-[#262626] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
                  />
                </div>
              )}
              <div>
                <label className="block text-slate-400 mb-1 font-mono text-[9px] uppercase">Protocol Type</label>
                <select
                  value={providerForm.type}
                  onChange={(e) => setProviderForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full bg-[#262626] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-semibold font-mono"
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
                  className="w-full bg-[#262626] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
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
                    className="w-full bg-[#262626] border border-slate-700/60 rounded px-2.5 py-1.5 pr-8 text-slate-200 focus:outline-none font-mono"
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
                  className="w-full bg-[#262626] border border-slate-700/60 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
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
