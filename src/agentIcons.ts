export type AgentIconKind = 'claude' | 'codex' | 'antigravity' | 'gemini' | 'opencode' | 'pi' | 'omp' | 'cursor' | 'fallback';

export function getAgentIconKind(name: string): AgentIconKind {
  const command = name.toLowerCase().split(/[\\/]/).pop() || '';
  if (command.includes('claude')) return 'claude';
  if (command.includes('codex') || command.includes('openai')) return 'codex';
  if (command === 'agy' || command.includes('antigravity')) return 'antigravity';
  if (command.includes('gemini')) return 'gemini';
  if (command.includes('opencode') || command.includes('open-code')) return 'opencode';
  if (command === 'omp' || command.includes('oh-my-pi') || command.includes('ohmypi')) return 'omp';
  if (command === 'pi' || command.includes('pi-agent') || command.includes('pi-coding')) return 'pi';
  if (command === 'agent' || command === 'cursor-agent' || command === 'cursor') return 'cursor';
  return 'fallback';
}
