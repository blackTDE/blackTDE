import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isVideoFile,
  isAudioFile,
  isPreviewableFile,
  isBinaryFile,
  getMediaMimeType,
  processHtmlWithBaseUrl,
  resolveMarkdownAssetUrl,
  getAbsolutePath,
  base64ToBlobUrl
} from '../src/utils/htmlPreviewUtils.ts';

test('returns correct MIME types for media files', () => {
  assert.equal(getMediaMimeType('wav'), 'audio/wav');
  assert.equal(getMediaMimeType('mp3'), 'audio/mpeg');
  assert.equal(getMediaMimeType('mp4'), 'video/mp4');
  assert.equal(getMediaMimeType('webm'), 'video/webm');
});

test('recognizes video and audio extensions', () => {
  assert.equal(isVideoFile('mp4'), true);
  assert.equal(isVideoFile('WEBM'), true);
  assert.equal(isVideoFile('mov'), true);
  assert.equal(isVideoFile('txt'), false);

  assert.equal(isAudioFile('wav'), true);
  assert.equal(isAudioFile('MP3'), true);
  assert.equal(isAudioFile('flac'), true);
  assert.equal(isAudioFile('html'), false);
});

test('identifies previewable and binary file types', () => {
  assert.equal(isPreviewableFile('html'), true);
  assert.equal(isPreviewableFile('mp4'), true);
  assert.equal(isPreviewableFile('wav'), true);
  assert.equal(isPreviewableFile('png'), true);
  assert.equal(isPreviewableFile('rs'), false);

  assert.equal(isBinaryFile('mp4'), true);
  assert.equal(isBinaryFile('wav'), true);
  assert.equal(isBinaryFile('png'), true);
  assert.equal(isBinaryFile('html'), false);
});

test('injects base tag into head when head exists', () => {
  const html = '<!DOCTYPE html><html><head><title>Test</title></head><body><img src="./pic.png"></body></html>';
  const filePath = '/Users/ray/project/index.html';
  const dummyConvertFileSrc = (p: string) => `asset://localhost${p}`;

  const result = processHtmlWithBaseUrl(html, filePath, dummyConvertFileSrc);
  assert.match(result, /<head>\s*<base href="asset:\/\/localhost\/Users\/ray\/project\/">/);
  assert.match(result, /<img src="\.\/pic\.png">/);
});

test('prepends base tag when head tag is absent', () => {
  const html = '<div><h1>Fragment</h1><img src="assets/banner.png"></div>';
  const filePath = '/Users/ray/project/docs/page.html';
  const dummyConvertFileSrc = (p: string) => `http://asset.localhost${p}`;

  const result = processHtmlWithBaseUrl(html, filePath, dummyConvertFileSrc);
  assert.equal(result.startsWith('<base href="http://asset.localhost/Users/ray/project/docs/">'), true);
});

test('resolves relative, absolute, and remote Markdown image URLs', () => {
  const dummyConvertFileSrc = (p: string) => `asset://localhost${p}`;
  const mdPath = '/Users/ray/project/docs/README.md';

  assert.equal(
    resolveMarkdownAssetUrl('https://example.com/logo.png', mdPath, dummyConvertFileSrc),
    'https://example.com/logo.png'
  );
  assert.equal(
    resolveMarkdownAssetUrl('data:image/png;base64,123', mdPath, dummyConvertFileSrc),
    'data:image/png;base64,123'
  );
  assert.equal(
    resolveMarkdownAssetUrl('/var/tmp/pic.png', mdPath, dummyConvertFileSrc),
    'asset://localhost/var/tmp/pic.png'
  );
  assert.equal(
    resolveMarkdownAssetUrl('./images/photo.png', mdPath, dummyConvertFileSrc),
    'asset://localhost/Users/ray/project/docs/images/photo.png'
  );
  assert.equal(
    resolveMarkdownAssetUrl('../assets/diagram.png', mdPath, dummyConvertFileSrc),
    'asset://localhost/Users/ray/project/assets/diagram.png'
  );
});

test('resolves absolute path cleanly stripping query parameters and hashes', () => {
  const currentPath = '/Users/ray/git-repo/black_tde/README.md';
  assert.equal(
    getAbsolutePath('./qr_codes/Jam-jp-VLESS-WS.png?v=1#tag', currentPath),
    '/Users/ray/git-repo/black_tde/qr_codes/Jam-jp-VLESS-WS.png'
  );
  assert.equal(
    getAbsolutePath('/tmp/sample.mp4', currentPath),
    '/tmp/sample.mp4'
  );
});

test('converts base64 to Blob URL string', () => {
  const dummyB64 = 'SGVsbG8gV29ybGQ='; // "Hello World"
  const blobUrl = base64ToBlobUrl(dummyB64, 'video/mp4');
  assert.equal(blobUrl.startsWith('blob:'), true);
});
