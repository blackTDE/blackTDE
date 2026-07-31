# Fix Markdown Image Loading and Video Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `base64ToBlobUrl` and `getAbsolutePath` to fix video playback in WKWebView and resolve Markdown relative image loading.

---

### Task 1: Add `base64ToBlobUrl` and `getAbsolutePath` to `src/utils/htmlPreviewUtils.ts` & Add Tests

**Files:**
- Modify: `src/utils/htmlPreviewUtils.ts`
- Modify: `tests/mediaAndHtmlPreview.test.ts`

- [ ] **Step 1: Implement `base64ToBlobUrl` and `getAbsolutePath` in `htmlPreviewUtils.ts`**
- [ ] **Step 2: Add unit tests in `mediaAndHtmlPreview.test.ts`**
- [ ] **Step 3: Run `npm run test`**
- [ ] **Step 4: Commit changes**

---

### Task 2: Update `FilePreview.tsx` to Use Blob URLs for Video/Audio & Stateful `MarkdownImage`

**Files:**
- Modify: `src/components/FilePreview.tsx`

- [ ] **Step 1: Convert base64 to `Blob` URL for `<video>` and `<audio>` players in `FilePreview.tsx` with unmount revocation**
- [ ] **Step 2: Create stateful `MarkdownImage` component in `FilePreview.tsx` that converts local image binary to `Blob` URL**
- [ ] **Step 3: Run `npm run test` and `npm run build`**
- [ ] **Step 4: Run `cargo test` in `src-tauri`**
- [ ] **Step 5: Commit changes**
