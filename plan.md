# Plan

## Objective

Deliver one framework-owned, edge-case-hardened resizing path for terminal
windows, split panes/sidebars, and data-table columns, including directional
mouse-pointer cursors, keyboard parity, accessibility metadata, persistence
safe state, and a Flight Deck proof.

## Constraints

- Keep interaction behavior in Nebula/Nexus/Gravity/Horizon/Constellation;
  the showcase may only compose and demonstrate public framework APIs.
- Preserve immutable model updates and the existing public preview boundary.
- Treat terminal cells as integer, half-open layout geometry.
- Degrade safely when the terminal does not support pointer-shape OSC 22.
- Preserve modal/z-order ownership, minimum viewport behavior, and existing
  keyboard/mouse/PTY contracts.
- Do not merge this work into PR #18; it starts from merged `master` commit
  `9407abc`.

## Assumptions

- OSC 22 is emitted only for a known/explicitly enabled terminal; embedders can
  always consume the pointer-cursor callback.
- Raw mouse subscriptions remain the capture path for active drags, while
  region metadata owns hover cursors and semantic inspection.
- Existing fixed-width callers remain unchanged unless column resizing is
  explicitly enabled.

## Risks

- Cursor escape output can pollute unsupported terminals or snapshot tests.
- Pointer release outside a handle can leave stale drag/cursor state.
- Constraint order can move the opposite edge or violate min/max bounds.
- Narrow viewports can make pane/table minima impossible to satisfy.
- Duplicate/stale column or pane ids can corrupt persisted resize state.

## Steps

- [x] Type the shared pointer-cursor vocabulary and add safe OSC 22
  encode/detect/reset support plus an AppOptions cursor-change callback.
- [x] Resolve the topmost region cursor in Nebula, capture resize/drag cursors
  through release, clear on leave/suspend/stop, and cover unsupported terminals.
- [x] Harden Nexus hit regions, cursor priority, resize geometry, snapping,
  aspect ratio, non-finite inputs, anchor preservation, cancel, and stale state.
- [x] Complete Horizon float edge/corner hit testing, expose the resolved
  directional cursor, cancel interactions whose geometry disappears, and keep
  resize cursor capture through out-of-bounds drag/release.
- [x] Harden Gravity/Horizon split-pane constraints and identifiers, and expose
  host helpers for pointer and keyboard resizing of sidebars without demo math.
- [x] Add opt-in controlled data-table column sizing with per-column bounds,
  mouse drag, global release, Escape rollback, keyboard nudge, reset,
  immutable snapshots, callbacks, directional cursor metadata, and a11y state.
- [x] Migrate the Flight Deck window/table examples and Horizon sidebar split
  adapters to the framework APIs, with visible receipts for hover, drag,
  keyboard resize, clamp, reset, and narrow-viewport behavior.
- [x] Add changesets and public API/packed-consumer smoke coverage.
- [x] Run focused adversarial suites, package typechecks/builds, showcase tests,
  PTY tests, and the complete `pnpm run preview:validate` gate.
- [x] Review the final diff for additional adjacent hardening opportunities,
  commit/push the branch, open/update its PR, and relaunch the validated Flight
  Deck from the new implementation.

## Validation

- Tests to run:
  - Nebula pointer-cursor runtime and terminal-session tests.
  - Nexus pointer and resize-handle adversarial tests.
  - Gravity splitter and Horizon mouse/window hardening tests.
  - Constellation data-table interaction/a11y tests.
  - Flight Deck headless and PTY suites.
  - `pnpm run preview:validate`.
- Success criteria:
  - Directional cursor changes are typed, deduplicated, reset, and safely
    ignored where unsupported.
  - Window, sidebar, and table resizing clamp deterministically without NaN,
    negative size, anchor drift, stuck capture, or stale persisted state.
  - Mouse and keyboard paths produce equivalent constrained dimensions.
  - The showcase contains no local resize geometry or cursor escape logic.
  - The packed preview imports and full validation gate pass.
