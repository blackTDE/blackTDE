export type RelayRole = 'desktop' | 'browser';

export type ControlKey =
  | 'ctrl-c'
  | 'ctrl-d'
  | 'ctrl-z'
  | 'ctrl-l'
  | 'ctrl-a'
  | 'ctrl-e'
  | 'ctrl-u'
  | 'ctrl-w'
  | 'tab'
  | 'esc'
  | 'enter'
  | 'backspace'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'home'
  | 'end'
  | 'y'
  | 'n';

export const CONTROL_BYTES: Record<ControlKey, number[]> = {
  'ctrl-c': [0x03],
  'ctrl-d': [0x04],
  'ctrl-z': [0x1a],
  'ctrl-l': [0x0c],
  'ctrl-a': [0x01],
  'ctrl-e': [0x05],
  'ctrl-u': [0x15],
  'ctrl-w': [0x17],
  tab: [0x09],
  esc: [0x1b],
  enter: [0x0d],
  backspace: [0x7f],
  up: [0x1b, 0x5b, 0x41],
  down: [0x1b, 0x5b, 0x42],
  right: [0x1b, 0x5b, 0x43],
  left: [0x1b, 0x5b, 0x44],
  home: [0x1b, 0x5b, 0x48],
  end: [0x1b, 0x5b, 0x46],
  y: [0x79, 0x0d],
  n: [0x6e, 0x0d],
};

export const CONTROL_ACTIONS: { key: ControlKey; label: string }[] = [
  { key: 'up', label: '↑' },
  { key: 'down', label: '↓' },
  { key: 'left', label: '←' },
  { key: 'right', label: '→' },
  { key: 'ctrl-c', label: 'Ctrl+C' },
  { key: 'ctrl-d', label: 'Ctrl+D' },
  { key: 'ctrl-z', label: 'Ctrl+Z' },
  { key: 'ctrl-l', label: 'Ctrl+L' },
  { key: 'ctrl-a', label: 'Ctrl+A' },
  { key: 'ctrl-e', label: 'Ctrl+E' },
  { key: 'ctrl-u', label: 'Ctrl+U' },
  { key: 'ctrl-w', label: 'Ctrl+W' },
  { key: 'tab', label: 'Tab' },
  { key: 'esc', label: 'Esc' },
  { key: 'enter', label: 'Enter' },
  { key: 'backspace', label: '⌫' },
  { key: 'home', label: 'Home' },
  { key: 'end', label: 'End' },
  { key: 'y', label: 'Y' },
  { key: 'n', label: 'N' },
];

export const RPC_METHODS = [
  'list_workspaces',
  'list_sessions',
  'resume_session',
  'write_input',
  'write_bytes',
  'resize_session',
  'send_control',
  'get_session_history',
  'list_files',
  'read_file',
  'git_status',
  'git_diff',
  'git_log',
  'git_commit_files',
] as const;

export type RpcMethod = (typeof RPC_METHODS)[number];

export interface RoomAuthState {
  tokenHash: string | null;
  revoked: boolean;
}

export type HelloDecision =
  | { ok: true; storeHash?: string }
  | { ok: false; error: string };

export function authorizeHello(
  state: RoomAuthState,
  role: RelayRole,
  incomingHash: string,
): HelloDecision {
  if (state.revoked) {
    return { ok: false, error: 'revoked' };
  }
  if (!incomingHash) {
    return { ok: false, error: 'invalid token' };
  }
  if (!state.tokenHash) {
    if (role !== 'desktop') {
      return { ok: false, error: 'desktop must pair first' };
    }
    return { ok: true, storeHash: incomingHash };
  }
  if (state.tokenHash !== incomingHash) {
    return { ok: false, error: 'invalid token' };
  }
  return { ok: true };
}

export function isWorkspacePathAllowed(path: string, workspaceRoots: string[]): boolean {
  const normalized = normalizePath(path);
  if (!normalized) {
    return false;
  }
  return workspaceRoots.some((root) => {
    const prefix = normalizePath(root);
    return prefix !== '' && (normalized === prefix || normalized.startsWith(`${prefix}/`));
  });
}

export function normalizePath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, '/');
  if (!trimmed) {
    return '';
  }
  const parts: string[] = [];
  for (const part of trimmed.split('/')) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  if (trimmed.startsWith('/')) {
    return `/${parts.join('/')}`;
  }
  return parts.join('/');
}

export function buildPairingUrl(relayUrl: string, roomId: string, token: string): string {
  const base = relayUrl.trim().replace(/\/+$/, '');
  return `${base}/r/${roomId}#t=${token}`;
}

export function toWebSocketUrl(relayUrl: string, roomId: string): string {
  const base = relayUrl.trim().replace(/\/+$/, '');
  let ws = base;
  if (base.startsWith('https://')) {
    ws = `wss://${base.slice('https://'.length)}`;
  } else if (base.startsWith('http://')) {
    ws = `ws://${base.slice('http://'.length)}`;
  } else if (!base.startsWith('ws://') && !base.startsWith('wss://')) {
    throw new Error('Relay URL must start with http:// or https://');
  }
  return `${ws.replace(/\/+$/, '')}/ws/${roomId}`;
}

export function parsePairingUrl(raw: string): { relayUrl: string; roomId: string; token: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const hashIndex = trimmed.indexOf('#');
    const withoutHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
    const hash = hashIndex >= 0 ? trimmed.slice(hashIndex + 1) : '';
    const url = new URL(withoutHash);
    const parts = url.pathname.split('/').filter(Boolean);
    const roomIndex = parts.lastIndexOf('r');
    const roomId = roomIndex >= 0 ? parts[roomIndex + 1] : '';
    const token = new URLSearchParams(hash).get('t') || '';
    if (!roomId || !token) {
      return null;
    }
    return {
      relayUrl: `${url.protocol}//${url.host}`,
      roomId,
      token,
    };
  } catch {
    return null;
  }
}

export function stripAnsi(input: string): string {
  return input.replace(/\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

export function appendPromptSubmit(text: string): string {
  if (text.endsWith('\r') || text.endsWith('\n')) {
    return text;
  }
  return `${text}\r`;
}

export function decodeBase64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function encodeBase64Bytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function terminalWriteText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function shouldSubmitPromptKey(event: {
  key: string;
  isComposing?: boolean;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
}): boolean {
  if (event.key !== 'Enter') {
    return false;
  }
  if (event.isComposing || event.nativeEvent?.isComposing) {
    return false;
  }
  if (event.keyCode === 229 || event.nativeEvent?.keyCode === 229) {
    return false;
  }
  return true;
}

export function validateSessionWrite(sessionId: string, _running?: boolean): string | null {
  if (!sessionId) {
    return 'Select a session first.';
  }
  return null;
}

export function createRpcId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rpc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
