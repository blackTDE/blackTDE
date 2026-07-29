# Media (Video/Audio) and HTML Local Resource Preview Design Spec

## Executive Summary
This spec details fixes for two file preview issues in TDE:
1. Enabling visual and playback preview support for video (`.mp4`, `.webm`, `.ogv`, `.mov`, `.m4v`, `.mkv`, `.avi`) and audio (`.wav`, `.mp3`, `.ogg`, `.flac`, `.aac`, `.m4a`) files.
2. Resolving local relative resources (`<img>`, `<video>`, `<audio>`, `<link>`, `<script>`) when previewing HTML files by injecting a Tauri asset `<base href="...">` tag into the iframe context.

---

## 1. Issue Breakdown & Solution Design

### Issue A: Video / Audio File Preview
- **Problem**: Attempting to preview a video or `.wav` file was unsupported because video/audio extensions were excluded from `isPreviewable` and `isBinary`, and no HTML5 `<video>` / `<audio>` player was configured.
- **Solution**:
  - Add video (`mp4`, `webm`, `ogv`, `mov`, `m4v`, `mkv`, `avi`) and audio (`wav`, `mp3`, `ogg`, `flac`, `aac`, `m4a`) extensions to `isPreviewable` and `isBinary`.
  - Use Tauri's `convertFileSrc(activeFilePath)` to obtain standard asset URLs for video/audio streaming.
  - Render HTML5 `<video controls autoPlay src={convertFileSrc(activeFilePath)}>` for videos and `<audio controls autoPlay src={convertFileSrc(activeFilePath)}>` with audio status UI for audio files.

### Issue B: HTML Relative Resource Resolution
- **Problem**: Previewing HTML files via `iframe srcDoc={textContent}` caused relative paths (e.g., `<img src="./images/pic.png">`, `<script src="app.js">`, `<link href="style.css">`) to fail because `srcDoc` defaults to `about:srcdoc`.
- **Solution**:
  - Extract the parent directory of `activeFilePath`: `parentDir = activeFilePath.substring(0, activeFilePath.lastIndexOf('/'))`.
  - Convert `parentDir` to a Tauri asset URL: `baseAssetUrl = convertFileSrc(parentDir) + '/'`.
  - Inject `<base href="${baseAssetUrl}">` into the HTML `<head>` (or at the start of document).
  - Update `iframe` sandbox to `sandbox="allow-scripts allow-same-origin allow-popups allow-forms"` to permit loading subresources from `baseAssetUrl`.

---

## 2. Capability Permissions & Testing
- Update `src-tauri/capabilities/default.json` to include `"core:asset:default"` permissions for Tauri asset protocol.
- Add unit tests in `tests/mediaAndHtmlPreview.test.ts` covering path processing, extension classification, and base tag injection logic.
