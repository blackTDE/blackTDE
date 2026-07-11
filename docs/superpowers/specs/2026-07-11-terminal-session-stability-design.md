# Terminal Session Stability and Full-Bleed Workbench Design

## Context

The current workbench still uses blue brand accents and nested framed surfaces. The active terminal cell has a blue border and header, while `TerminalPane` adds padding, a second border, rounded corners, and a fixed minimum height. File and diff views are also wrapped in padded card-like frames.

Two session bugs share the same lifecycle problem. Resuming a recorded Claude conversation always creates a new local session row, so one remote session can appear twice. Pane assignment also permits the same local session in multiple slots. When a session is selected again, xterm is remounted and the complete raw transcript, including old cursor-control sequences, is replayed at the new dimensions; the screenshot shows the resulting overlapping Claude UI. Manual `Ctrl+L` works because Claude redraws the active screen.

## Design

### Gray-Black Appearance

- Replace the blue `brand` palette with graphite `#525252` and light gray `#a1a1a1`.
- Use `#e5e5e5` for the terminal cursor and map ANSI blue to neutral gray.
- Remove remaining direct blue UI classes.
- Preserve red errors, amber warnings, and green success states because they communicate status.
- Remove active-pane glow and colored framing; selection uses only subtle neutral surface and border changes.

### Full-Bleed Middle Panel

- Remove padding from the center tab content area.
- Remove the terminal cell's outer radius, inset border, and blank gutter.
- Remove `TerminalPane` padding, border, radius, and fixed minimum height.
- Remove file-preview and diff outer radius, border, shadow, and fixed minimum body heights.
- Keep only functional toolbar/header separators. Terminal, file, and diff content fills all remaining width and height below the tab rows.

### One Local Window per Remote Session

- Change the resume selector to identify the existing local session row, not only its remote conversation ID.
- When the user chooses a recorded session, attach that existing local session and let its terminal resume it if needed; do not call `spawn_session` or insert another row.
- Deduplicate both the loaded project-session list and resume selector by workspace, agent, and remote session ID so legacy duplicate rows appear once. Prefer an active local row; otherwise keep the newest row returned by the database.
- Make `setPaneSessionId` clear the same local session from every other pane before assigning it. This store-level invariant covers sidebar selection, toolbar selection, manual attach, hidden panes, and future callers.

Existing duplicate database rows are left intact to avoid deleting transcripts without an explicit data-migration request. They stop multiplying and are collapsed in the resume selector.

### Stable Terminal Redraw

- Query whether the local session is active before deciding how to restore its screen.
- For an active session remount, skip raw transcript replay, fit and resize xterm, then send one form-feed byte (`Ctrl+L`) to the PTY so the running application redraws at current dimensions.
- For a terminated session, keep the existing resume path, reset the local xterm before starting the process, and request the same redraw after resume succeeds.
- Register the event listener before restoration so output produced during redraw or resume is not lost.
- Preserve queued output until the restore decision completes.

### Targeted Cleanup

- Move visible-pane count calculation into the workspace store module and reuse it from callers.
- Delete unused `src/components/EditorPane.tsx`.
- Do not refactor unrelated settings, provider, Git, or file-preview internals.

## Error Handling

- If active-session lookup fails, show the error in the console and fall back to transcript replay without spawning a duplicate process.
- If redraw input fails, keep the mounted terminal usable and log the failure.
- If resume fails, retain the existing visible terminal error message.
- Invalid pane indexes remain no-ops rather than corrupting pane state.

## Verification

- Unit-check pane assignment: assigning one session to a second pane removes it from the first.
- Unit-check loaded-session deduplication against two local rows sharing one remote ID.
- Confirm selecting a recorded session does not invoke `spawn_session` and does not create a new database row.
- Confirm switching away from and back to an active Claude session sends one redraw byte and does not replay transcript bytes.
- Build the frontend and run Rust tests.
- Render the workbench and verify no blue brand styles, no active blue terminal border, no inset terminal/file frame, and no blank middle-panel gutter.
