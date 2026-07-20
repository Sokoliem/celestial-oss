# Celestial Flight Deck

The flagship demo for the reduced Celestial open-source preview. It combines the six `@celestial/core` foundations, all 27 curated `@celestial/ui` builders, Telescope testing, and Horizon beta window management in one offline, deterministic application.

```bash
pnpm demo:showcase
```

Use a terminal at least 70 columns wide and 32 rows tall. Below that minimum, the app shows a resize-required view while preserving the current lab, controls, windows, and smoke receipts. The app adapts at 80 and 120 columns:

- **Compact, below 80:** one lab at a time with right-side contextual drawers.
- **Medium, 80-119:** lab plus a live context split.
- **Wide, 120+:** mission rail and draggable Horizon floating instruments.

## Controls

- Mouse: hover any interactive control for an activation highlight; click labs, controls, smoke receipts, layer actions, workspace tabs, and window chrome; drag the Mouse-lab receipt, sliders, and any non-control area of floating-window titlebars; resize windows from any edge or corner at wide size.
- `1`-`6`: open Core, Components, Mouse, Layers, Windows, or Smoke.
- `[` / `]`: page the curated component gallery.
- `?`, `F1`, or `H`: open help for the current lab.
- `Ctrl+P`: open the command palette.
- `Escape`: dismiss the topmost modal, confirmation, drawer, tooltip, palette, toast, or help surface.
- `R`: reset the demo and its receipts. `Q` or `Ctrl+C`: quit.

## Manual smoke test

The Smoke lab records eight receipts. Complete them in this order:

1. Start in **Core** and confirm Atlas capability detection, Corona contrast and glyph resolution, Aurora motion, Nebula state/signals, Gravity layout, and the Nexus HitMap probe are visible.
2. Open **Components**, advance through all five pages, and confirm the pages account for all 27 public builders. On page 1, hover controls, click **Dense** directly, and click or drag the slider. On page 3, click one data-table row, Shift+click a later row, and confirm the inclusive range is highlighted with a `range N-M` receipt.
3. Open **Mouse**, move over and click the target. Then hold the verification receipt, drag it into the drop bay, and release. Confirm coordinates, semantic target, event type, click count, drag offset, and accepted-payload count change.
4. Open **Layers**. Open modal, confirm, drawer, tooltip, palette, and toast in turn; close each with `Escape` or its visible affordance. For the tooltip, click inside once and then outside. Confirm inside clicks do not dismiss it, outside clicks do, and the base flight deck never moves, shrinks, or disappears.
5. Press `?` in at least two labs. Confirm the drawer title and instructions change with the current lab, then close it with `Escape`.
6. Resize across 80 and 120 columns. Confirm the header reads `COMPACT / single`, `MEDIUM / split`, and `WIDE / floating` at the corresponding widths without losing state.
7. At 120+ columns, open **Windows**. Click workspace tabs and window chrome, then minimize, restore, maximize, and close or reopen an instrument.
8. Drag a floating window from blank titlebar space as well as its title text, then resize the same window from an edge and a corner. Confirm controls do not initiate drag, title and controls remain integrated inside one frame, and minimum bounds are enforced. Open **Smoke** and confirm all eight receipts are checked.

## Automated smoke

```bash
pnpm --filter @celestial/demo-showcase typecheck
pnpm --filter @celestial/demo-showcase test
pnpm --filter @celestial/demo-showcase build
pnpm --filter @celestial/demo-showcase test:pty
```

The headless suite covers all three breakpoints, all 27 builder names, hover routing, direct radio and slider selection, modifier-aware table range selection, real Nexus drag/drop, click-away shielding, accessibility audit output, post-render mouse hit maps, layout-neutral layers, contextual help, full-titlebar window drag, edge/corner resize, and adaptive state preservation. The minimal PTY test covers real process launch, lab navigation, terminal resize, help, Escape, and clean quit. PTY mouse encoding varies by host, so semantic mouse and drag assertions stay in the deterministic headless suite.
