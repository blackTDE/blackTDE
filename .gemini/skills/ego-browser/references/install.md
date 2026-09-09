# Installing ego-lite for Antigravity CLI

`ego-browser` is powered by the `ego lite` macOS application. When `ego lite` is installed, it registers the `ego-browser` binary on your system PATH (`~/.local/bin/ego-browser`).

Website: [https://lite.ego.app/](https://lite.ego.app/)

---

## 1. Automated Installation on macOS

Run the install script bundled in this skill:

```bash
sh .gemini/skills/ego-browser/scripts/install.sh
```

Or from your global skills directory:

```bash
sh ~/.gemini/skills/ego-browser/scripts/install.sh
```

The script will:
1. Detect architecture (`arm64` Apple Silicon or `x64` Intel).
2. Download the official `ego lite` DMG package.
3. Install `ego lite.app` to `/Applications` (or `~/Applications`).
4. Strip the Apple quarantine attribute (`xattr -dr com.apple.quarantine`) to prevent Gatekeeper warnings.
5. Launch `ego lite.app` for initial onboarding.

---

## 2. Completing Onboarding

When `ego lite` opens for the first time:
1. It prompts whether to import existing Chrome cookies, sessions, and bookmarks.
2. Select **Yes** so your Antigravity CLI agents automatically inherit your login state.
3. Onboarding links `ego-browser` into `~/.local/bin/ego-browser`.

---

## 3. Verifying the Installation

Check if the command is accessible:

```bash
command -v ego-browser
```

If not found, ensure `~/.local/bin` is in your PATH:

```bash
export PATH="$HOME/.local/bin:$PATH"
command -v ego-browser
```

Test with a minimal healthcheck command:

```bash
ego-browser nodejs <<'EOF'
cliLog('ego-browser ready');
EOF
```
