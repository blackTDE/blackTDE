/**
 * Helpers for file preview, extension categorization, and HTML base tag injection for local subresources.
 */

export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogv', 'mov', 'm4v', 'mkv', 'avi'];
export const AUDIO_EXTENSIONS = ['wav', 'mp3', 'ogg', 'flac', 'aac', 'm4a'];
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'];
export const DOC_EXTENSIONS = ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls'];

const CODE_LANGUAGES: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', py: 'python', pyw: 'python', rs: 'rust', go: 'go',
  java: 'java', c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp', php: 'php', rb: 'ruby', swift: 'swift', kt: 'kotlin', kts: 'kotlin',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell', ps1: 'powershell', sql: 'sql',
  html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less', json: 'json',
  jsonc: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini', xml: 'xml', md: 'markdown',
};

const CODE_FILENAMES: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
};

export function getCodeLanguage(pathOrExtension: string): string {
  const filename = pathOrExtension.toLowerCase().replace(/\\/g, '/').split('/').pop() || '';
  return CODE_FILENAMES[filename] || CODE_LANGUAGES[filename.split('.').pop() || ''] || 'plaintext';
}

export function isCodeFile(pathOrExtension: string): boolean {
  return getCodeLanguage(pathOrExtension) !== 'plaintext';
}

export function isVideoFile(ext: string): boolean {
  return VIDEO_EXTENSIONS.includes(ext.toLowerCase());
}

export function isAudioFile(ext: string): boolean {
  return AUDIO_EXTENSIONS.includes(ext.toLowerCase());
}

export function isImageFile(ext: string): boolean {
  return IMAGE_EXTENSIONS.includes(ext.toLowerCase());
}

export function isPreviewableFile(ext: string): boolean {
  const normalized = ext.toLowerCase();
  return (
    ['md', 'html', 'htm', 'json'].includes(normalized) ||
    isCodeFile(normalized) ||
    isVideoFile(normalized) ||
    isAudioFile(normalized) ||
    isImageFile(normalized) ||
    DOC_EXTENSIONS.includes(normalized)
  );
}

export function isBinaryFile(ext: string): boolean {
  const normalized = ext.toLowerCase();
  return (
    isVideoFile(normalized) ||
    isAudioFile(normalized) ||
    isImageFile(normalized) ||
    DOC_EXTENSIONS.includes(normalized)
  );
}

export function getMediaMimeType(ext: string): string {
  const normalized = ext.toLowerCase();
  switch (normalized) {
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    case 'ogg':
      return 'audio/ogg';
    case 'flac':
      return 'audio/flac';
    case 'aac':
      return 'audio/aac';
    case 'm4a':
      return 'audio/mp4';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'ogv':
      return 'video/ogg';
    case 'mov':
      return 'video/quicktime';
    case 'm4v':
      return 'video/x-m4v';
    case 'mkv':
      return 'video/x-matroska';
    case 'avi':
      return 'video/x-msvideo';
    case 'svg':
      return 'image/svg+xml';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'ico':
      return 'image/x-icon';
    default:
      return `image/${normalized}`;
  }
}

export function imageDataUrl(ext: string, base64: string): string {
  return `data:${getMediaMimeType(ext)};base64,${base64}`;
}

/**
 * Injects `<base href="...">` pointing to the file's parent directory via Tauri asset protocol
 * so relative URLs in `<img src="...">`, `<video src="...">`, `<link href="...">`, `<script src="...">` resolve correctly.
 */
export function processHtmlWithBaseUrl(
  htmlContent: string,
  filePath: string,
  convertFileSrcFn: (path: string) => string
): string {
  if (!filePath) return htmlContent;

  const lastSlashIdx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const parentDir = lastSlashIdx !== -1 ? filePath.substring(0, lastSlashIdx) : '';

  if (!parentDir) return htmlContent;

  const assetUrl = convertFileSrcFn(parentDir);
  const baseAssetUrl = assetUrl.endsWith('/') ? assetUrl : `${assetUrl}/`;
  const baseTag = `<base href="${baseAssetUrl}">`;
  const metaCharset = /<meta[^>]+charset/i.test(htmlContent) ? '' : '<meta charset="UTF-8">\n  ';

  if (/<head[^>]*>/i.test(htmlContent)) {
    return htmlContent.replace(/(<head[^>]*>)/i, `$1\n  ${metaCharset}${baseTag}`);
  }

  return `${metaCharset}${baseTag}\n${htmlContent}`;
}

/**
 * Resolves Markdown image src URLs (relative, absolute, or external) to valid display URLs.
 */
export function resolveMarkdownAssetUrl(
  src: string,
  filePath: string,
  convertFileSrcFn: (path: string) => string
): string {
  if (!src) return '';
  const trimmed = src.trim();

  // 1. External URLs or Data URLs
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  // 2. Absolute filesystem paths (e.g. /Users/ray/...)
  if (trimmed.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(trimmed)) {
    return convertFileSrcFn(trimmed);
  }

  // 3. Relative paths (e.g. ./images/photo.png or images/photo.png or ../pic.png)
  if (!filePath) return trimmed;

  const lastSlashIdx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const parentDir = lastSlashIdx !== -1 ? filePath.substring(0, lastSlashIdx) : '';

  if (!parentDir) return convertFileSrcFn(trimmed);

  const segments = parentDir.split(/[/\\]/);
  const relSegments = trimmed.split(/[/\\]/);

  for (const seg of relSegments) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') {
      if (segments.length > 0) segments.pop();
    } else {
      segments.push(seg);
    }
  }

  const absolutePath = segments.join('/');
  return convertFileSrcFn(absolutePath);
}

/**
 * Resolves relative or absolute path relative to current file path, stripping query parameters and hashes.
 */
export function getAbsolutePath(relOrAbsPath: string, currentFilePath: string): string {
  if (!relOrAbsPath) return '';
  const cleanPath = relOrAbsPath.trim().split('?')[0].split('#')[0];

  if (cleanPath.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(cleanPath)) {
    return cleanPath;
  }

  if (!currentFilePath) return cleanPath;

  const lastSlashIdx = Math.max(currentFilePath.lastIndexOf('/'), currentFilePath.lastIndexOf('\\'));
  const parentDir = lastSlashIdx !== -1 ? currentFilePath.substring(0, lastSlashIdx) : '';

  if (!parentDir) return cleanPath;

  const segments = parentDir.split(/[/\\]/);
  const relSegments = cleanPath.split(/[/\\]/);

  for (const seg of relSegments) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') {
      if (segments.length > 0) segments.pop();
    } else {
      segments.push(seg);
    }
  }

  return segments.join('/');
}

/**
 * Converts a base64 string and MIME type into a browser native Blob object URL (`blob:http://...`).
 */
export function base64ToBlobUrl(b64: string, mimeType: string): string {
  const binaryString = atob(b64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Formats byte size into human readable string (e.g. 1.5 KB, 20.0 MB).
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
