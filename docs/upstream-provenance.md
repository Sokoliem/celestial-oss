# Upstream provenance

The focused public preview is extracted selectively from the private full
Celestial repository. It does not share or import the private repository's Git
history.

The capability expansion is pinned to full Celestial commit
`d2d23c79d14aba1e7214cf9c459d40dd06cdf328`.

Each imported package is reviewed before publication. Private dependencies,
browser-only integrations, unsafe execution hooks, and experimental APIs are
removed or replaced with public adapters. Public package names and manifests
are then adapted for `Sokoliem/celestial-oss` and validated from packed
artifacts.

The Orbit extraction uses `@celestial/ui` as its only component-system
dependency; the private `@celestial/constellation` package name and its local
declaration shims are intentionally absent from the public package graph.

The authoritative repositories are:

- `C:\Users\emsok\celestial`: full source used for selective extraction.
- `C:\Users\emsok\celestial-oss`: clean-history public working checkout.
- `C:\Users\emsok\celestial-oss-preview`: private-history staging only; never
  a pull-request source for the public repository.
