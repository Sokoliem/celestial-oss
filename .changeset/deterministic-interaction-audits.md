---
'@celestial/nebula': minor
'@celestial/core': minor
'@celestial/test': patch
'@celestial/ui': patch
'@celestial/telescope': patch
'@celestial/horizon': patch
---

Add a deterministic runtime interaction audit that validates rendered mouse
regions against their labels, handlers, affordances, cursors, disabled state,
IDs, and final painted contrast. Automation snapshots now reuse their exact
layout plan and cell grid for this audit.

Harden autocomplete, pagination, sortable table headers, option-list selection,
color swatches, resize handles, and scrollbar colors so their tokenized visual
and interaction contracts remain consistent across themes.
