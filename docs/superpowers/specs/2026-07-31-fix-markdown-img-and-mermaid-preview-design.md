# Fix Markdown Image and Mermaid Graph Preview Design Spec

## Executive Summary
This spec outlines the design for resolving two issues in Markdown preview:
1. Local relative and absolute image links failing to load in Markdown preview (`ReactMarkdown`).
2. Mermaid diagram code blocks failing to render or throwing exceptions.

---

## 1. Problem Statement & Root Cause

### Issue 1: Markdown Images (`img`)
- **Problem**: Images specified in Markdown (e.g. `![alt](./images/photo.png)` or `![alt](/Users/ray/pic.jpg)`) failed to load.
- **Root Cause**: `ReactMarkdown` had no custom `img` component mapping. Relative paths resolved against `http://localhost:1420` instead of the Markdown file's directory path converted with Tauri's `convertFileSrc`.

### Issue 2: Mermaid Graphs (`graph`)
- **Problem**: Mermaid diagrams failed to render or threw runtime exceptions.
- **Root Cause**: `MermaidBlock.tsx` relied on `useId()` which generated IDs with colons, lacked syntax pre-validation with `mermaid.parse()`, and did not clean up temporary DOM elements created by `mermaid.render()`.

---

## 2. Solution Design

### A. Markdown Image Asset Resolution (`src/utils/htmlPreviewUtils.ts` & `src/components/FilePreview.tsx`)
- Implement `resolveMarkdownAssetUrl(src: string, filePath: string, convertFileSrcFn: (path: string) => string): string`.
- Normalize relative segments (`.`, `..`) relative to `filePath`'s parent directory.
- Use `convertFileSrcFn` for local relative and absolute file paths. Preserve external `http://`, `https://`, `data:`, `blob:` URLs.
- Provide custom `img` component in `ReactMarkdown` using `resolveMarkdownAssetUrl`.

### B. Robust Mermaid Diagram Rendering (`src/components/MermaidBlock.tsx`)
- Single global `mermaid.initialize` call with `securityLevel: 'loose'`, `theme: 'dark'`, `suppressErrorRendering: true`.
- Pre-validate syntax via `await mermaid.parse(source)`.
- Use clean DOM-safe container IDs and remove lingering temp elements in `finally`.
- Provide fallback error block on syntax failure.

---

## 3. Verification Strategy
- Add unit tests for `resolveMarkdownAssetUrl` in `tests/mediaAndHtmlPreview.test.ts`.
- Run `npm run test`, `npm run build`, `cargo test`.
