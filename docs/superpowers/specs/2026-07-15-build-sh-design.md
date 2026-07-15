# build.sh Design Specification

**Goal:** Create a `build.sh` script to compile the Tauri project for multiple architectures (Universal, Apple Silicon, Intel) on macOS, outputting the desktop packages to `build-dist/desktop/` and the static web frontend app to `build-dist/web/`. It also ensures `build-dist/` is ignored in `.gitignore`.

**Architectural Approach:**
1. **Requirements & Target Verification**: Ensure Node.js, npm, Rust, and Cargo are available. Verify or install `x86_64-apple-darwin` and `aarch64-apple-darwin` targets on macOS using `rustup`.
2. **Directory Management**: Safely clean and recreate `build-dist/` before each build.
3. **Frontend Compilation**: Build the Vite frontend static application and copy it to `build-dist/web/`.
4. **Desktop Compilation**: Compile Tauri desktop apps for macOS targets (`aarch64-apple-darwin`, `x86_64-apple-darwin`, `universal-apple-darwin`) and copy bundles to `build-dist/desktop/`.
5. **Git Ignorance**: Add `build-dist/` to `.gitignore` dynamically.

---

## Detailed Components

### 1. build.sh Execution Flow
- Check dependencies (`node`, `npm`, `rustc`, `cargo`).
- Ensure target architectures are installed:
  - `rustup target add aarch64-apple-darwin`
  - `rustup target add x86_64-apple-darwin`
- Run frontend build: `npm run build` (produces `dist/`).
- Create target directories:
  - `build-dist/`
  - `build-dist/web/`
  - `build-dist/desktop/`
- Copy `dist/*` to `build-dist/web/`.
- Build Tauri applications:
  - Compile Apple Silicon: `npm run tauri build -- --target aarch64-apple-darwin`
  - Compile Intel: `npm run tauri build -- --target x86_64-apple-darwin`
  - Compile Universal: `npm run tauri build -- --target universal-apple-darwin`
- Copy resulting desktop installers and bundles (e.g. `.dmg` and `.app`) to `build-dist/desktop/`.
- Add `build-dist/` to `.gitignore` if it isn't already present.

### 2. Output File Structure
```text
build-dist/
├── desktop/
│   ├── TDE.app  (universal or arch-specific)
│   ├── TDE_0.1.0_aarch64.dmg
│   ├── TDE_0.1.0_x64.dmg
│   └── TDE_0.1.0_universal.dmg
└── web/
    ├── index.html
    └── assets/
        ├── index-*.js
        └── index-*.css
```

---

## Testing & Verification
1. Run `./build.sh` and verify that the exit status is `0`.
2. Verify that `build-dist/desktop` contains `.dmg` and `.app` bundles for both architecture targets and the universal build.
3. Verify that `build-dist/web` contains the frontend static resources.
4. Verify that `.gitignore` contains the entry `build-dist/`.
