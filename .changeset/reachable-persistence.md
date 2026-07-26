---
'@celestial/nebula': minor
'@celestial/horizon': patch
---

Export the state-persistence serializers from `@celestial/nebula`. `serializeForStorage`, `deserializeFromStorage`, `migrateData`, `PersistenceConfig`, and `PersistedData` were implemented and unit-tested but never re-exported from the package barrel, so no consumer could reach them.

Report a corrupt stored payload instead of silently discarding it. `deserializeFromStorage` still returns the fresh model so a damaged save cannot crash an app, but it now writes to stderr — previously a corrupt or truncated payload was indistinguishable from "nothing was ever saved", and a user whose state was thrown away had no signal. This matches the reporting the sibling version-skew branch already did.

Remove the `storagePath` field from `PersistenceConfig` and `HorizonPersistenceConfig`. It was declared in both packages and read by no code, implying a filesystem capability neither module has: storage is caller-owned by design, and these helpers only convert a model to and from a string. Callers that were setting it can drop it — nothing behaved differently.
