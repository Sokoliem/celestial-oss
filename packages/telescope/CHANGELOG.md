# @celestial/test

## 0.1.0-preview.2

### Minor Changes

- 8914391: Make caught render errors observable instead of silent. The runtime still keeps an app running after an error thrown from update, view, subscriptions, or a lifecycle hook, but it now writes the message and stack to stderr when no `onRenderError` handler is supplied — previously the only trace was a single truncated terminal row that the next repaint erased. Opt out with the new `AppOptions.renderErrorReporting: 'silent'`.

  `createTestApp` now forwards `onRenderError`, exposes `handle.renderErrors()` / `handle.clearRenderErrors()`, and by default fails the test when the runtime catches an error. Previously the harness supplied no handler at all, so every test silently tolerated a broken update or view and could only fail if an assertion happened to cover the affected text. Pass `renderErrors: 'collect'` for tests that drive a failure on purpose.

  Add `PtyHarness.mark()` and `waitForText(match, { since })`. `waitForText` scans the whole accumulated transcript, so waiting on a string the program has already printed resolved immediately and synchronised nothing; marking first makes the wait mean "a new occurrence", which removes the need for unanchored sleeps in scenario tests.

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

- 5a8168a: Recheck accumulated PTY output at a wait deadline so a receipt already present
  in the transcript cannot be reported as missing on a saturated runner.
- Updated dependencies [5a8168a]
- Updated dependencies [5a8168a]
- Updated dependencies [5a8168a]
- Updated dependencies
- Updated dependencies [062aeae]
  - @celestial/core@0.1.0-preview.2
