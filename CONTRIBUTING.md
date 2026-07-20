# Contributing to Celestial

Celestial is currently accepting focused contributions to the open-source preview lane.

## Before opening a pull request

1. Open or reference an issue for behavior changes and new public API.
2. Keep the supported surface within [`docs/preview-scope.md`](docs/preview-scope.md).
3. Add tests for state transitions and rendered behavior.
4. For interactive UI, provide a mouse path and a keyboard fallback. Layered surfaces must have Escape and a visible close control.
5. Use semantic design tokens from Corona, layout primitives from Gravity or Nebula, and existing UI builders instead of raw colors or parallel abstractions.

## Local validation

Use Node 22 and pnpm 9.15 or newer:

```bash
pnpm install --frozen-lockfile
pnpm run preview:boundary
pnpm run preview:build
pnpm run preview:typecheck
pnpm run preview:test
pnpm run preview:pack:check
```

Package tests live under `src/__tests__/*.test.ts` and use Vitest. Biome owns formatting and linting.

## Scope expansion

Packages and applications outside [`docs/preview-scope.md`](docs/preview-scope.md) are intentionally absent. Propose a scope expansion in an issue before adding a package or introducing a dependency outside the current allowlist.

## Changesets

User-visible public-package changes should include a changeset. Preview releases may combine multiple changesets and do not imply 1.0 stability.

## Conduct and security

Follow [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Report vulnerabilities through the private process in [`SECURITY.md`](SECURITY.md), not a public issue.
