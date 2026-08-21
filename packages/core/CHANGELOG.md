# @celestial/core

## 0.1.0-preview.2

### Minor Changes

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

- Add a TSX/JSX layer with deterministic event ids, an honest intrinsic map, and automatic-transform runtimes (`./jsx`, `./jsx-runtime`, `./jsx-dev-runtime`) on both `@celestial/nebula` and `@celestial/core`; add the plugin-wired DevTools inspector (F12/Ctrl+D) with `AppHandle.getLayoutPlan()`/`getHitRegions()`; add `createStore`; make `Cmd.throttle` a true leading-edge throttle and document `Cmd.async`.
- 062aeae: Harden terminal capability lifecycles, animation and responsive-layout boundaries, input protocols, direct runtime dispatch, mouse and clipboard fallbacks, beta window management, and the deterministic headless/PTY testing surface for the focused preview.

### Patch Changes

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
  - @celestial/gravity@0.1.0-preview.2
  - @celestial/nexus@0.1.0-preview.2
  - @celestial/atlas@0.1.0-preview.2
  - @celestial/aurora@0.1.0-preview.2
