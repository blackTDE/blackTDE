# Fix Markdown Image Loading and WKWebView Video Playback via Blob URLs

## Executive Summary
This spec details the fix for:
1. Markdown image preview failing or displaying plain text for relative/local image links.
2. Video preview (`.mp4`, `.webm`, `.mov`, etc.) showing diagonal strike-through icon (unsupported format/decode error) in WKWebView on macOS.

---

## 1. Problem Analysis & Root Cause

### Issue 1: Markdown Relative Image Loading
- Markdown relative images (e.g., `![alt](./qr_codes/Jam-jp-VLESS-WS.png)`) failed to load or fallback to broken image icon when resolved using `convertFileSrc` due to local scheme path restrictions and query/hash stripping.

### Issue 2: WKWebView Video Playback Error
- Large base64 data URLs (`data:video/mp4;base64,...`) passed to `<video src="...">` exceed WKWebView's inline data URL parser limit, causing WebKit AVFoundation to abort decoding and render a strike-through play button.
- Native asset protocol URLs (`convertFileSrc`) fail because AVFoundation requires HTTP 206 Partial Content (Byte Range) requests.

---

## 2. Solution Design

### A. Blob URL Generation (`base64ToBlobUrl` & `getAbsolutePath`)
- Add `base64ToBlobUrl(b64: string, mimeType: string): string` in `src/utils/htmlPreviewUtils.ts`.
- Convert decoded base64 bytes into a native JavaScript `Blob` and generate `blob:http://...` via `URL.createObjectURL(blob)`.
- `blob:` URLs provide a native binary memory handle that WebKit AVFoundation can play, seek, and stream without data URL size limits or 206 Range header failures.
- Revoke created `blob:` URLs on unmount using `URL.revokeObjectURL(url)` to prevent memory leaks.

### B. Async Stateful `MarkdownImage` Component
- Create `MarkdownImage` component for `ReactMarkdown`.
- Use `getAbsolutePath(src, currentFilePath)` to resolve relative paths cleanly (stripping query parameters `?` and hashes `#`).
- Read image binary via `read_file_base64` and convert to `blob:` URL for guaranteed local rendering.

---

## 3. Verification Strategy
- Add unit tests for `getAbsolutePath` and `base64ToBlobUrl` in `tests/mediaAndHtmlPreview.test.ts`.
- Verify `npm run test`, `npm run build`, and `cargo test`.
