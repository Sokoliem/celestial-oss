---
'@celestial/ui': minor
---

Add persistent `scrollbar()` and keyed fixed-row `virtualList()` builders to the
public UI package. Both surfaces share tokenized hover, focus, active, disabled,
wheel, pointer, and keyboard behavior; isolate consumer callbacks; and expose
controlled geometry messages for hosts that resize or replace data.

The virtual list preserves selection and focus by stable key, keeps disabled rows
inert, handles append-at-bottom receipts, and renders only the exact visible
window. The scrollbar adds proportional thumbs, track paging, pointer drag with
global release and Escape rollback, and accessible slider metadata.
