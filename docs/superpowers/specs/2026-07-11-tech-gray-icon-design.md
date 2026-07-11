# Black TDE Tech Gray Icon Design

## Context

Black TDE already uses Orca's restrained dark-neutral appearance: near-black backgrounds, graphite surfaces, neutral borders, light gray text, and limited blue interaction accents. The current neon cyan-purple brain icon conflicts with that system and loses clarity at small desktop-icon sizes.

## Design

Replace the current icon with a simple terminal aperture:

- A rounded-square graphite tile using `#0a0a0a` and `#171717`.
- A centered terminal chevron and underscore using `#a1a1a1` and `#e5e5e5`.
- One restrained `#737373` inset edge for separation on dark and light desktops.
- Flat geometric construction with no glow, gradient, text, brain motif, circuitry, or decorative detail.
- Generous internal padding and heavy strokes so the mark remains recognizable at 16-32 px.

The source will be a deterministic SVG. Tauri's existing icon command will generate the platform PNG, ICO, ICNS, Android, iOS, and Windows assets from that source. The frontend brand image will use the same generated mark.

## Scope

- Add one editable SVG source under `src-tauri/icons/`.
- Regenerate the existing Tauri icon set in place.
- Replace `src/assets/icon.png` with the matching 1024 px render.
- Keep the approved Orca-inspired application palette and layout unchanged.

## Verification

- Inspect the source and representative 1024 px, 128 px, 32 px, ICO, and ICNS outputs.
- Confirm the frontend brand image resolves to the new mark.
- Run the frontend build and Tauri configuration checks.
- Confirm only intended icon assets and the design documentation changed.
