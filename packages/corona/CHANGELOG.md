# @celestial/corona

## 0.1.0-preview.2

### Minor Changes

- 9407abc: Add semantic elevation-border resolution and framework-owned presentation primitives for themed roots, text roles, controls, interactive rows, and framed surfaces.

  Add the controlled App Shell view adapter with canonical palette, help, confirmation, notification-center, and actionable toast surfaces. Pointer, wheel, keyboard, disabled, selected, focus-ownership, and accessibility behavior now route through the same headless shell model.

  Horizon raised panes and floating window chrome now derive their frame family from the active theme while preserving explicit border overrides.

### Patch Changes

- a723fb0: Expand the focused public preview with Unicode-safe text handling, resize-resilient surfaces, 46 curated UI builders, schema-driven workflows with a package-neutral event-ledger contract, syntax highlighting, accessible effects and transitions, terminal charts, and Markdown rendering.
- 2776d8b: Harden managed-window lifecycle, workspace isolation and reassignment, inset-aware geometry, persistence migration, diagnostic outcomes, and minimized-window recovery with a labeled taskbar-style shelf. Align Corona glyph resolution with Atlas Unicode capability tiers and guarantee non-empty lower-tier fallbacks.
- Updated dependencies [062aeae]
  - @celestial/atlas@0.1.0-preview.2
