# @celestial/ui

## 0.1.0-preview.2

### Minor Changes

- Rework the AI & CLI primitives to the component contract: `toolCall` is now a full component descriptor with typed messages, deterministic ids, theme-token contracts, and a focus-gated keyboard toggle; `diffViewer` ships a state-accurate unified-diff parser (hunk-aware headers, `\ No newline` handling, metadata/binary safety, combined-diff preservation) with theme tokens and width-aware chrome; `inlinePrompt` is rebuilt as Elm apps in inline mode with `PromptCancelledError`, validation, grapheme-safe editing, and non-TTY fallbacks.
- 9407abc: Add a cell-accurate status bar for application shells and extend the command spine's canonical `helpView` with category grouping and cell-safe wrapping. Action categories now flow into executable bindings and generated help without introducing a second shortcut registry, while measured text rejects terminal controls that would corrupt painted geometry.
- a723fb0: Expand the focused public preview with Unicode-safe text handling, resize-resilient surfaces, 46 curated UI builders, schema-driven workflows with a package-neutral event-ledger contract, syntax highlighting, accessible effects and transitions, terminal charts, and Markdown rendering.
- 48dd7fd: Add the command spine: `keyboard` and `actions`.

  `keyboard` provides declarative key bindings — `KeyBinding`, `matchesKeyBinding`, `getMatchingKeyBinding`, `keyMap` for exact first-active dispatch, and `helpView` for a generated help screen. It canonicalizes named-key aliases and printable keys, routes Tab before built-in focus traversal, hides inactive or undiscoverable entries by default, and rejects keys or modifier combinations the terminal cannot emit exactly. Key maps reconcile after raw key-event handlers, so a dismissal or mode change updates the active shortcut for the same event.

  `actions` projects a Nebula `ActionRegistry` onto UI surfaces: `actionCommands` derives command-palette entries and `actionKeyBindings` derives key bindings from the same registered actions, so a palette entry and its shortcut cannot disagree. `formatActionShortcut` and `formatDisplayKey` render shortcuts consistently wherever they appear.

  Both count key labels in graphemes rather than UTF-16 code units. The help screen aligns its key column on measured display width and refuses to advertise multi-scalar or control-key declarations that the runtime cannot bind.

  `unbindableActionShortcuts` statically reports shortcuts that `actionKeyBindings` cannot express, including malformed syntax, collisions, decoder-limited modifier combinations, and multi-chord sequences that need Nebula's stateful keybinding engine. Disabled palette commands are now semantically inert for both keyboard and pointer selection rather than relying on a label suffix alone.

  Nebula accessibility semantics now represent disabled controls explicitly. Disabled commands remain visible to automation and accessibility consumers, but are excluded from actionable snapshots and remain subject to accessible-label audits.

  The curated preview suite and packed-package smoke checks cover these public helpers and semantics.

  These are helpers rather than component builders, so the curated 46-builder count is unchanged.

- 3d47bc5: Infer baseline pointer metadata from event handlers and harden the shared
  Celestial interaction contract. Disabled option-list rows are skipped by
  keyboard and wheel navigation, host callbacks are isolated consistently,
  textareas support independent wheel scrolling, and calendar cells, segmented
  options, and tag chips expose token-driven hover lifecycles.
- eca0f94: Add typed pointer-shape projection and harden resize interactions across windows,
  split panes, and data-table columns. Resize state now handles directional
  cursors, pointer capture, cancellation, keyboard parity, invalid inputs,
  constraints, persistence boundaries, and accessible separator metadata through
  framework-owned APIs.
- 9407abc: Add a headless application-shell coordinator that projects one action registry
  into command, shortcut, and help surfaces; composes the canonical notification
  store across inbox and toast projections; centralizes modal dismissal; and
  returns immutable action, confirmation, and task receipts for the host to run.
- 8089aaa: Export the uniform-windowing kernel from `@celestial/ui`. `createVirtualScrollState`, `getVisibleRange`, `virtualScrollUpdate`, `scrollToIndex` and their types were implemented, input-guarded and unit-tested, but never re-exported from the barrel, so no consumer could reach them. These are helpers rather than component builders, so the curated 46-builder count is unchanged.

  Fix a process-lifetime retention leak in `@celestial/gravity`'s scroll controller. Every controller created by `createScrollController` was appended to a module-level registry with no removal path, so a long-running app that builds lists dynamically retained one controller — and its measure cache — per list, forever. The registry is now a `Set`, and the new `disposeScrollController(controller)` removes an entry and releases its cache. Disposing twice is a no-op.

  Fix a silently collapsed scroll extent in `@celestial/gravity`'s virtual list. When the visible window was empty (`endIndex === 0`, reachable with a zero-height viewport and no overscan on the variable-size path), the below-spacer read `offsets[-1]`/`sizes[-1]` behind non-null assertions and evaluated to `NaN`. Because `NaN > 0` is false the spacer was dropped rather than rendered wrong, so the list reported zero scroll extent instead of the full content height.

- 9407abc: Add semantic elevation-border resolution and framework-owned presentation primitives for themed roots, text roles, controls, interactive rows, and framed surfaces.

  Add the controlled App Shell view adapter with canonical palette, help, confirmation, notification-center, and actionable toast surfaces. Pointer, wheel, keyboard, disabled, selected, focus-ownership, and accessibility behavior now route through the same headless shell model.

  Horizon raised panes and floating window chrome now derive their frame family from the active theme while preserving explicit border overrides.

- 9407abc: Unify transient toasts and persistent inbox notifications behind one validated,
  immutable store so the two surfaces cannot drift. Invalid input now returns
  explicit diagnostics, toast expiry preserves inbox history, and deduplication
  retains stable IDs. A controlled notification-center helper adds measured
  variable-height rows, action receipts, focus-scoped mouse and keyboard parity,
  and explicit Escape ownership without introducing a second notification list
  or weakening the public uniform-scroll contract.
- 5a8168a: Add persistent `scrollbar()` and keyed fixed-row `virtualList()` builders to the
  public UI package. Both surfaces share tokenized hover, focus, active, disabled,
  wheel, pointer, and keyboard behavior; isolate consumer callbacks; and expose
  controlled geometry messages for hosts that resize or replace data.

  The virtual list preserves selection and focus by stable key, keeps disabled rows
  inert, handles append-at-bottom receipts, and renders only the exact visible
  window. The scrollbar adds proportional thumbs, track paging, pointer drag with
  global release and Escape rollback, and accessible slider metadata.

### Patch Changes

- 5a8168a: Enforce deterministic pointer feedback for actionable regions. Nebula now
  infers managed or calm, contrast-preserving text-cell hover contracts,
  preserves terminal-native style effects through shaders and snapshots, and
  audits every actionable non-spatial surface for visible hover behavior.

  Harden semantic hover faces for virtual lists, assisted inputs, range sliders,
  and popovers; repair context-menu token overrides for contrast; route Gravity
  splitters through the canonical event builder; and reserve minimized-window
  shelf rows through framework-owned shell and bounds helpers.

- 5a8168a: Add a deterministic runtime interaction audit that validates rendered mouse
  regions against their labels, handlers, affordances, cursors, disabled state,
  IDs, and final painted contrast. Automation snapshots now reuse their exact
  layout plan and cell grid for this audit.

  Harden autocomplete, pagination, sortable table headers, option-list selection,
  color swatches, resize handles, and scrollbar colors so their tokenized visual
  and interaction contracts remain consistent across themes.

- 5a8168a: Add explicit keyboard-focus ownership to Nebula overlays and portals. Active
  and modal layers now exclude obscured focus targets deterministically, passive
  layers cannot steal Tab navigation, and blocking layers prevent focus from
  leaking through a non-focusable modal.

  Make Horizon managed windows declare that policy automatically from normalized
  window focus, modal state, workspace visibility, and lifecycle state. Update
  PiP surfaces, context menus, toasts, application-shell layers, and the Flight
  Deck to exercise the same framework contract.

- 9407abc: Make windowed lists respond consistently to the terminal scroll wheel across Select, Command Palette, Autocomplete, Combobox, Multi-select, Option List, and Data Table. Keep pointer hover and keyboard navigation on the same highlighted-row model, ignore zero-delta pointer events, and use text-safe tokens for Number Input and Segmented Control chrome.

  Resolve Horizon panel and scrollable-pane tokens from live theme contexts, and make Orbit read the current reactive theme rather than an obsolete context shape.

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
- Updated dependencies [8089aaa]
- Updated dependencies [9407abc]
- Updated dependencies [062aeae]
  - @celestial/corona@0.1.0-preview.2
  - @celestial/nebula@0.1.0-preview.2
  - @celestial/rosetta@0.1.0-preview.2
  - @celestial/core@0.1.0-preview.2
  - @celestial/gravity@0.1.0-preview.2
