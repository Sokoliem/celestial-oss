# Changelog

## 0.1.0-preview.2

### Minor Changes

- eca0f94: Add typed pointer-shape projection and harden resize interactions across windows,
  split panes, and data-table columns. Resize state now handles directional
  cursors, pointer capture, cancellation, keyboard parity, invalid inputs,
  constraints, persistence boundaries, and accessible separator metadata through
  framework-owned APIs.

### Patch Changes

- 5a8168a: Enforce deterministic pointer feedback for actionable regions. Nebula now
  infers managed or calm, contrast-preserving text-cell hover contracts,
  preserves terminal-native style effects through shaders and snapshots, and
  audits every actionable non-spatial surface for visible hover behavior.

  Harden semantic hover faces for virtual lists, assisted inputs, range sliders,
  and popovers; repair context-menu token overrides for contrast; route Gravity
  splitters through the canonical event builder; and reserve minimized-window
  shelf rows through framework-owned shell and bounds helpers.

- 062aeae: Harden terminal capability lifecycles, animation and responsive-layout boundaries, input protocols, direct runtime dispatch, mouse and clipboard fallbacks, beta window management, and the deterministic headless/PTY testing surface for the focused preview.
- Updated dependencies [a723fb0]
- Updated dependencies [48dd7fd]
- Updated dependencies [3d47bc5]
- Updated dependencies [5a8168a]
- Updated dependencies [5a8168a]
- Updated dependencies [5a8168a]
- Updated dependencies [9407abc]
- Updated dependencies [eca0f94]
- Updated dependencies
- Updated dependencies [8914391]
- Updated dependencies [2776d8b]
- Updated dependencies [aea524d]
- Updated dependencies [9407abc]
- Updated dependencies [062aeae]
  - @celestial/corona@0.1.0-preview.2
  - @celestial/nebula@0.1.0-preview.2
  - @celestial/atlas@0.1.0-preview.2
  - @celestial/aurora@0.1.0-preview.2

All notable changes to `@celestial/nexus` are documented here.

## Unreleased — cross-platform parity release

Design receipts for this release live in the donor ledger
([`scripts/donor-imports.json`](../../scripts/donor-imports.json)) and the
package's public API documentation below.

### Added

- **`writeClipboard(text, opts?)` / `readClipboard(opts?)`** — parallel OSC 52 + native shell-out (PRD G1). SSH-aware: skips native on remote sessions. Structured `ClipboardResult` with `source` and `nativeTool` fields. DI seam via `SpawnFn` + `ProcessEnvProbe` so tests can stub the shell-out without mocking `node:child_process`.
- **`@celestial/nexus/native` subpath** — Node-only IO. Contains `writeClipboard` / `readClipboard` shell-out helpers, `openUrl`, `isSshSession`, `detectClipboardTools`. Browser / rift consumers should not import this subpath.
- **`openUrl(url, opts?)`** under `./native` — `open` (darwin) / `cmd /c start ""` (win32) / `xdg-open` (linux) / `wslview` (WSL). URL is `new URL(url)`-validated before spawn and passed as an argv element, never via shell (PRD G11, §13).
- **`terminalFocusEnable` / `terminalFocusDisable` / `parseTerminalFocusEvent`** — DEC 1004 terminal-focus reporting (PRD G2). Distinct from `deriveFocusEvents` (which models UI focus-stack lifecycle).
- **Kitty keyboard protocol** (PRD G3): `kittyKeyboardEnable(flags?)`, `kittyKeyboardDisable`, `kittyKeyboardReset`, `parseKittyKeyboardEvent`, `withKittyKeyboard(caps, flags?)`.
- **`enableMouseTracking(opts?)` / `disableMouseTracking(opts?)`** (PRD G5) with `motion`, `pixelPrecision`, `focusEvents`, `sgrEncoding` options. The legacy `mouseEnable` / `mouseDisable` constants remain exported and byte-identical to `enableMouseTracking({motion:'button'})`.
- **Mouse fallback parsers** (PRD G4): `parseUrxvt1015MouseEvent`, `parseX10MouseEvent`. `parseMouseEvent` now chains SGR → urxvt → X10.
- **`parseSgrPixelMouseEvent`** — DEC 1016 sub-cell precision mouse parser.
- **`syncOutputBegin` / `syncOutputEnd` / `withSyncOutput(caps, frame)`** — DEC 2026 synchronized output (PRD G7).
- **`setCursorShape(shape, blinking?)` / `cursorShow` / `cursorHide`** — DECSCUSR (PRD G8).
- **`setWindowTitle` / `setIconAndTitle` / `setTabColor`** — OSC 0 / OSC 2 / OSC 6 / OSC 30 (PRD G9). Titles strip `\x1b` / `\x07` / `\x9c` before emit.
- **`bell(opts?)`** — terminal bell (PRD G10).
- **`parseTerminalFileDrop`** (PRD G12) — iTerm2 / kitty / WezTerm / generic absolute-path-paste forms.
- Test fixtures at `src/__tests__/__fixtures__/platform-injection.ts` (`makeProbe`, `makeSpawn`, `makeToolProbe`, `makeSshProbe`) for DI-driven cross-platform clipboard / openUrl tests.

### Changed

- **`MouseEvent.button`** widened to `0 | 1 | 2 | 3 | 4 | 'none'`. New button values: `3` (X1 / back) and `4` (X2 / forward).
- **`MouseEvent.type`** widened to include `'scroll-left'` and `'scroll-right'` (DEC 1006 buttons 66 / 67).
- **`MouseEvent`** now carries an `encoding` field (`'sgr' | 'urxvt' | 'x10'`) reporting which decoder won.

  ⚠️ _Strict-mode TS consumers with exhaustive `switch (ev.type) { ... }` / `switch (ev.button) { ... }` will need new cases. The widened union surfaces previously-dropped events._

- `osc52Write` and the rest of the OSC-52-only family remain unchanged. They are now described in the README as the "low-level" path.

### Migration

In-source clipboard duplication eliminated:

- `apps/claude-wrapper/src/native-clipboard.ts` deleted.
- `apps/solaris/src/reducers/selection.ts:copyToClipboardNative` rewritten to call `writeClipboard`.
- `apps/genesis/src/runtime/diagnostics-runtime.ts:copyTextToClipboard` rewritten to delegate to `writeClipboard`; `apps/genesis/src/app.ts:1469` surfaces the structured error.

External callers should replace any custom OSC-52-only fallback with `writeClipboard` from this package. The old `osc52Write` is still exported for callers that need only OSC 52.
