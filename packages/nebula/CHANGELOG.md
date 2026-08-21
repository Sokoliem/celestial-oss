# @celestial/nebula

## 0.1.0-preview.2

### Minor Changes

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

- 9407abc: Add platform-neutral configuration loading with explicit source precedence. Applications provide ordered read adapters plus parse and validation adapters, so filesystem, environment, browser, and test sources remain caller-owned instead of implying Node-only access in the runtime.

  The loader stops at the first present source and returns stage-specific diagnostics for read, parse, validation, and optional per-stage timeout failures. A malformed high-priority config can no longer disappear behind a lower-priority source or a fabricated default, and an all-missing search is an explicit not-found result.

  Successful values are detached into deeply frozen plain-data snapshots, while invalid adapter shapes, unsafe diagnostic text, sparse inputs, and stateful validator values fail closed.

- eca0f94: Add typed pointer-shape projection and harden resize interactions across windows,
  split panes, and data-table columns. Resize state now handles directional
  cursors, pointer capture, cancellation, keyboard parity, invalid inputs,
  constraints, persistence boundaries, and accessible separator metadata through
  framework-owned APIs.
- Add a TSX/JSX layer with deterministic event ids, an honest intrinsic map, and automatic-transform runtimes (`./jsx`, `./jsx-runtime`, `./jsx-dev-runtime`) on both `@celestial/nebula` and `@celestial/core`; add the plugin-wired DevTools inspector (F12/Ctrl+D) with `AppHandle.getLayoutPlan()`/`getHitRegions()`; add `createStore`; make `Cmd.throttle` a true leading-edge throttle and document `Cmd.async`.
- 8914391: Make caught render errors observable instead of silent. The runtime still keeps an app running after an error thrown from update, view, subscriptions, or a lifecycle hook, but it now writes the message and stack to stderr when no `onRenderError` handler is supplied — previously the only trace was a single truncated terminal row that the next repaint erased. Opt out with the new `AppOptions.renderErrorReporting: 'silent'`.

  `createTestApp` now forwards `onRenderError`, exposes `handle.renderErrors()` / `handle.clearRenderErrors()`, and by default fails the test when the runtime catches an error. Previously the harness supplied no handler at all, so every test silently tolerated a broken update or view and could only fail if an assertion happened to cover the affected text. Pass `renderErrors: 'collect'` for tests that drive a failure on purpose.

  Add `PtyHarness.mark()` and `waitForText(match, { since })`. `waitForText` scans the whole accumulated transcript, so waiting on a string the program has already printed resolved immediately and synchronised nothing; marking first makes the wait mean "a new occurrence", which removes the need for unanchored sleeps in scenario tests.

- aea524d: Export the state-persistence serializers from `@celestial/nebula`. `serializeForStorage`, `deserializeFromStorage`, `migrateData`, `PersistenceConfig`, and `PersistedData` were implemented and unit-tested but never re-exported from the package barrel, so no consumer could reach them.

  Report a corrupt stored payload instead of silently discarding it. `deserializeFromStorage` still returns the fresh model so a damaged save cannot crash an app, but it now writes to stderr — previously a corrupt or truncated payload was indistinguishable from "nothing was ever saved", and a user whose state was thrown away had no signal. This matches the reporting the sibling version-skew branch already did.

  Remove the `storagePath` field from `PersistenceConfig` and `HorizonPersistenceConfig`. It was declared in both packages and read by no code, implying a filesystem capability neither module has: storage is caller-owned by design, and these helpers only convert a model to and from a string. Callers that were setting it can drop it — nothing behaved differently.

- 062aeae: Harden terminal capability lifecycles, animation and responsive-layout boundaries, input protocols, direct runtime dispatch, mouse and clipboard fallbacks, beta window management, and the deterministic headless/PTY testing surface for the focused preview.

### Patch Changes

- a723fb0: Expand the focused public preview with Unicode-safe text handling, resize-resilient surfaces, 46 curated UI builders, schema-driven workflows with a package-neutral event-ledger contract, syntax highlighting, accessible effects and transitions, terminal charts, and Markdown rendering.
- Updated dependencies [a723fb0]
- Updated dependencies [2776d8b]
- Updated dependencies [9407abc]
- Updated dependencies [062aeae]
  - @celestial/corona@0.1.0-preview.2
  - @celestial/rosetta@0.1.0-preview.2
  - @celestial/atlas@0.1.0-preview.2
  - @celestial/aurora@0.1.0-preview.2
