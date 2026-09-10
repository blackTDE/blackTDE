export type RemoteCommand =
  | { type: 'help' }
  | { type: 'project_list' }
  | { type: 'session_list'; projectId?: string }
  | { type: 'switch_session'; sessionId: string }
  | { type: 'unknown'; command: string }
  | { type: 'agent_input'; text: string };

/**
 * Parses an incoming text message from Telegram or Lark to see if it is a slash command.
 */
export function parseRemoteSlashCommand(text: string): RemoteCommand {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) {
    return { type: 'agent_input', text };
  }

  const parts = trimmed.split(/\s+/);
  const root = parts[0].toLowerCase();

  if (root === '/help' || root === '/start') {
    return { type: 'help' };
  }

  if (root === '/project') {
    const sub = parts[1]?.toLowerCase();
    if (sub === 'list') {
      const sub2 = parts[2]?.toLowerCase();
      if (sub2 === 'session' || sub2 === 'sessions') {
        return { type: 'session_list' };
      }
      return { type: 'project_list' };
    }
  }

  if (root === '/session' && parts[1]?.toLowerCase() === 'list') {
    return { type: 'session_list' };
  }

  if (root === '/switch') {
    if (parts[1]?.toLowerCase() === 'project' && parts[2]?.toLowerCase() === 'session') {
      const sessionId = parts.slice(3).join(' ').trim();
      return { type: 'switch_session', sessionId };
    }
    const sessionId = parts.slice(1).join(' ').trim();
    return { type: 'switch_session', sessionId };
  }

  return { type: 'unknown', command: root };
}

/**
 * Validates and normalizes a 6-digit or 6-character pairing code.
 */
export function normalizePairCode(raw: string): string {
  return raw.replace(/[^0-9a-zA-Z]/g, '').toUpperCase().slice(0, 6);
}

/**
 * Checks if a string is a valid 6-digit pair code.
 */
export function isValidPairCode(raw: string): boolean {
  return /^[0-9A-Z]{6}$/.test(normalizePairCode(raw));
}
