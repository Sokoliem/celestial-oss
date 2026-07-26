---
'@celestial/nebula': minor
---

Add platform-neutral configuration loading with explicit source precedence. Applications provide ordered read adapters plus parse and validation adapters, so filesystem, environment, browser, and test sources remain caller-owned instead of implying Node-only access in the runtime.

The loader stops at the first present source and returns stage-specific diagnostics for read, parse, validation, and optional per-stage timeout failures. A malformed high-priority config can no longer disappear behind a lower-priority source or a fabricated default, and an all-missing search is an explicit not-found result.

Successful values are detached into deeply frozen plain-data snapshots, while invalid adapter shapes, unsafe diagnostic text, sparse inputs, and stateful validator values fail closed.
