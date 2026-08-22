# Roadmap

Celestial is an **open-source preview**: a deliberately small, supported lane
extracted from a larger research codebase. This document is the public
statement of intent — what is supported, what is explicitly out, and what has
to be true before 1.0.

## Supported now (the preview contract)

- **Framework**: 18 public packages (`@celestial/*`) covering the Elm runtime,
  capability detection, styling/theming, animation, layout, interaction,
  navigation, 52 audited component builders, forms/wizards, Markdown,
  highlighting, charts, and a headless + PTY testing harness.
- **Tooling**: `create-celestial` scaffolder, TSX layer, DevTools inspector
  plugin, Node SEA / Bun single-binary bundlers, and the deterministic demo
  recorder.
- **Docs**: README-first, package READMEs as the API reference,
  [guides](docs/guides/), design decisions in [`docs/decisions`](docs/decisions/).
- **Release discipline**: changesets, packed-tarball ESM/CJS/type smoke tests,
  cross-OS PTY CI, and a manual, dry-run-first publish workflow.

Preview releases may change APIs between versions. Only exports documented by
the packages in this repository are supported. `@celestial/horizon` carries a
narrower **beta** promise and may be held back independently.

## Explicitly out of scope (for now)

These live in the research codebase and are not promised for this repository:

- 3D and browser/multi-target rendering, remote sharing, multiprocess
  orchestration.
- Agent *runtime* tooling (protocols, transports, model integrations).
  Agent-facing **UI components** (`toolCall`, `diffViewer`, `inlinePrompt`)
  are in scope and ship here.
- Binary terminal image protocols and Canvas-backed Mermaid rendering.
- PTY embedding and Lens automation in `@celestial/horizon`.

Admission to the public lane is selective and gated on dependency boundary,
tests, documentation, licensing, security review, and a release contract —
the same gates everything here passed.

## Before 1.0

- Real usage from the preview: issue volume, adoption of the scaffolder, and
  at least one external app shipping on the framework.
- API stability pass on the golden path (`@celestial/core`) informed by that
  usage; the preview label comes off only after the surface proves boring.
- `@celestial/horizon` graduates from beta once its windowing contracts
  (persistence, focus ownership, snap/tile) survive a preview cycle unchanged.
- Message-history tooling beyond the current DevTools recorder (scrub/replay)
  is the most likely first post-preview feature.

## How to influence it

- **Bugs and papercuts** — file them; the issue templates ask for terminal,
  OS, and a headless repro (`@celestial/test` makes this small).
- **Scope questions** — if something in "out of scope" would unblock you, say
  so; admission is demand-driven but gate-bound.
- **Contributions** — see [CONTRIBUTING.md](CONTRIBUTING.md). The preview lane
  is deliberately small; large new surfaces start as discussion, not PRs.
