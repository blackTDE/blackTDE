export type AgentIconKind = 'claude' | 'codex' | 'antigravity' | 'gemini' | 'opencode' | 'fallback';

export function getAgentIconKind(name: string): AgentIconKind {
  const command = name.toLowerCase().split(/[\\/]/).pop() || '';
  if (command.includes('claude')) return 'claude';
  if (command.includes('codex') || command.includes('openai')) return 'codex';
  if (command === 'agy' || command.includes('antigravity')) return 'antigravity';
  if (command.includes('gemini')) return 'gemini';
  if (command.includes('opencode') || command.includes('open-code')) return 'opencode';
  return 'fallback';
}
