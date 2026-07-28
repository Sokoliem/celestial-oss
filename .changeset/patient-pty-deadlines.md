---
"@celestial/test": patch
---

Recheck accumulated PTY output at a wait deadline so a receipt already present
in the transcript cannot be reported as missing on a saturated runner.
