/**
 * Utilities for FileTree selection, creation targets, and path resolution
 */

export const getParentDirectory = (filePath: string): string => {
  const clean = filePath.trim();
  if (clean === '/' || clean === '\\' || !clean) {
    return clean === '/' ? '/' : '';
  }
  const normalized = clean.replace(/[/\\]+$/, '');
  if (!normalized) {
    return clean.startsWith('/') ? '/' : '';
  }
  const lastSlashIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (lastSlashIndex === -1) {
    return '';
  }
  if (lastSlashIndex === 0) {
    return normalized.startsWith('/') ? '/' : '';
  }
  return normalized.slice(0, lastSlashIndex);
};

export const resolveCreationDirectory = (
  rootPath: string,
  selectedPath: string | null,
  selectedIsDir: boolean,
): string => {
  if (!selectedPath) {
    return rootPath;
  }

  const cleanRoot = rootPath.replace(/[/\\]+$/, '');
  const cleanSelected = selectedPath.replace(/[/\\]+$/, '');

  if (selectedIsDir) {
    return cleanSelected;
  }

  const parent = getParentDirectory(cleanSelected);
  return parent || cleanRoot;
};

export const getRelativeDisplayPath = (rootPath: string, targetPath: string): string => {
  const cleanRoot = rootPath.replace(/[/\\]+$/, '');
  const cleanTarget = targetPath.replace(/[/\\]+$/, '');

  if (!cleanTarget || cleanTarget === cleanRoot) {
    return '/ (root)';
  }

  if (cleanTarget.startsWith(cleanRoot)) {
    const rel = cleanTarget.slice(cleanRoot.length).replace(/^[/\\]+/, '');
    return rel || '/ (root)';
  }

  return cleanTarget;
};

export const getRelativePath = (rootPath: string, targetPath: string): string => {
  const cleanRoot = rootPath.replace(/[/\\]+$/, '');
  const cleanTarget = targetPath.replace(/[/\\]+$/, '');

  if (!cleanTarget || cleanTarget === cleanRoot) {
    return '.';
  }

  if (cleanTarget.startsWith(cleanRoot)) {
    const rel = cleanTarget.slice(cleanRoot.length).replace(/^[/\\]+/, '');
    return rel || '.';
  }

  return cleanTarget;
};
