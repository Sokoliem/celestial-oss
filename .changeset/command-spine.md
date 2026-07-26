---
'@celestial/ui': minor
'@celestial/nebula': minor
---

Add the command spine: `keyboard` and `actions`.

`keyboard` provides declarative key bindings — `KeyBinding`, `matchesKeyBinding`, `getMatchingKeyBinding`, `keyMap` for exact first-active dispatch, and `helpView` for a generated help screen. It canonicalizes named-key aliases and printable keys, routes Tab before built-in focus traversal, hides inactive or undiscoverable entries by default, and rejects keys or modifier combinations the terminal cannot emit exactly. Key maps reconcile after raw key-event handlers, so a dismissal or mode change updates the active shortcut for the same event.

`actions` projects a Nebula `ActionRegistry` onto UI surfaces: `actionCommands` derives command-palette entries and `actionKeyBindings` derives key bindings from the same registered actions, so a palette entry and its shortcut cannot disagree. `formatActionShortcut` and `formatDisplayKey` render shortcuts consistently wherever they appear.

Both count key labels in graphemes rather than UTF-16 code units. The help screen aligns its key column on measured display width and refuses to advertise multi-scalar or control-key declarations that the runtime cannot bind.

`unbindableActionShortcuts` statically reports shortcuts that `actionKeyBindings` cannot express, including malformed syntax, collisions, decoder-limited modifier combinations, and multi-chord sequences that need Nebula's stateful keybinding engine. Disabled palette commands are now semantically inert for both keyboard and pointer selection rather than relying on a label suffix alone.

Nebula accessibility semantics now represent disabled controls explicitly. Disabled commands remain visible to automation and accessibility consumers, but are excluded from actionable snapshots and remain subject to accessible-label audits.

The curated preview suite and packed-package smoke checks cover these public helpers and semantics.

These are helpers rather than component builders, so the curated 46-builder count is unchanged.
