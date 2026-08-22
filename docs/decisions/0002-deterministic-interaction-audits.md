# Decision 0002: Deterministic interaction audits

- Status: Accepted
- Date: 2026-07-27
- Public packages: `@celestial/nebula`, `@celestial/core`, `@celestial/test`

## Context

Celestial already normalizes semantic theme pairs in Corona, exposes
accessibility metadata in Nebula, collects clipped mouse hit regions, and
offers separate accessibility and layout audits. Those systems did not answer
one framework-wide question: does the interaction surface that was actually
painted agree with the handlers that will actually receive mouse input?

That gap allowed components to accept wheel or hover input without advertising
the affordance, arbitrary identifiers and handler tags to enter automation
receipts, disabled regions to retain handlers, and glyph-only controls to use
low-contrast idle colors. Application tests could catch individual examples,
but every host had to assemble its own partial checks.

## Decision

Nebula owns a public `auditInteractionTree()` validator and invokes it from
every automation snapshot. The validator reuses the exact `LayoutPlan` and
`CellGrid` when the runtime or test harness has already produced them.
Standalone callers provide terminal dimensions and may provide terminal
default foreground/background colors.

For each visible, clipped event region, the audit deterministically checks:

- safe, non-empty, bounded, single-line region IDs and handler tags;
- one consistent handler/metadata contract per active ID, while allowing a
  repeated semantic target to appear in responsive projections;
- positive layout geometry for active mouse regions;
- a visible or metadata-backed label;
- handler-to-affordance agreement for hover, click, pointer gestures, and
  scroll;
- a deliberate cursor for actionable pointer regions;
- removal of activation and pointer-gesture handlers from
  accessibility-disabled regions while allowing passive hover/scroll routing; and
- contrast from the final painted cells, using 4.5:1 for text labels and 3:1
  for glyph-only controls.

Text-labeled controls are identified by their painted letters or numbers.
Decorative punctuation and box borders do not become false graphical failures
when readable text already identifies the control. Regions with no painted
text—such as scrollbars, resize handles, and icon-only controls—are checked as
graphical controls. The validator reports the weakest cell, coordinates,
character, and resolved RGB pair so a failure is reproducible.

Structural interaction failures are errors. Contrast failures are warnings in
the general snapshot because terminal palettes and host defaults can be
unknown; callers that supply resolved theme defaults can enforce a zero-warning
gate. The validator never infers keyboard support from a mouse handler:
keyboard parity remains an explicit component behavior test.

## Rejected alternatives

- Source-text linting: rejected because it cannot see runtime clipping,
  inherited disabled state, theme resolution, overlays, or final cell styles.
- Token-name checks: rejected because custom themes and app-defined VNodes are
  valid public inputs; the painted result is the contract.
- Checking every border glyph in text-labeled controls: rejected because
  decorative edges are not necessarily the identifying visual signal and
  caused false failures for otherwise readable controls.
- Silently merging explicit affordance metadata with handlers: rejected because
  explicit metadata drift should fail visibly rather than be hidden.
- Contrast exemptions for individual components: rejected because readable
  rendering can be achieved with semantic state colors or a contrasting
  foreground/background pair.

## Consequences and gates

- `buildAutomationSnapshot()` checks framework components and app-defined
  event regions through one seam.
- The Flight Deck renders all 52 curated builders through nine themes at
  70- and 140-column widths and requires zero interaction violations.
- Hovered, selected, resized, dragged, and scrolled component states are
  re-audited through live test handles.
- Autocomplete, pagination, and table metadata now exactly describe their
  handlers. Option-list selection, color swatches, resize handles, and
  scrollbars use contrast-safe framework tokens or derived colors.
- Unit, packed ESM/CommonJS, demo, PTY, and preview-release gates must remain
  green.
