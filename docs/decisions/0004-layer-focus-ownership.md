# Decision 0004: Layer focus ownership

- Status: Accepted
- Date: 2026-07-27
- Public packages: `@celestial/nebula`, `@celestial/core`,
  `@celestial/horizon`, `@celestial/ui`

## Context

Horizon already normalized managed windows to one visually focused window and
kept modal windows above ordinary and always-on-top layers. Nebula focus
discovery nevertheless walked every rendered overlay in document order.
Keyboard focus could therefore remain in an obscured window after pointer
activation changed the z-order, or move into workspace content beneath a
modal. Individual modal and drawer components partially compensated with
focus groups, but generic overlays, managed windows, PiP surfaces, menus, and
toasts did not share one ownership rule.

This split was especially visible in a mouse-forward window system: the active
border and pointer target named one window while Tab navigation still named
another.

## Decision

Nebula layers may declare a `focusMode`:

- `passive` excludes the layer's descendants without displacing the current
  owner. It is used for toasts, tooltips, unfocused windows, and backdrops.
- `active` makes the layer's descendants the exclusive keyboard-navigation
  candidates. The highest z-index active layer wins.
- `modal` is exclusive and outranks active layers regardless of z-index.
- `blocked` is a modal-priority keyboard barrier with no eligible descendants.
  It represents a visible modal layer that intentionally cannot receive focus.
- Omitting `focusMode` preserves legacy document-order collection.

Portals use the same policy and are treated as visually frontmost among layers
of equal focus priority because portal painting follows ordinary overlays.
Within the winning layer, `tabIndex` and document order continue to define
navigation order. If the previous focus ID belongs to an obscured layer,
Nebula's existing focus synchronization moves to the first eligible target or
clears focus when the winning layer is blocked.

Horizon derives the policy for managed windows:

- the normalized focused window is `active`;
- a focused modal window is `modal`;
- other windows are `passive`;
- a visible non-focusable modal is `blocked`.

The manager and standalone lifecycle helper both clear background window focus
under a non-focusable modal. Minimizing, hiding, closing, restoring, switching
workspaces, and pointer focus therefore update visual focus and keyboard
ownership through the same normalized model.

Framework surfaces declare their role rather than leaving it to applications:
context menus are modal-priority, toasts and click-away backdrops are passive, and
application-shell confirmation, palette, help, and notification surfaces are
modal. PiP callers can select the mode explicitly.

## Edge cases

- An active layer with no focus nodes still owns navigation; Tab does not fall
  through to obscured content.
- A blocked layer clears focus even when its child accidentally contains focus
  nodes.
- A passive layer may contain focus nodes for later activation, but they are
  absent from the current navigation list.
- A nested modal outranks its active parent.
- Equal-priority, equal-z layers resolve by paint declaration order.
- Legacy overlays remain source-compatible and retain document-order behavior.
- Window arrays without an explicit focused flag fall back to the frontmost
  focusable visible window, matching `WindowManager` normalization.

## Rejected alternatives

- Filter focus only in the Flight Deck: rejected because every host would
  reproduce the same window and modal boundary.
- Infer ownership solely from z-index: rejected because toasts and tooltips may
  paint above a focused control without becoming keyboard owners.
- Rely only on focus groups: rejected because groups constrain matching IDs but
  do not describe passive, active, or blocking visual layers.
- Make every overlay active by default: rejected because it would break
  existing tooltip, decoration, and compositor use.

## Consequences and gates

- Nebula tests cover active z-order, passive exclusion, modal priority,
  blocking barriers, portal priority, and retained-focus eviction.
- Horizon tests cover focused-window ownership, raw-array fallback,
  non-focusable modal barriers, minimize/close restoration, and modal
  lifecycle.
- UI tests assert modal-priority context menus, passive toasts, and modal application
  shell layers.
- The Flight Deck exposes a live keyboard-layer receipt and places a focus node
  inside each instrument window. Its test proves a modal displaces that target.
- Full package, packed-consumer, Flight Deck, PTY, and preview validation gates
  must remain green.
