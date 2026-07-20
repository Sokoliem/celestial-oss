# Upstream provenance

This repository is the canonical development and release line for Celestial.
It began as a selective extraction from the earlier full Celestial repository,
but fixes and new public work now land here and are not backported.

This capability expansion is pinned to full Celestial commit
`d2d23c79d14aba1e7214cf9c459d40dd06cdf328`.

The earlier full repository is a read-only donor. Each imported package or
feature is pinned to a donor commit and reviewed before publication. Private dependencies,
browser-only integrations, unsafe execution hooks, and experimental APIs are
removed or replaced with public adapters. Public package names and manifests
are then adapted for `Sokoliem/celestial-oss` and validated from packed
artifacts.

The machine-readable import ledger is
[`scripts/donor-imports.json`](../scripts/donor-imports.json). The public
boundary check rejects a publishable package without complete donor, license,
dependency, API, test, and security review records.

The extraction was adapted in these deliberate ways:

- Rosetta's grapheme and bidi helpers are used by editable controls, terminal-width measurement, clipping, wrapping, effects, charts, and Markdown so a resize cannot split a surrogate pair, combining sequence, or emoji cluster.
- Constellation is published as `@celestial/ui` with a curated 44-builder barrel. Imported modal and contextual surfaces were updated to reflow on resize and retain visible close controls plus Escape dismissal.
- Orbit depends on `@celestial/ui`; the private `@celestial/constellation` package name and local declaration shims are absent from the public graph. Optional lifecycle events use an Orbit-owned structural ledger contract, so emitted declarations do not name a private ledger package.
- Spectrum, Mirage, Nova, and Stellar retain only allowlisted package dependencies. Motion paths gained deterministic reduced-motion behavior, and Stellar's HTML export uses a local escaping ANSI adapter instead of a browser-oriented private peer.
- Pulsar has three explicit public entries: the renderer, overlays, and fence renderers. Its compatibility loader can resolve only Stellar; chart fences validate and clamp data, Mermaid falls back to readable source, images use inert placeholders, and no network fetch or unverified terminal-control emission occurs.

Every package manifest points at this public repository. The boundary checker rejects unpublished Celestial dependencies in manifests, source, emitted JavaScript, and declarations, while the packed-install gate exercises both ESM and CommonJS consumers.

The repository roles are:

- `C:\Users\emsok\celestial-oss`: canonical source and public release checkout.
- `C:\Users\emsok\celestial`: read-only donor used for selective migration.
- `C:\Users\emsok\celestial-oss-preview`: private-history staging only; never
  a pull-request source for the public repository.
