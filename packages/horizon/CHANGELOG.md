# @celestial/horizon

## 0.1.0-preview.2

### Minor Changes

- eca0f94: Add typed pointer-shape projection and harden resize interactions across windows,
  split panes, and data-table columns. Resize state now handles directional
  cursors, pointer capture, cancellation, keyboard parity, invalid inputs,
  constraints, persistence boundaries, and accessible separator metadata through
  framework-owned APIs.
- 2776d8b: Harden managed-window lifecycle, workspace isolation and reassignment, inset-aware geometry, persistence migration, diagnostic outcomes, and minimized-window recovery with a labeled taskbar-style shelf. Align Corona glyph resolution with Atlas Unicode capability tiers and guarantee non-empty lower-tier fallbacks.
- 062aeae: Harden terminal capability lifecycles, animation and responsive-layout boundaries, input protocols, direct runtime dispatch, mouse and clipboard fallbacks, beta window management, and the deterministic headless/PTY testing surface for the focused preview.

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

- aea524d: Export the state-persistence serializers from `@celestial/nebula`. `serializeForStorage`, `deserializeFromStorage`, `migrateData`, `PersistenceConfig`, and `PersistedData` were implemented and unit-tested but never re-exported from the package barrel, so no consumer could reach them.

  Report a corrupt stored payload instead of silently discarding it. `deserializeFromStorage` still returns the fresh model so a damaged save cannot crash an app, but it now writes to stderr — previously a corrupt or truncated payload was indistinguishable from "nothing was ever saved", and a user whose state was thrown away had no signal. This matches the reporting the sibling version-skew branch already did.

  Remove the `storagePath` field from `PersistenceConfig` and `HorizonPersistenceConfig`. It was declared in both packages and read by no code, implying a filesystem capability neither module has: storage is caller-owned by design, and these helpers only convert a model to and from a string. Callers that were setting it can drop it — nothing behaved differently.

- 9407abc: Add semantic elevation-border resolution and framework-owned presentation primitives for themed roots, text roles, controls, interactive rows, and framed surfaces.

  Add the controlled App Shell view adapter with canonical palette, help, confirmation, notification-center, and actionable toast surfaces. Pointer, wheel, keyboard, disabled, selected, focus-ownership, and accessibility behavior now route through the same headless shell model.

  Horizon raised panes and floating window chrome now derive their frame family from the active theme while preserving explicit border overrides.

- 9407abc: Make windowed lists respond consistently to the terminal scroll wheel across Select, Command Palette, Autocomplete, Combobox, Multi-select, Option List, and Data Table. Keep pointer hover and keyboard navigation on the same highlighted-row model, ignore zero-delta pointer events, and use text-safe tokens for Number Input and Segmented Control chrome.

  Resolve Horizon panel and scrollable-pane tokens from live theme contexts, and make Orbit read the current reactive theme rather than an obsolete context shape.

- Updated dependencies [5a8168a]
- Updated dependencies [5a8168a]
- Updated dependencies [5a8168a]
- Updated dependencies
- Updated dependencies [062aeae]
  - @celestial/core@0.1.0-preview.2
