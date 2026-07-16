export type ShellResumeKind = 'reattached' | 'restarted' | 'resumed';

export const isLocalShell = (command?: string, sshHost?: string): boolean => {
  if (!command || sshHost?.trim()) return false;
  const executable = command.split(/[\\/]/).pop()?.toLowerCase();
  return executable === 'zsh' || executable === 'bash' || executable === 'sh';
};

export const shellResumeMessage = (kind: ShellResumeKind): string => {
  if (kind === 'reattached') return 'Shell session reattached';
  if (kind === 'restarted') return 'Shell session restarted; saved scrollback restored';
  return 'Shell session resumed';
};
