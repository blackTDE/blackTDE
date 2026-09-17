import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Copy, Globe, Radio, RefreshCw, ShieldCheck } from 'lucide-react';

export interface WebRelayStatus {
  running: boolean;
  connected: boolean;
  relay_url: string;
  room_id: string;
  pairing_url: string;
  qr_svg: string;
  error?: string | null;
}

const DEFAULT_RELAY_URL = 'https://tde-relay.rayleeafar.workers.dev';

export const RemoteWebCard: React.FC = () => {
  const [relayUrl, setRelayUrl] = useState(DEFAULT_RELAY_URL);
  const [status, setStatus] = useState<WebRelayStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void refresh();
    const unlisten = listen<WebRelayStatus>('web-relay-status', (event) => {
      setStatus(event.payload);
      if (event.payload.relay_url) {
        setRelayUrl(event.payload.relay_url);
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  async function refresh() {
    try {
      const next = await invoke<WebRelayStatus>('get_web_relay_status');
      setStatus(next);
      if (next.relay_url) {
        setRelayUrl(next.relay_url);
      }
    } catch {
      // command is available after the first desktop rebuild
    }
  }

  async function start() {
    setBusy(true);
    try {
      const next = await invoke<WebRelayStatus>('start_web_relay', { relayUrl });
      setStatus(next);
    } catch (error) {
      setStatus((current) => ({
        running: false,
        connected: false,
        relay_url: relayUrl,
        room_id: current?.room_id || '',
        pairing_url: current?.pairing_url || '',
        qr_svg: current?.qr_svg || '',
        error: String(error),
      }));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      setStatus(await invoke<WebRelayStatus>('stop_web_relay'));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      setStatus(await invoke<WebRelayStatus>('revoke_web_relay'));
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl() {
    if (!status?.pairing_url) {
      return;
    }
    await navigator.clipboard.writeText(status.pairing_url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="bg-[#171717]/60 border border-slate-800/80 rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-2">
            <Globe size={14} className="text-brand-light" />
            Remote Web (any browser)
          </h4>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed max-w-2xl">
            Start a pairing room on a Cloudflare Worker (or local wrangler). Scan the QR or open the URL on any phone or laptop to control TDE from anywhere. The pairing URL and credentials are saved locally and reused after you reopen or update TDE.
          </p>
        </div>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
          status?.connected
            ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
            : status?.running
              ? 'text-amber-300 bg-amber-500/10 border border-amber-500/20'
              : 'text-slate-500 bg-slate-800/40'
        }`}>
          {status?.connected ? 'Relay connected' : status?.running ? 'Connecting' : 'Stopped'}
        </span>
      </div>

      <label className="block space-y-1">
        <span className="text-[10px] font-mono text-slate-500">Relay URL</span>
        <input
          value={relayUrl}
          onChange={(event) => setRelayUrl(event.target.value)}
          className="w-full bg-black/40 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200"
          placeholder={DEFAULT_RELAY_URL}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void start()}
          disabled={busy}
          className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded text-xs font-mono"
        >
          <Radio size={12} />
          {status?.pairing_url ? 'Reconnect' : 'Start pairing'}
        </button>
        <button
          onClick={() => void stop()}
          disabled={busy}
          className="flex items-center gap-1.5 bg-transparent border border-slate-700 text-slate-300 px-2.5 py-1.5 rounded text-xs font-mono"
        >
          Stop
        </button>
        <button
          onClick={() => void revoke()}
          disabled={busy}
          className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-200 px-2.5 py-1.5 rounded text-xs font-mono"
        >
          <ShieldCheck size={12} />
          Revoke
        </button>
        <button
          onClick={() => void refresh()}
          className="flex items-center gap-1.5 bg-transparent border border-slate-800 text-slate-400 px-2.5 py-1.5 rounded text-xs font-mono"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {status?.error && (
        <div className="text-[11px] font-mono text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          {status.error}
        </div>
      )}

      {status?.pairing_url && (
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 items-start">
          {status.qr_svg && (
            <div className="rounded-xl bg-white p-4 w-[260px] h-[260px] shrink-0">
              <div
                className="w-full h-full [&>svg]:block [&>svg]:w-full [&>svg]:h-full"
                dangerouslySetInnerHTML={{ __html: status.qr_svg }}
              />
            </div>
          )}
          <div className="space-y-2">
            <div className="text-[10px] font-mono text-slate-500">Pairing URL</div>
            <div className="text-[11px] font-mono text-slate-200 break-all bg-black/40 border border-slate-800 rounded-lg px-3 py-2">
              {status.pairing_url}
            </div>
            <button
              onClick={() => void copyUrl()}
              className="flex items-center gap-1.5 text-xs font-mono text-slate-300"
            >
              <Copy size={12} />
              {copied ? 'Copied' : 'Copy URL'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
