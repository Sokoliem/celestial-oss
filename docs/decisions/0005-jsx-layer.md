# Decision 0005: JSX layer contract

- Status: Accepted
- Date: 2026-08-20
- Public packages: `@celestial/nebula`, `@celestial/core`

## Context

Celestial views are plain function calls that produce a virtual terminal tree.
Developers arriving from React and Ink reasonably expect TSX syntax, and the
adoption cost of a second mental model is real. A JSX layer existed briefly in
an unreviewed form: it silently discarded function-form `onClick` props,
rendered unknown tags as boxes behind a type-system catch-all, minted event
region ids from a module-global counter inside the render path, accepted `key`
props it never honored, and exposed a `TextInput` whose `onChange` and
`cursor` props were dead.

Each of those is a lie a framework cannot afford: interaction that does not
interact, ids that churn every frame, and types that fail to flag typos.

## Decision

The JSX layer compiles to the same VNode tree as the element builders — it is
syntax, not a second component model.

- **Transform.** Consumers set `jsx: "react-jsx"` with
  `jsxImportSource: "@celestial/core"` (or `@celestial/nebula`). Both packages
  export `./jsx`, `./jsx-runtime`, and `./jsx-dev-runtime` subpaths. The `JSX`
  namespace is module-scoped only; no global namespace is declared, so mixed
  React projects do not collide.
- **Interaction is message tags, never closures.** `onClick` and friends are
  `MouseHandler` values (a string tag or a modifier-handler object). Clicks
  reach the app's `update` through `Sub.elementMouse` like every other
  interaction. Function-form handlers are unrepresentable, not silently
  dropped.
- **Deterministic ids.** Event region ids derive from handler tags
  (`btn:increment`, `box:<tags>`) or an explicit `id` prop. Nothing mutates
  module state during render, so painted audits and hit regions are stable
  across frames and across apps in one process.
- **Honest intrinsics.** The `IntrinsicElements` map enumerates the thirteen
  supported tags with no index-signature catch-all: a typo fails typecheck,
  and an unknown tag reaching the runtime throws instead of rendering a box.
- **Presentational `TextInput`.** The JSX input renders value, placeholder,
  focus chrome, and masking but owns no editing state and advertises no
  `onChange`/`cursor` props. Interactive input is `@celestial/ui`'s
  `textInput`, a full state-machine component.
- **`key` is accepted and ignored.** Celestial reconciles painted cells
  positionally, not keyed VNode lists. `key` is stripped before props reach
  components and documented as an authoring-compatibility shim, so it is a
  no-op rather than a false promise.
- **Style composition.** The `style` prop acts as a base; individual style
  props (`color`, `bold`, `border`, …) merge over it via the Corona style
  merge rather than being discarded.

## Rejected alternatives

- Function-handler registry keyed by region id: rejected because it
  reintroduces mutable module state in the render path and bypasses the typed
  message contract that makes updates auditable.
- Silent `Box` fallback for unknown tags: rejected because a typo'd intrinsic
  is a bug, and silent fallback hides it.
- Keyed reconciliation: rejected for the preview — the cell-grid diff is
  already correct and fast; a keyed VNode layer would be a second engine to
  keep honest.

## Consequences and gates

- `packages/nebula/src/__tests__/jsx-transform.test.tsx` compiles real TSX
  through the automatic transform and renders it through the live runtime,
  including a `@ts-expect-error` proving unknown intrinsics fail typecheck.
- The packed-consumer smoke tests import every JSX subpath from both
  `@celestial/nebula` and `@celestial/core`.
- The `create-celestial` `tsx-app` template typechecks against the packed
  export surface in CI, so the advertised transform path cannot rot.
