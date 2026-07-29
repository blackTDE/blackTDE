# Media (Video/Audio) and HTML Local Resource Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix video/audio playback preview in `FilePreview.tsx` and enable HTML preview to load local relative directory subresources.

---

### Task 1: Enable Asset Permissions in Tauri Capabilities

**Files:**
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add `"core:asset:default"` to `permissions` array**
- [ ] **Step 2: Commit capability changes**

---

### Task 2: Implement Video, Audio, and HTML Resource Resolution in `FilePreview.tsx`

**Files:**
- Modify: `src/components/FilePreview.tsx`
- Create: `src/utils/htmlPreviewUtils.ts` (helper for HTML base tag injection & extension checks to keep code modular and testable)
- Create: `tests/mediaAndHtmlPreview.test.ts`

- [ ] **Step 1: Create `src/utils/htmlPreviewUtils.ts`**
  - Implement `processHtmlWithBaseUrl(htmlContent: string, activeFilePath: string, convertFileSrcFn: (path: string) => string): string`
  - Implement extension helper functions: `isVideoFile(ext)`, `isAudioFile(ext)`, `isPreviewableFile(ext)`, `isBinaryFile(ext)`

- [ ] **Step 2: Create unit tests in `tests/mediaAndHtmlPreview.test.ts`**
  - Test `processHtmlWithBaseUrl` injects `<base href="...">` into `<head>` or at root.
  - Test media extension classification (`wav`, `mp4`, `webm`, `html`, etc.).

- [ ] **Step 3: Update `src/components/FilePreview.tsx`**
  - Import `convertFileSrc` from `@tauri-apps/api/core` and icons (`Volume2`, `Film`) from `lucide-react`.
  - Update `isPreviewable` and `isBinary` using `htmlPreviewUtils`.
  - Update `loadData` to skip unnecessary text/base64 reading for streaming media (`isVideo` / `isAudio`).
  - Update `renderPreviewContent`:
    - Add HTML `<base href="...">` handling with `sandbox="allow-scripts allow-same-origin allow-popups allow-forms"`.
    - Add HTML5 `<video controls src={convertFileSrc(activeFilePath)}>` preview.
    - Add HTML5 `<audio controls src={convertFileSrc(activeFilePath)}>` preview.

- [ ] **Step 4: Run verification suite (`npm run test`, `npm run build`, `cargo test`)**

- [ ] **Step 5: Commit changes**
