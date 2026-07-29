/**
 * Helpers for file preview, extension categorization, and HTML base tag injection for local subresources.
 */

export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogv', 'mov', 'm4v', 'mkv', 'avi'];
export const AUDIO_EXTENSIONS = ['wav', 'mp3', 'ogg', 'flac', 'aac', 'm4a'];
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'];
export const DOC_EXTENSIONS = ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls'];

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

  if (/<head[^>]*>/i.test(htmlContent)) {
    return htmlContent.replace(/(<head[^>]*>)/i, `$1\n  ${baseTag}`);
  }

  return `${baseTag}\n${htmlContent}`;
}
