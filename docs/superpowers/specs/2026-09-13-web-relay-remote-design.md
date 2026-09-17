# Design: TDE Web Relay Remote (Cloudflare)

**Date:** 2026-09-13  
**Status:** Approved for implementation (Approach A + MVP)  
**Scope:** Cloudflare Durable Object relay + browser client + desktop connector

---

## 1. Architecture

TDE remains the runtime. Agents, PTYs, files, and Git stay on the desktop. The Cloudflare Worker is a public meeting point only. The browser never talks to the LAN.

```text
Browser (any device)
    HTTPS  →  Worker Assets  (web UI)
    WSS    →  Worker auth    →  Room Durable Object

Desktop TDE
    outbound WSS ───────────→  same Room Durable Object
         │
         ├─ ProcessManager (write / Ctrl+C)
         ├─ event_bus stdout
         ├─ file_manager (list / read)
         └─ git_runner (status / diff)
```

**Room** is the coordination atom: one Durable Object per pairing (`getByName(roomId)`). Exactly one desktop socket, any number of browsers. If the desktop is offline, browsers can load the UI but RPCs fail with `desktop_offline`.

| Module | Interface | Hides |
| --- | --- | --- |
| **RelayProtocol** | JSON frames: `hello`, `rpc`, `stream`, `ping` | Encoding, method catalog, errors |
| **RelayRoom** | Attach desktop/browser, forward, revoke | Hibernation, token hash, presence |
| **DesktopRelayConnector** | `start` / `stop` / pairing URL / revoke | Outbound WS, reconnect, RPC dispatch |
| **WebRemoteApp** | Pair, list sessions, stream, prompt, files, Git | Transport and desktop details |

The **RelayProtocol** seam is transport-agnostic. Cloudflare is the first adapter. A later public-server adapter speaks the same frames.

Telegram/Lark stay untouched.

Repo layout:

```text
relay/                  Cloudflare Worker + Room DO + web client
src-tauri/src/relay/    Desktop connector
src/components/RemoteWebCard.tsx
docs/superpowers/specs/2026-09-13-web-relay-remote-design.md
```

Pairing URL: `https://<worker>/r/<roomId>#t=<token>`  
Token stays in the URL hash so the first page load does not send it to the Worker. The WebSocket authenticates with a `hello` frame.

---

## 2. Wire protocol

All frames are JSON text on the WebSocket.

```text
hello       { type, role: "desktop"|"browser", token }
hello_ok    { type, role, desktopOnline }
hello_err   { type, error }
rpc_req     { type, id, method, params }
rpc_res     { type, id, result }
rpc_err     { type, id, error, code? }
stream      { type, sessionId, dataB64 }
presence    { type, desktopOnline }
ping / pong
revoke
```

Room routing: unauthenticated sockets must send `hello` first. After that, desktop frames go to all browsers; browser frames go only to the desktop. `ping` is answered by the room. `revoke` from desktop clears the stored token hash and closes every socket.

The first successful desktop `hello` stores `sha256(token)` in the room. Browsers cannot create a room. A later desktop reconnect with the same token is accepted. A second desktop connection replaces the first.

### MVP RPC methods

| Method | Params | Result |
| --- | --- | --- |
| `list_workspaces` | `{}` | `{ workspaces: [{ id, name, path }] }` |
| `list_sessions` | `{ workspaceId? }` | `{ sessions: [{ id, name, agentType, cwd, status, workspaceId, workspaceName, running }] }` |
| `write_input` | `{ sessionId, text }` | `{}` — appends `\r` if missing |
| `send_control` | `{ sessionId, key }` | `{}` — `ctrl-c`, `tab`, `esc`, `enter`, `up`, `down`, `y`, `n` |
| `get_session_history` | `{ sessionId }` | `{ dataB64 }` — last 64 KiB |
| `list_files` | `{ path }` | `{ entries: [{ name, path, isDir, size }] }` |
| `read_file` | `{ path }` | `{ content, truncated, isBinary }` — max 200 KiB |
| `git_status` | `{ cwd }` | `{ branch, files: [{ path, status, staged }] }` |
| `git_diff` | `{ cwd, path }` | `{ diff }` |

File and Git paths must canonicalize under a known workspace root. Destructive file operations are not exposed.

---

## 3. Cloudflare Room

- SQLite-backed Durable Object (`new_sqlite_classes`), required on the Workers Free plan.
- WebSocket Hibernation API (`ctx.acceptWebSocket`), so idle rooms do not burn duration.
- Incoming terminal bytes are coalesced on the desktop (~80 ms or 8 KiB) before `stream` frames.
- Worker handles only `/ws/:roomId`. Static UI is Worker Assets with SPA fallback for `/r/:roomId`.
- Deploy: `cd relay && npm run deploy` after `npm run build:web`.
- Local: `cd relay && npm run dev` → `http://127.0.0.1:8787`.

Free-plan watch-outs: 100k requests/day (WS incoming billed 20:1), 13k GB-s/day. Hibernation and coalescing keep personal use inside the cap. Deploys drop sockets; both sides reconnect.

---

## 4. Desktop connector

`src-tauri/src/relay` opens an outbound WebSocket to `{ws}/ws/{roomId}`, sends `hello`, then:

- Subscribes at the same `event_bus` stdout fan-out used by the UI and Telegram.
- Dispatches RPC to `ProcessManager`, SQLite, `file_manager`, and `git_runner`.
- Reconnects with exponential backoff while enabled.
- Emits `web-relay-status` for the Settings card.

Settings → Remote Control shows a **Remote Web** card: relay URL (default `http://127.0.0.1:8787`), Start / Stop / Revoke, pairing URL, copy, and QR SVG generated locally (token never sent to a third-party QR API).

---

## 5. Web client

Touch-first dark UI matching TDE:

- Pair screen if the URL has no room/token; otherwise auto-connect.
- Bottom nav: Sessions, Files, Git, Settings.
- Sessions: list, live stream (ANSI-stripped text), prompt box, action strip (`Ctrl+C`, Enter, Y, N, Tab, Esc).
- Files: breadcrumb list + read-only preview.
- Git: status list + stacked diff.
- Settings: connection / desktop presence / disconnect.

---

## 6. Security

- HTTPS/WSS in production. Token only in URL hash and `hello`.
- Room stores `sha256(token)`, never the raw token.
- Desktop must pair first. Revoke clears the hash and disconnects everyone.
- No API keys, provider vault, or destructive file/Git writes on this surface.
- File/Git paths must stay under a workspace root.
- Relay is a dumb pipe. It does not run shells.

---

## 7. Errors, reconnect, testing

- Desktop drop → room broadcasts `presence { desktopOnline: false }`. Browser RPCs fail with `desktop_offline` until reconnect.
- Invalid token / revoked room → `hello_err` and socket close.
- RPC timeout on the browser: 20s.
- Tests: protocol authorize + pairing URL + control bytes (TS and Rust). Worker/room auth is unit-tested without wrangler. Desktop `cargo test` covers pairing URL and path allowlist.
