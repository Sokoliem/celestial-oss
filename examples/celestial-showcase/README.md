# Celestial Flight Deck

The flagship demo for the focused Celestial open-source preview. It combines the six `@celestial/core` foundations, all 46 curated `@celestial/ui` builders, Orbit forms and wizards, Spectrum highlighting, Mirage effects, Nova transitions, Stellar charts, Pulsar Markdown, Telescope testing, and Horizon beta window management in one offline, deterministic application. The `contextMenuView` state renderer is demonstrated separately from the 46 component builders.

```bash
pnpm demo:showcase
```

Use a terminal at least 70 columns wide and 32 rows tall. Below that minimum, the app shows a resize-required view while preserving the current lab, controls, windows, and smoke receipts. The app adapts at 80 and 120 columns:

- **Compact, below 80:** one lab at a time; the Windows lab keeps its front instrument live inline.
- **Medium, 80-119:** lab plus a live context split, including the front instrument in the Windows lab.
- **Wide, 120+:** mission rail and draggable Horizon floating instruments.

Minimized instruments appear in a conditional one-row shelf above the status
line at every breakpoint. The shelf includes every workspace: left-clicking an
item restores and focuses it in its owning workspace, while right-clicking opens
the same target-specific window menu used by floating content.

## Controls

- Mouse: hover any interactive control for an activation highlight; click labs, controls, smoke receipts, layer actions, workspace tabs, window chrome, and minimized shelf items; right-click labs, controls, windows, shelf items, or panel space for target-specific actions; drag the Mouse-lab receipt, sliders, and any non-control area of floating-window titlebars; resize windows from any edge or corner at wide size.
- `1`-`8`: open Core, Components, Workflows, Visuals, Mouse, Layers, Windows, or Smoke.
- `[` / `]`: page the curated component gallery.
- `N` / `B`: advance or go back in the Orbit workflow.
- `?`, `F1`, or `H`: open help for the current lab.
- `Ctrl+P`: open the command palette.
- `Shift+F10` (or `F10` in terminals that do not report Shift): open a context menu for the current lab.
- `Escape`: dismiss the topmost context menu, gallery menu sample, active drag, modal, confirmation, drawer, tooltip, palette, toast, or help surface.
- `R`: reset the demo and its receipts. `Q` or `Ctrl+C`: quit.

## Manual smoke test

The Smoke lab records eleven receipts. Complete them in this order:

1. Start in **Core** and confirm Atlas capability detection, Corona contrast and glyph resolution, Aurora motion, Nebula state/signals, Gravity layout, and the Nexus HitMap probe are visible.
2. Open **Components**, advance through all eight pages, and confirm the pages account for all 46 public builders: base inputs; grouped and assisted inputs; specialized form controls; navigation; data; display (including `indeterminateProgress` and `cardGrid`); feedback and layers; contextual surfaces (including `popoverGroup`). On page 1, hover controls, click **Dense** directly, and click or drag the slider. On the data page, click one table row, Shift+click a later row, and confirm the inclusive range is highlighted with a `range N-M` receipt. On page 8, dismiss the sample context menu with `Escape`, reopen it with the visible action, and confirm its gallery state survives rerenders.
3. Open **Workflows**, change the schema form's reduced-motion field, then use **Advance step** or `N` to move from Scope to Verify. Confirm the explicit form and wizard models survive navigation.
4. Open **Visuals** and confirm highlighted TypeScript, a grapheme-safe Mirage gradient/shimmer, Nova transition output, a Stellar line chart, and rendered Pulsar Markdown are visible. With reduced motion enabled, confirm motion output is deterministic.
5. Open **Mouse**, move over and click the target. Confirm the pointer coordinates, semantic target, event type, and click count change.
6. Hold the verification receipt, drag it into the drop bay, and release. Confirm the drag offset and accepted-payload count change.
7. Right-click an active and inactive lab tab, a control, blank panel space, a floating-window body, and a minimized shelf item. Confirm each menu is target-specific, supports pointer and arrow-key selection, includes **Close menu**, closes with `Escape`, resize, or click-away, and never activates the surface beneath it.
8. Open **Layers**. Open modal, confirm, drawer, tooltip, palette, and toast in turn; close each with `Escape` or its visible affordance. Resize the modal to the minimum supported viewport and confirm the accented-character sentence wraps completely through its final `boundary.` marker. For the tooltip, click inside once and then outside. Confirm inside clicks do not dismiss it, outside clicks do, and the base flight deck never moves, shrinks, or disappears.
9. Resize across 80 and 120 columns. Confirm the header reads `COMPACT / single`, `MEDIUM / split`, and `WIDE / floating` at the corresponding widths without losing form, workflow, control, window, layered-surface, or receipt state. Active drags and context menus should cancel on resize rather than retaining stale hit geometry.
10. At 120+ columns, open **Windows**. Click workspace tabs and window chrome, then minimize, restore, maximize, enter fullscreen, and close or reopen an instrument. Confirm maximized content remains below the application header and above the shelf/status area, while fullscreen uses the complete viewport. Drag a window from blank titlebar space as well as its title text, then resize it from an edge and a corner. Confirm controls do not initiate drag and minimum bounds are enforced. Minimize an instrument, switch workspaces, then activate or right-click its shelf item and confirm the owning workspace becomes active.
11. Press `?` in at least two labs. Confirm the drawer title and instructions change with the current lab, then close it with `Escape`. Open **Smoke** and confirm all eleven receipts are checked.

## Automated smoke

```bash
pnpm --filter @celestial/demo-showcase typecheck
pnpm --filter @celestial/demo-showcase test
pnpm --filter @celestial/demo-showcase build
pnpm --filter @celestial/demo-showcase test:pty
```

The headless suite covers all three breakpoints, all 46 builder names, durable gallery state, Orbit workflow advancement, the five-package visual stack, live reduced-motion behavior, hover routing, direct radio and slider selection, modifier-aware table range selection, real Nexus drag/drop, evidence-backed smoke receipts, target-specific right-click menus, vertically clipped context-menu pointer mapping, click-away and resize cancellation, accessibility audit output, post-render mouse hit maps, cell-safe modal wrapping, layout-neutral layers, toast expiry behind modal surfaces, contextual help, full-titlebar window drag, edge/corner resize, inset-aware maximize/fullscreen geometry, all-workspace shelf recovery, and adaptive state preservation. The PTY test covers real process launch, the `F10` keyboard context-menu fallback, navigation across all eight labs, terminal resize, help, Escape, and clean quit. Pointer right-click selection and drag assertions stay in the deterministic headless suite because host PTY mouse behavior varies.
