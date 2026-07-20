# Changelog

All notable changes to `@celestial/nexus` are documented here.

## Unreleased — cross-platform parity release

See [`docs/specs/2026-05-12-nexus-cross-platform-parity-prd.md`](../../docs/specs/2026-05-12-nexus-cross-platform-parity-prd.md) for full design.

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

  ⚠️  *Strict-mode TS consumers with exhaustive `switch (ev.type) { ... }` / `switch (ev.button) { ... }` will need new cases. The widened union surfaces previously-dropped events.*
- `osc52Write` and the rest of the OSC-52-only family remain unchanged. They are now described in the README as the "low-level" path.

### Migration

In-source clipboard duplication eliminated:
- `apps/claude-wrapper/src/native-clipboard.ts` deleted.
- `apps/solaris/src/reducers/selection.ts:copyToClipboardNative` rewritten to call `writeClipboard`.
- `apps/genesis/src/runtime/diagnostics-runtime.ts:copyTextToClipboard` rewritten to delegate to `writeClipboard`; `apps/genesis/src/app.ts:1469` surfaces the structured error.

External callers should replace any custom OSC-52-only fallback with `writeClipboard` from this package. The old `osc52Write` is still exported for callers that need only OSC 52.
