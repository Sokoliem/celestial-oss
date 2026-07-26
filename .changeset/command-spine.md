---
'@celestial/ui': minor
---

Add the command spine: `keyboard` and `actions`.

`keyboard` provides declarative key bindings — `KeyBinding`, `matchesKeyBinding`, `getMatchingKeyBinding`, `keyMap` for batched subscriptions, and `helpView` for a generated help screen. Bindings are plain data, so the list an app listens on is the same list it advertises and a help screen cannot drift from the bindings it documents.

`actions` projects a Nebula `ActionRegistry` onto UI surfaces: `actionCommands` derives command-palette entries and `actionKeyBindings` derives key bindings from the same registered actions, so a palette entry and its shortcut cannot disagree. `formatActionShortcut` and `formatDisplayKey` render shortcuts consistently wherever they appear.

Both count key labels in graphemes rather than UTF-16 code units. The help screen aligns its key column on measured display width, so a two-cell emoji — five code units — no longer over-pads and breaks the column.

`unbindableActionShortcuts` reports shortcuts that `actionKeyBindings` cannot express. A multi-chord sequence such as `ctrl+k ctrl+s` needs a chord state machine and is skipped, which previously happened silently: an action could declare a shortcut that simply never fired, with nothing to say so. Callers can now assert the list is empty.

These are helpers rather than component builders, so the curated 46-builder count is unchanged.
