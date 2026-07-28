---
'@celestial/nebula': minor
'@celestial/core': minor
'@celestial/horizon': patch
'@celestial/ui': patch
---

Add explicit keyboard-focus ownership to Nebula overlays and portals. Active
and modal layers now exclude obscured focus targets deterministically, passive
layers cannot steal Tab navigation, and blocking layers prevent focus from
leaking through a non-focusable modal.

Make Horizon managed windows declare that policy automatically from normalized
window focus, modal state, workspace visibility, and lifecycle state. Update
PiP surfaces, context menus, toasts, application-shell layers, and the Flight
Deck to exercise the same framework contract.
