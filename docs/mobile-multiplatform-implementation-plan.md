# Black TDE — Multi-Platform Mobile Companion Implementation Plan

**Date:** 2026-09-13  
**Status:** Planning (ready to implement)  
**Builds on:** [`docs/remote-mobile-companion-plan.md`](./remote-mobile-companion-plan.md) (approved design)  
**Product context:** Desktop Tauri TDE today; mobile is PRD Phase 3 (Remote Control), excluded from MVP

---

## 0. Executive summary

Black TDE is a **local desktop** Terminal Development Environment (Tauri 2 + React + Rust PTY + SQLite). There is **no mobile runtime code yet**. Mobile should not reimplement agent/PTY/Git on the phone.

**Recommended product shape:** a **mobile companion** that controls the desktop TDE over LAN/Tailscale — not a standalone mobile IDE.

**Recommended delivery for iOS + Android:** ship a **React PWA** first (same stack as desktop UI), installable to Home Screen on both platforms. Optionally wrap with Capacitor later only if native APIs (push, camera QR, background keep-alive) become blockers.

This plan turns the approved companion design into concrete phases, API contracts, code reuse maps, and acceptance criteria.

---

## 1. Current codebase baseline

| Layer | What exists today | Mobile relevance |
| --- | --- | --- |
| Desktop shell | Tauri 2 (`src-tauri/`), bundle id `com.tde.app` | Host of companion server; must stay running |
| Frontend | Vite + React 18 + Zustand + xterm + Monaco (`src/`) | Reuse markdown/diff patterns; **do not** ship desktop chrome to mobile |
| Process/PTY | `process.rs`, `shell_session.rs`, `event_bus.rs` | WebSocket gateway wraps these |
| Files / Git | `file_manager.rs`, `git_runner.rs` | REST wrappers |
| Persistence | SQLite `tde.db` via `db.rs` + migrations | Session/workspace listing source of truth |
| Auth | None (local machine trust) | New: pairing token + Bearer |
| Mobile code | Icon assets under `src-tauri/icons/{ios,android}/` only | Design docs only |
| HTTP surface | Tauri IPC `invoke()` only | New Axum server required |

**Key constraint:** Agents, shells, and files live on the **desktop host**. The phone is a remote control surface.

---

## 2. Platform strategy (decision)

### Goal

One codebase that works on **iOS and Android** with acceptable UX for monitoring agents, sending prompts, browsing files, and reviewing Git.

### Options compared

| Approach | Pros | Cons | Fit for TDE |
| --- | --- | --- | --- |
| **A. React PWA** (recommended) | Same React/TS/xterm stack; no App Store required for LAN use; fast to ship; installable on both OS | Limited background/push; Safari PWA quirks; camera QR needs HTTPS or desktop-shown URL paste | **Best Phase 1–4** |
| **B. Capacitor/Ionic shell around PWA** | App Store distribution; native camera, push, haptics | Extra build/CI; still depends on desktop host | Phase 5 if needed |
| **C. React Native / Expo rewrite** | Native feel | Duplicates UI; hard to reuse xterm/Monaco patterns; higher cost | Overkill for companion |
| **D. Flutter rewrite** | Strong multi-platform | New stack; zero reuse of React UI | Reject for companion |
| **E. Full offline mobile TDE** | True standalone | Needs mobile PTY/agent runtime — not feasible / wrong product | Out of scope |

### Decision

1. **Phase 1–4:** Multi-platform via **installable PWA** served by the desktop companion server (and/or bundled static assets).
2. **Phase 5 (optional):** Capacitor wrapper for App Store + native push/QR if PWA limits block adoption.
3. **Non-goal:** Running Claude/Codex/etc. *on* the phone.

---

## 3. Target architecture

```
┌─────────────────────────────────────────────┐
│ Desktop Black TDE (must be running)         │
│  Zustand workspaces/sessions                │
│  portable-pty + tmux resume                 │
│  file_manager / git_runner / SQLite         │
│                                             │
│  ┌─ Embedded Companion Server (Axum) ─────┐ │
│  │  Auth (pairing token)                   │ │
│  │  REST  /api/*                           │ │
│  │  WS    /ws/terminal/:sessionId          │ │
│  │  Static mobile PWA assets               │ │
│  └─────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────┘
                       │ LAN / Tailscale only
                       ▼
┌─────────────────────────────────────────────┐
│ Phone (iOS Safari / Android Chrome)         │
│  TDE Mobile PWA                             │
│  Agents · Terminal · Files · Git · Settings │
└─────────────────────────────────────────────┘
```

**Default bind:** port `3840` (auto-increment if busy), interfaces: Wi‑Fi LAN and Tailscale preferred. No public cloud relay in v1.

---

## 4. Product scope for mobile v1

### In scope

1. Pair via QR (or paste URL) with short-lived Bearer token  
2. List workspaces and live sessions  
3. Stream terminal/agent output; send keystrokes / prompts  
4. Touch action strip: `Ctrl+C`, `Tab`, `Esc`, arrows, `Y`/`N`  
5. Browse file tree; read text/markdown (preview)  
6. View Git status + file diffs (read-oriented)  
7. Connection status + reconnect  

### Explicitly out of scope (v1)

- Creating new agent sessions from phone (desktop-only start)  
- File write/delete, Git commit/push (unless gated by desktop “allow writes” toggle in a later phase)  
- Provider/API key management  
- Skills install, SFTP, Monaco editing  
- Cloud accounts, multi-user, public internet exposure  

### Soft-gated (desktop toggle)

- PTY write (interactive control) — default **on** after pairing  
- Destructive file ops — default **off** until Phase 4+  

---

## 5. API contract (v1)

### Auth

- Pairing creates `token` (cryptographically random, hex/base64url).  
- REST: `Authorization: Bearer <token>`  
- WS: token via `Sec-WebSocket-Protocol` **or** first message / query `?token=` (pick one; prefer header-compatible approach for fetch + query for WS if needed).  
- Revoke invalidates token; reconnect requires new pair.

### REST

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/status` | version, uptime, paired device count, write_enabled |
| `GET` | `/api/workspaces` | open workspaces `{ id, name, path }` |
| `GET` | `/api/sessions` | sessions `{ id, name, agentType, cwd, status, workspaceId }` |
| `GET` | `/api/files/tree?workspaceId=&path=` | directory listing |
| `GET` | `/api/files/read?workspaceId=&path=` | text content + mime; reject/truncate binaries & huge files |
| `GET` | `/api/git/status?workspaceId=` | branch, changed files |
| `GET` | `/api/git/diff?workspaceId=&path=` | unified diff text |

### WebSocket `/ws/terminal/:sessionId`

Client → server:

```json
{ "type": "input", "data": "..." }
{ "type": "resize", "cols": 80, "rows": 24 }
{ "type": "ping" }
```

Server → client:

```json
{ "type": "output", "data": "<base64 or utf8 chunk>" }
{ "type": "status", "state": "running|exited" }
{ "type": "pong" }
{ "type": "error", "message": "..." }
```

On connect: optionally replay last N KB of transcript from SQLite/`get_session_history` equivalent.

---

## 6. Code reuse map

| Existing module | Companion use |
| --- | --- |
| `process.rs` write/resize/spawn | WS input + resize; **no new PTY stack** |
| `event_bus.rs` `tde-event` | Fan-out PTY bytes to WS subscribers |
| `file_manager.rs` | Power `/api/files/*` |
| `git_runner.rs` | Power `/api/git/*` |
| `db.rs` / sessions tables | `/api/sessions`, history replay |
| `src/components/*` | Patterns only — mobile gets new touch layouts under `src/mobile/` |
| Markdown/Mermaid deps | Reuse in mobile file preview |
| xterm | Lightweight mobile terminal view |

**Refactor recommendation before/during Phase 1:** extract shared Rust service functions from Tauri command handlers in `main.rs` so both `invoke` and HTTP handlers call the same core (avoid duplicating file/git logic).

---

## 7. Repository layout (proposed)

```
src-tauri/src/server/
  mod.rs              # lifecycle start/stop, bind, token
  auth.rs             # Bearer middleware
  routes/
    status.rs
    workspaces.rs
    sessions.rs
    files.rs
    git.rs
  ws_terminal.rs      # PTY bridge
  net.rs              # interface enumeration

src/mobile/
  MobileApp.tsx       # shell + bottom nav
  pages/
    SessionsPage.tsx
    TerminalPage.tsx
    FilesPage.tsx
    GitPage.tsx
    SettingsPage.tsx
  lib/
    api.ts            # REST client + token storage
    ws.ts             # reconnecting WebSocket
  components/
    ActionStrip.tsx
    ConnectionBadge.tsx

src/components/MobilePairingModal.tsx
public/mobile/manifest.json   # or served from companion static dir
```

Vite: either a second entry (`mobile.html`) or path-based route `/mobile/` detected at runtime when opened from companion URL.

---

## 8. Phased implementation

### Phase 0 — Prep (small)

- [ ] Extract shared Rust helpers used by Tauri commands (files, git, session list, history) into callable modules.  
- [ ] Document security threat model (LAN attacker, token leakage via screenshots).  
- [ ] Add feature flag / settings key `companion.enabled` in SQLite or settings store.

**Exit:** Desktop builds unchanged; helpers unit-testable without HTTP.

### Phase 1 — Companion server & protocol

- [ ] Add deps: `axum`, `tower-http`, `tower`, `futures`, `rand` / `uuid` for tokens (WebSockets via axum).  
- [ ] Implement `server/` lifecycle: start on demand, stop, port selection, interface list.  
- [ ] Auth middleware + `/api/status`.  
- [ ] `/api/workspaces`, `/api/sessions`.  
- [ ] `/api/files/tree`, `/api/files/read` (size limits).  
- [ ] `/api/git/status`, `/api/git/diff`.  
- [ ] `/ws/terminal/:sessionId` bridged to existing PTY + event bus.  
- [ ] Serve static mobile assets from the same listener.  
- [ ] Rust unit tests: auth reject/accept, path traversal rejection on file read.

**Exit:** `curl` + `websocat` can list sessions and stream a live PTY against a running desktop build.

### Phase 2 — Desktop pairing UI

- [ ] Tauri commands: `start_companion_server`, `stop_companion_server`, `get_companion_status`, `get_companion_network_interfaces`, `revoke_companion_token`.  
- [ ] `MobilePairingModal.tsx`: QR (`qrcode.react`), interface picker (prefer Tailscale), server toggle, connected/revoke list.  
- [ ] Header “Mobile Remote” entry point.  
- [ ] Copy-link fallback for devices that cannot scan QR on HTTP LAN.

**Exit:** User can enable server and open the companion URL on a phone browser.

### Phase 3 — Mobile PWA shell (iOS + Android)

- [ ] `src/mobile/MobileApp.tsx` with bottom nav: Agents, Files, Git, Settings.  
- [ ] Token bootstrap from `?token=` → `sessionStorage` / `localStorage`.  
- [ ] Sessions list → terminal/agent view with ActionStrip.  
- [ ] Files tree + text/markdown preview.  
- [ ] Git status + stacked diff viewer.  
- [ ] `manifest.json`, theme-color, apple-mobile-web-app meta, icons (reuse `src-tauri/icons`).  
- [ ] Touch targets ≥ 44px; safe-area insets; no desktop sidebar chrome.

**Exit:** Install to Home Screen on one iOS and one Android device; control a live agent session over Tailscale or LAN.

### Phase 4 — Resilience & UX polish

- [ ] WS reconnect with exponential backoff + transcript catch-up.  
- [ ] Offline/disconnected empty states.  
- [ ] Optional Web Notification when session exits / agent idle (desktop-permission dependent).  
- [ ] Voice dictation via Web Speech API where available (Android Chrome first).  
- [ ] Mobile viewport e2e tests (Playwright device emulation).  
- [ ] Rate-limit PTY input; max concurrent WS clients.

**Exit:** Survives Wi‑Fi blips; usable one-handed for monitoring + quick replies.

### Phase 5 — Optional native shell (only if needed)

- [ ] Capacitor project wrapping the same mobile web build.  
- [ ] Native camera QR scanner, FCM/APNs push relayed from desktop (requires always-on companion or later cloud relay — evaluate carefully).  
- [ ] App Store / Play distribution packaging.

**Trigger:** PWA cannot meet push or store-distribution requirements from real users.

---

## 9. Security requirements (non-negotiable)

1. Companion server **off by default**.  
2. Bind only to user-selected interface(s); never “0.0.0.0 public” without explicit advanced opt-in.  
3. All API/WS require valid token; rotate on revoke/restart policy (document whether restart invalidates).  
4. File paths must resolve under workspace root (no `../` escape).  
5. Do not expose provider API keys over companion API.  
6. Treat screenshots of QR as credential leakage; short pairing window optional enhancement.  
7. README safety section updated: companion expands the trust boundary to anyone on the chosen network who obtains the token.

---

## 10. Testing strategy

| Layer | What |
| --- | --- |
| Rust unit | Auth, path sandbox, route JSON shapes |
| Rust integration | Spin Axum with mock session registry; WS round-trip |
| Frontend unit | `api.ts` / `ws.ts` reconnect logic (`tests/`) |
| Manual | iOS Safari + Android Chrome against Tailscale IP |
| Later e2e | Playwright mobile viewport against mock server |

---

## 11. Build & DX impact

- Desktop: `npm run tauri dev` starts UI; companion starts only via UI/command.  
- Mobile assets: built as part of Vite production build (or separate `vite.mobile.config.ts` if bundle size of Monaco hurts — **exclude Monaco from mobile entry**).  
- `build.sh`: no change required initially; ensure mobile assets land in Tauri `frontendDist`.  
- New npm deps: `qrcode.react` (desktop); mobile may add lightweight syntax highlighter if Monaco is excluded.  
- New Cargo deps: `axum`, `tower-http`, etc.

---

## 12. Success metrics

- Pair → first terminal bytes visible in **&lt; 10s** on same LAN.  
- Action strip `Ctrl+C` interrupts a running command.  
- File read of README.md and Git diff of a dirty file works on phone.  
- No desktop regression: existing Tauri flows and tests still pass.  
- Works on both **iOS and Android** browsers without platform-specific forks (CSS/safe-area only).

---

## 13. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| HTTP on LAN blocked from camera QR / some APIs | Prefer Tailscale; HTTPS later via local cert or reverse proxy; always offer copy-paste URL |
| PTY fan-out races with desktop UI | Single event bus; WS subscribers are additional consumers of same stream |
| Large binary/file DoS | Hard size caps; deny binary for v1 read API |
| Token in QR screenshot | Revoke button; optional TTL; regenerate token |
| Mobile bundle pulls Monaco | Separate Vite entry without Monaco |
| Scope creep into full mobile IDE | Enforce out-of-scope list; companion-only positioning |

---

## 14. Suggested implementation order (first PR series)

1. **PR-A:** Extract shared Rust file/git/session helpers + companion feature flag.  
2. **PR-B:** Axum server skeleton + auth + status/workspaces/sessions.  
3. **PR-C:** Files + Git REST + path sandbox tests.  
4. **PR-D:** WebSocket PTY bridge.  
5. **PR-E:** Desktop pairing modal + QR.  
6. **PR-F:** Mobile PWA shell + sessions/terminal.  
7. **PR-G:** Mobile files/git + manifest.  
8. **PR-H:** Reconnect, notifications polish, Playwright smoke.

Each PR should keep desktop shippable.

---

## 15. Relationship to existing docs

| Doc | Role after this plan |
| --- | --- |
| `docs/remote-mobile-companion-plan.md` | Canonical **product/architecture** design (keep) |
| `docs/superpowers/plans/2026-09-02-remote-mobile-companion-plan.md` | Duplicate of design; treat as historical |
| **This doc** | Canonical **implementation** plan: platform choice, API, phases, reuse, PR sequence |
| `docs/prd-v1.md` §5.10 / Phase 3 | Product roadmap alignment |

When implementation starts, checkboxes in §8 of this doc are the source of truth for progress.
