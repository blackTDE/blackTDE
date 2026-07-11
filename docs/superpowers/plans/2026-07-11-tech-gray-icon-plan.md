# Tech Gray Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Black TDE's neon brain icon with the approved flat graphite terminal-aperture mark across the frontend and every Tauri bundle target.

**Architecture:** Keep one deterministic SVG source under Tauri's icon directory. Use the already-installed Tauri CLI to render every platform asset, then reuse its 1024 px PNG in the frontend so all surfaces share the same mark.

**Tech Stack:** SVG, Tauri CLI 2, Vite

## Global Constraints

- Use only `#0a0a0a`, `#171717`, `#737373`, `#a1a1a1`, and `#e5e5e5`.
- Use flat geometry with no glow, gradient, text, brain motif, circuitry, or decorative detail.
- Preserve the approved Orca-inspired application palette and layout.
- Add no dependencies.

---

### Task 1: Create and distribute the terminal-aperture icon

**Files:**
- Create: `src-tauri/icons/black-tde.svg`
- Modify: `src-tauri/icons/*` generated platform icon assets
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src/assets/icon.png`

**Interfaces:**
- Consumes: Tauri CLI's square SVG icon input.
- Produces: the platform bundle icon set and the frontend `brandIcon` image already imported by `src/App.tsx`.

- [x] **Step 1: Add the deterministic SVG source**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect x="96" y="96" width="832" height="832" rx="184" fill="#171717" stroke="#737373" stroke-width="24"/>
  <rect x="128" y="128" width="768" height="768" rx="152" fill="none" stroke="#0a0a0a" stroke-width="16"/>
  <path d="M330 344 498 512 330 680" fill="none" stroke="#a1a1a1" stroke-width="88" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M548 680H724" fill="none" stroke="#e5e5e5" stroke-width="88" stroke-linecap="round"/>
</svg>
```

- [x] **Step 2: Generate all platform icons**

Run: `npm run tauri -- icon src-tauri/icons/black-tde.svg`

Expected: command exits successfully and rewrites the PNG, ICO, ICNS, Android, iOS, and Windows icon assets under `src-tauri/icons/`.

- [x] **Step 3: Declare the desktop bundle icons**

Add `bundle.icon` entries for `icons/32x32.png`, `icons/128x128.png`, `icons/128x128@2x.png`, `icons/icon.icns`, and `icons/icon.ico` in `src-tauri/tauri.conf.json`.

Expected: Tauri copies the platform icon into generated desktop bundles instead of using the empty default icon list.

- [x] **Step 4: Reuse the generated 1024 px icon in the frontend**

Run: `cp src-tauri/icons/ios/AppIcon-512@2x.png src/assets/icon.png`

Expected: `src/assets/icon.png` is a 1024 x 1024 image matching the generated Tauri mark.

- [x] **Step 5: Inspect representative outputs**

Run: `file src/assets/icon.png src-tauri/icons/32x32.png src-tauri/icons/128x128.png src-tauri/icons/icon.ico src-tauri/icons/icon.icns`

Expected: valid 1024 px, 32 px, and 128 px PNGs plus valid ICO and ICNS files. Visually inspect `src/assets/icon.png`, `src-tauri/icons/128x128.png`, and `src-tauri/icons/32x32.png`; the terminal mark must remain recognizable without clipped strokes.

- [x] **Step 6: Verify the application build and diff**

Run: `npm run build`

Expected: TypeScript and Vite build successfully.

Run: `npm run tauri -- build --debug --bundles app`

Expected: Tauri builds `TDE.app` with `Contents/Resources/icon.icns` present.

Run: `git diff --check`

Expected: no whitespace errors.

- [x] **Step 7: Commit the generated icon set**

```bash
git add docs/superpowers/plans/2026-07-11-tech-gray-icon-plan.md src/assets/icon.png src-tauri/icons src-tauri/tauri.conf.json
git commit -m "Redesign Black TDE app icon"
```
