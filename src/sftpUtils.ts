/**
 * SFTP Remote Explorer Path & Navigation Utilities
 */

export const canNavigateUp = (currentCwd: string): boolean => {
  const trimmed = currentCwd.trim();
  return Boolean(trimmed && trimmed !== '.' && trimmed !== '/');
};

export const resolveSftpPath = (currentCwd: string, target: string): string => {
  const trimmedTarget = target.trim();
  const trimmedCwd = currentCwd.trim();

  if (!trimmedTarget || trimmedTarget === '.') {
    return trimmedCwd;
  }

  // Handle navigate to parent '..'
  if (trimmedTarget === '..') {
    if (!trimmedCwd || trimmedCwd === '.' || trimmedCwd === '/') {
      return trimmedCwd === '/' ? '/' : '';
    }

    if (trimmedCwd.startsWith('/')) {
      const parts = trimmedCwd.split('/').filter(Boolean);
      parts.pop();
      return parts.length === 0 ? '/' : `/${parts.join('/')}`;
    }

    const parts = trimmedCwd.split('/').filter(Boolean);
    parts.pop();
    return parts.join('/');
  }

  // Handle absolute target path
  if (trimmedTarget.startsWith('/')) {
    const parts = trimmedTarget.split('/').filter(Boolean);
    return `/${parts.join('/')}`;
  }

  // Handle relative target path
  const cleanTarget = trimmedTarget.replace(/^\/+|\/+$/g, '');
  if (!trimmedCwd || trimmedCwd === '.') {
    return cleanTarget;
  }

  if (trimmedCwd === '/') {
    return `/${cleanTarget}`;
  }

  const cleanCwd = trimmedCwd.replace(/\/+$/, '');
  return `${cleanCwd}/${cleanTarget}`;
};
