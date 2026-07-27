# Open-source preview scope

Celestial's earlier donor codebase is larger than this focused public repository. This document is the current release boundary while the canonical public line grows through reviewed migrations.

## Supported preview lane

The following packages may be published:

- Foundation: `@celestial/atlas`, `@celestial/corona`, `@celestial/aurora`, `@celestial/rosetta`
- Runtime: `@celestial/nebula`, `@celestial/gravity`, `@celestial/nexus`
- Recommended facade: `@celestial/core`
- Navigation: `@celestial/compass`
- Curated components: `@celestial/ui`
- Workflows: `@celestial/orbit`
- Rich rendering: `@celestial/spectrum`, `@celestial/mirage`, `@celestial/nova`, `@celestial/stellar`, `@celestial/pulsar`
- Testing: `@celestial/test`
- Conditional beta: `@celestial/horizon`

The machine-readable allowlist is [`scripts/preview-packages.mjs`](../scripts/preview-packages.mjs). CI and release automation fail if any other workspace becomes publishable.

## Supported demos

Four private workspaces demonstrate the supported packages without widening the publish boundary:

- `examples/task-console` uses `@celestial/core` and `@celestial/ui` with bundled Node worker fixtures.
- `examples/api-inspector` uses `@celestial/core` and `@celestial/ui` with an ephemeral loopback HTTP server.
- `examples/horizon-workbench` adds the `@celestial/horizon` beta surface for window and workspace management.
- `examples/celestial-showcase` combines the entire focused preview into an adaptive, mouse-first Flight Deck with nine labs, five of them paged, a machine-checked 18-package/49-builder ledger, deterministic painted interaction audits, Compass navigation, explicit Nebula config-loading and diagnostic receipts, Rosetta locale and bidi receipts, deep Orbit and rich-rendering instruments, target-specific right-click menus, and Horizon windows, shelf, snap, tile, and session behavior.

The boundary checker validates both their manifests and source imports. `@celestial/test` and `@celestial/test/pty` are permitted only in test files. Other applications and examples are outside this repository's scope.

## Stability labels

- **Preview** means the package is usable and tested but may change between preview releases.
- **Beta** means the package has a narrower compatibility promise and may be held back independently from the rest of the preview.

## UI boundary

`@celestial/ui` exposes 49 component builders. Its public barrel is the contract; files elsewhere in `packages/constellation/src` are not deep-import APIs. The selected interaction-heavy components are exercised through both mouse and keyboard paths in the headless harness. Modals and contextual surfaces must reflow at supported widths, expose a visible close affordance, and respond to Escape. Public keyboard-help, context-menu, and controlled notification-center composition helpers are not included in the builder count.

Every Nebula automation snapshot audits the exact clipped mouse regions and
painted cells for labels, safe IDs and handler tags, handler/affordance
agreement, cursors, disabled inertness, and contrast. The Flight Deck applies
the zero-violation gate to all 49 builders across all nine themes at compact and
wide widths, then rechecks representative hover, selection, resize, drag, and
scroll states.

## Rich-rendering gate

The rendering packages remain public only while they meet these conditions:

1. Unicode width, wrapping, clipping, and animation operate on grapheme clusters rather than UTF-16 code units.
2. Motion APIs provide deterministic reduced-motion output.
3. Pulsar uses only allowlisted public integrations; chart fences validate input and clamp dimensions, Mermaid preserves readable source, and image rendering emits safe placeholders.
4. Stellar's static exporter escapes untrusted content and does not require a browser runtime.
5. ESM, CommonJS, declarations, unit tests, and packed-install checks pass for every public entry point.

## Horizon beta gate

Horizon may be published only when all of these conditions are true:

1. Its only Celestial runtime dependency is `@celestial/core`.
2. Its emitted JavaScript and declarations contain no imports from unpublished Celestial packages.
3. Build, typecheck, unit, mouse, persistence, and public-API tests pass.
4. PTY embedding, Lens automation, and advanced transition integrations remain outside the public root.
5. The Flight Deck exercises managed windows, all-workspace shelf recovery, bounded snap zones, recursive tiling, and session save/load through public exports.

If the gate fails, Horizon stays private without blocking the other preview packages.

## Out-of-scope source

The following areas are intentionally unpublished:

- 3D rendering (`astral`, `orrery`, and related experiments)
- Browser and multi-target rendering (`portal`, `rift`)
- Remote sharing (`warp`)
- Multiprocess coordination (`cluster`)
- Agent and MCP tooling (`agent`, `beacon`, `quasar`, and related packages)
- Demoscene effects (`flicker`)
- Binary terminal image protocols and Canvas-backed Mermaid rendering
- Product applications under `apps/*` and legacy examples under `examples/*`, except the four supported demos above

These areas are not included in this repository. They may be migrated selectively from the read-only donor only after their dependencies, public API, tests, documentation, licensing, security review, and release posture satisfy this repository's gates and donor ledger.

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
