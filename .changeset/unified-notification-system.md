---
"@celestial/ui": minor
---

Unify transient toasts and persistent inbox notifications behind one validated,
immutable store so the two surfaces cannot drift. Invalid input now returns
explicit diagnostics, toast expiry preserves inbox history, and deduplication
retains stable IDs. A controlled notification-center helper adds measured
variable-height rows, action receipts, focus-scoped mouse and keyboard parity,
and explicit Escape ownership without introducing a second notification list
or weakening the public uniform-scroll contract.
