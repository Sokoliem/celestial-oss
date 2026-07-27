---
'@celestial/ui': patch
'@celestial/horizon': patch
'@celestial/orbit': patch
---

Make windowed lists respond consistently to the terminal scroll wheel across Select, Command Palette, Autocomplete, Combobox, Multi-select, Option List, and Data Table. Keep pointer hover and keyboard navigation on the same highlighted-row model, ignore zero-delta pointer events, and use text-safe tokens for Number Input and Segmented Control chrome.

Resolve Horizon panel and scrollable-pane tokens from live theme contexts, and make Orbit read the current reactive theme rather than an obsolete context shape.
