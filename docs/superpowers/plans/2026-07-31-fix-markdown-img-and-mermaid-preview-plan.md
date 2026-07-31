# Fix Markdown Image and Mermaid Graph Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix image loading and Mermaid graph rendering in Markdown previews.

---

### Task 1: Add `resolveMarkdownAssetUrl` to `src/utils/htmlPreviewUtils.ts` & Add Tests

**Files:**
- Modify: `src/utils/htmlPreviewUtils.ts`
- Modify: `tests/mediaAndHtmlPreview.test.ts`

- [ ] **Step 1: Implement `resolveMarkdownAssetUrl`**
- [ ] **Step 2: Add unit tests for relative, absolute, and external image path resolution**
- [ ] **Step 3: Run `npm run test`**
- [ ] **Step 4: Commit changes**

---

### Task 2: Update `FilePreview.tsx` and `MermaidBlock.tsx`

**Files:**
- Modify: `src/components/FilePreview.tsx`
- Modify: `src/components/MermaidBlock.tsx`

- [ ] **Step 1: Add `img` component to `ReactMarkdown` in `FilePreview.tsx` using `resolveMarkdownAssetUrl`**
- [ ] **Step 2: Update `MermaidBlock.tsx` with syntax pre-validation, clean IDs, and DOM cleanup**
- [ ] **Step 3: Run `npm run test` and `npm run build`**
- [ ] **Step 4: Run `cargo test` in `src-tauri`**
- [ ] **Step 5: Commit changes**
