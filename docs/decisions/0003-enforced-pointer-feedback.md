# Decision 0003: Enforced pointer feedback

- Status: Accepted
- Date: 2026-07-27
- Public packages: `@celestial/nebula`, `@celestial/core`, `@celestial/ui`,
  `@celestial/gravity`, `@celestial/horizon`, `@celestial/telescope`

## Context

Celestial is mouse-forward and window-centric, but pointer feedback was still
optional in practice. Components with dedicated hover models generally used
semantic state tokens, while click-only regions could remain visually inert.
Several components requested Corona's terminal-native `reverse` effect, but
Nebula dropped that effect while converting and shading styles. Custom menu
token overrides could also bypass otherwise contrast-safe theme pairs.

The result was inconsistent even inside one rendered Flight Deck frame:
virtual-list rows, compact triggers, popovers, roving option lists, and
compatibility controls could expose valid handlers and cursors without a
deterministic hover transition.

The minimized-window shelf had a related ownership problem. Horizon provided
the shelf and inset-aware window bounds, but applications still had to repeat
the conditional row composition and row-count calculation.

## Decision

Nebula event builders now enforce one of two pointer-feedback contracts for
every actionable non-spatial region:

1. `managed` feedback is inferred when paired `onMouseEnter` and
   `onMouseLeave` handlers exist. The component owns its semantic state face,
   while the runtime adds a bold/underline receipt to guarantee a transition.
2. `reverse` feedback is inferred for other actionable regions, including
   click-only controls and roving-highlight controls that update on entry.
   After shaders run, the runtime applies reverse video and bold to the exact
   clipped target rectangle. Entering and leaving either feedback mode
   schedules a render even when no application message is needed.

Reverse video is the fallback because it swaps an existing foreground and
background instead of inventing a color outside the active theme; therefore it
preserves the existing contrast ratio. The fallback is applied after raster
and shader processing, and Corona's `blink`, `reverse`, and `hidden` effects
are preserved through Nebula style conversion, responsive resolution, shader
round-tripping, ANSI diff output, and Telescope color snapshots.

Handler-derived affordances are mandatory framework facts. `event()` and
`region()` merge them with explicit descriptive metadata rather than allowing
an explicit list to remove hover, click, drag, or scroll behavior that is
actually wired. This supersedes the narrow rejected alternative in Decision
0002: merging is appropriate for framework-owned handler facts; conflicting
custom raw event nodes still fail the interaction audit.

`auditInteractionTree()` requires either runtime reverse feedback or a managed
paired lifecycle plus the hover affordance. Spatial catch-alls remain exempt
from visual feedback because their descendants own the painted face.

Components with meaningful semantic states continue to own their hover model.
Virtual lists, assisted-input triggers, range sliders, popovers, and popover
groups use the theme's hover foreground/background pair. Context menus repair
even explicit token overrides to the text and graphical contrast thresholds.

Horizon owns the minimized-row calculation and status composition through
`windowShelfReservedRows()` and `windowShelfStatusBar()`. The same measured
row count feeds window-manager bottom insets and shell status layout, so the
shelf cannot cover application content or the permanent status surface.

## Edge cases

- Disabled controls remain inert and do not receive automatic activation
  behavior.
- Roving option lists may keep their keyboard highlight after pointer exit;
  the runtime reverse face is still transient.
- Nested regions apply fallback feedback only to the topmost target.
- Opaque image cells are not modified.
- Clipped and zero-sized regions cannot paint outside their layout rectangle.
- A shelf row appears only when the selected workspace scope contains at least
  one minimized window; all-workspace hosts opt into all-workspace counting.
- Floating-window bounds reserve the same row count used by shell composition.

## Rejected alternatives

- Add hover booleans in the Flight Deck only: rejected because every
  application would reproduce the same contract and future components could
  regress.
- Pick a universal hover color: rejected because a fixed color cannot be
  contrast-safe across arbitrary themes.
- Require paired enter/leave handlers on every control: rejected because
  click-only controls do not need application state merely to paint feedback,
  and roving highlight is intentionally not a transient hover model.
- Float the minimized shelf above content: rejected because overlays can hide
  status and application information.
- Exempt individual low-contrast controls: rejected because semantic pairs,
  deterministic repair, and reverse video cover the valid cases.

## Consequences and gates

- The Flight Deck audits every curated builder through all nine themes at
  compact and wide widths, including hovered assisted inputs, range sliders,
  virtual-list rows, and popover triggers.
- Automation exposes `mouse-actions-have-hover-feedback` as a mandatory rule.
- Raw actionable event nodes that bypass the builder must declare a complete
  feedback contract or fail the audit.
- Unit tests cover metadata inference, exact hover raster bounds, managed and
  spatial exclusions, style/shader effect preservation, unsafe menu overrides,
  and conditional shelf row reservation.
- Full package, packed-consumer, Flight Deck, PTY, and preview validation gates
  must remain green.
