/**
 * Utility functions for parsing Git repository URLs and computing clone target paths.
 */

/**
 * Extracts the repository name from various Git URL formats:
 * - HTTPS: https://github.com/owner/repo.git -> repo
 * - SSH: git@github.com:owner/repo.git -> repo
 * - Custom SSH port: ssh://git@gitlab.com:2222/group/repo.git -> repo
 * - Local / file: file:///path/to/repo.git -> repo
 */
export const extractRepoNameFromUrl = (rawUrl: string): string => {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();

  // Strip query string and fragment if present
  const queryIdx = url.indexOf('?');
  if (queryIdx !== -1) {
    url = url.substring(0, queryIdx);
  }
  const hashIdx = url.indexOf('#');
  if (hashIdx !== -1) {
    url = url.substring(0, hashIdx);
  }

  // Strip trailing slashes
  url = url.replace(/[/\\]+$/, '');

  // Strip trailing .git (case-insensitive)
  if (url.toLowerCase().endsWith('.git')) {
    url = url.slice(0, -4);
  }

  // Find last path separator (slash or colon for SCP-like syntax: git@host:repo)
  const lastSlash = url.lastIndexOf('/');
  const lastColon = url.lastIndexOf(':');
  const sepIdx = Math.max(lastSlash, lastColon);

  if (sepIdx !== -1 && sepIdx < url.length - 1) {
    const candidate = url.substring(sepIdx + 1).trim();
    return candidate;
  }

  return url;
};

/**
 * Determines a sensible default parent directory for cloning a new repository,
 * based on current active workspace or existing workspace paths.
 */
export const getDefaultCloneParent = (
  workspaces: Array<{ path: string }>,
  activeWorkspacePath?: string
): string => {
  const getParent = (p: string): string => {
    const normalized = p.replace(/\\/g, '/').replace(/\/+$/, '');
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash > 0) {
      return normalized.substring(0, lastSlash);
    }
    return normalized;
  };

  if (activeWorkspacePath && activeWorkspacePath.trim()) {
    return getParent(activeWorkspacePath.trim());
  }

  if (workspaces && workspaces.length > 0 && workspaces[0]?.path) {
    return getParent(workspaces[0].path);
  }

  return '';
};

/**
 * Combines parent directory and cloned directory name into a clean target path.
 */
export const buildCloneTargetPath = (parentDir: string, dirName: string): string => {
  const cleanParent = (parentDir || '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const cleanName = (dirName || '').trim().replace(/^[/\\]+/, '').replace(/[/\\]+$/, '');

  if (!cleanParent) return cleanName;
  if (!cleanName) return cleanParent;
  return `${cleanParent}/${cleanName}`;
};
