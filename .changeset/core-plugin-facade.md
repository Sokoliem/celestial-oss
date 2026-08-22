---
'@celestial/core': minor
---

Re-export the plugin and DevTools surface through the facade: `withPlugins`, `createPlugin`, `debugPlugin`, `createDevTools`, and their types, so golden-path consumers can install plugins without importing `@celestial/nebula` directly. Adds golden-path smoke coverage for the facade.
