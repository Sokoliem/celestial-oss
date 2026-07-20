# Open-source preview scope

Celestial's broader research codebase is larger than this focused public repository. This document is the release boundary.

## Supported preview lane

The following packages may be published:

- Foundation: `@celestial/atlas`, `@celestial/corona`, `@celestial/aurora`
- Runtime: `@celestial/nebula`, `@celestial/gravity`, `@celestial/nexus`
- Recommended facade: `@celestial/core`
- Curated components: `@celestial/ui`
- Testing: `@celestial/test`
- Conditional beta: `@celestial/horizon`

The machine-readable allowlist is [`scripts/preview-packages.mjs`](../scripts/preview-packages.mjs). CI and release automation fail if any other workspace becomes publishable.

## Supported demos

Four private workspaces demonstrate the supported packages without widening the publish boundary:

- `examples/task-console` uses `@celestial/core` and `@celestial/ui` with bundled Node worker fixtures.
- `examples/api-inspector` uses `@celestial/core` and `@celestial/ui` with an ephemeral loopback HTTP server.
- `examples/horizon-workbench` adds the `@celestial/horizon` beta surface for window and workspace management.
- `examples/celestial-showcase` combines the entire reduced preview into an adaptive, mouse-first Flight Deck with contextual help and live smoke receipts.

The boundary checker validates both their manifests and source imports. `@celestial/test` and `@celestial/test/pty` are permitted only in test files. Other applications and examples are outside this repository's scope.

## Stability labels

- **Preview** means the package is usable and tested but may change between preview releases.
- **Beta** means the package has a narrower compatibility promise and may be held back independently from the rest of the preview.

## UI boundary

`@celestial/ui` exposes 27 component builders. Its public barrel is the contract; files elsewhere in `packages/constellation/src` are not deep-import APIs. The selected interaction-heavy components are exercised through both mouse and keyboard paths in the headless harness.

## Horizon beta gate

Horizon may be published only when all of these conditions are true:

1. Its only Celestial runtime dependency is `@celestial/core`.
2. Its emitted JavaScript and declarations contain no imports from unpublished Celestial packages.
3. Build, typecheck, unit, mouse, persistence, and public-API tests pass.
4. PTY embedding, Lens automation, and advanced transition integrations remain outside the public root.

If the gate fails, Horizon stays private without blocking the other preview packages.

## Out-of-scope source

The following areas are intentionally unpublished:

- 3D and advanced rendering (`astral`, `orrery`, and related experiments)
- Browser and multi-target rendering (`portal`, `rift`)
- Remote sharing (`warp`)
- Multiprocess coordination (`cluster`)
- Agent and MCP tooling (`agent`, `beacon`, `quasar`, and related packages)
- Advanced effects and transitions (`mirage`, `flicker`, `nova`)
- Product applications under `apps/*` and legacy examples under `examples/*`, except the four supported demos above

These areas are not included in this repository. They may be introduced selectively from Celestial's broader development codebase only after their dependencies, public API, tests, documentation, licensing, and release posture satisfy this repository's gates.

## Release gate

A preview release requires:

- allowlist validation;
- build, strict typecheck, and unit tests;
- cross-platform framework and demo PTY smoke tests on Linux, macOS, and Windows;
- clean packed-manifest dependency checks;
- ESM, CommonJS, and declaration install tests in a fresh fixture;
- license review and a full-history secret scan;
- explicit manual confirmation in the release workflow.

Publishing is performed package-by-package from the allowlist. Recursive workspace publishing is prohibited.
