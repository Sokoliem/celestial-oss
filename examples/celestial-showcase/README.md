# Celestial Flight Deck

The flagship demo for the focused Celestial open-source preview. It provides live or test-backed evidence for all 18 public packages and all 52 curated `@celestial/ui` builders in one offline, deterministic application. Its paged instruments cover the six `@celestial/core` foundations, Compass navigation, Rosetta locale/bidi behavior, Orbit forms/validation/prompts/wizards, Spectrum highlighting, Mirage effects, Nova transitions, Stellar charts, Pulsar Markdown, Telescope testing, and Horizon beta window, snap, tile, and session management. The `contextMenuView` state renderer is demonstrated separately from the 52 component builders.

```bash
pnpm demo:showcase
```

Use a terminal at least 70 columns wide and 32 rows tall. Below that minimum, the app shows a resize-required view while preserving the current lab, controls, windows, and smoke receipts. The app adapts at 80 and 120 columns:

- **Compact, below 80:** one lab at a time; the Windows lab keeps its front instrument live inline.
- **Medium, 80-119:** lab plus a live context split, including the front instrument in the Windows lab.
- **Wide, 120+:** mission rail and draggable Horizon floating instruments.

Minimized instruments appear in a labeled, taskbar-style shelf above the status
line at every breakpoint. The shelf includes every workspace: left-clicking an
item restores and focuses it in its owning workspace, while right-clicking opens
the same target-specific window menu used by floating content. The Windows lab's
**Open** and **Bring** actions place instruments in the active workspace so both
floating windows can remain visible together.

## Controls

- Mouse: hover any interactive control for an activation highlight; click labs, controls, smoke receipts, layer actions, workspace tabs, window chrome, and minimized shelf items; right-click labs, controls, windows, shelf items, or panel space for target-specific actions; drag the Mouse-lab receipt, sliders, and any non-control area of floating-window titlebars; resize windows from any edge or corner at wide size.
- `1`-`9`: open Core, Components, Workflows, Visuals, Mouse, Layers, Windows, Smoke, or App shell.
- `[` / `]`: page the active Components, Workflows, Visuals, or Windows instrument.
- `F` / `L` / `G` (Core lab only): open Core Foundations, Locale, or capability Ledger. The Ledger pages through its own Previous/Next controls.
- `V` (Workflows, Visuals, or Windows): cycle the live sample on the validation, prompt, motion, chart, snap, and tile instruments.
- `N` / `B`: advance the Orbit wizard (or restart it once finished) and step back, while its overview is visible.
- `?`: open help for the current lab. Labs 1-8 also accept `F1` or `H`; App shell exposes its canonical `?` binding from the executable shell registry.
- `Ctrl+P`: open the command palette.
- App shell: `G` / `J` / `B` navigate Compass history; `X` opens the modal confirmation; `S` loads the explicit Nebula config receipt and starts the abortable background verification, while `C` cancels it; `N` emits one shared notification; `I` opens its durable inbox. Its `?`, `Ctrl+P`, and `Escape` bindings come from the same executable shell registry shown by canonical help.
- `Shift+F10` (or `F10` in terminals that do not report Shift): open a context menu for the current lab.
- `Escape`: dismiss the topmost context menu, gallery menu sample, active drag, modal, confirmation, drawer, tooltip, palette, durable inbox/notification center, toast, or help surface.
- `R`: reset the demo and its receipts. `Q` or `Ctrl+C`: quit.

## Manual smoke test

The Smoke lab records thirteen receipts. Complete them in this order:

1. Start in **Core / Foundations** and confirm Atlas capability detection, Corona contrast and glyph resolution, Aurora tween and spring motion, Nebula state/signals, Gravity layout, and the Nexus HitMap probe are visible.
2. Open **Core / Locale**, change locales, and verify localized numbers, currency, dates, relative time, lists, bidi ordering, grapheme counts, and terminal-cell widths recompute. Confirm the `locale data` receipt reads `full ICU data`; on a Node build without full ICU it turns amber and the formatting receipts below it do too, because Intl falls back to English rather than failing. Open **Ledger** and page through all 18 public package receipts.
3. Open **Components**, advance through all nine pages, and confirm all 52 public builders appear. Exercise the 20 stateful gallery descriptors on pages 2-9 as well as the base inputs: grouped controls, autocomplete, combobox, date and multi-select inputs, numeric/range/rating/segmented/tag/color controls, option list, virtual list, standalone scrollbar, card grid, popover, popover group, hovercard, the AI tool-call card, and the cell-accurate status bar. Confirm state survives page changes.
4. Open **Workflows**. On the overview, switch density and advance the wizard. Page to **Typed validation** and cycle accepted/rejected email samples; then page to **Prompt descriptors** and cycle deterministic input, confirmation, single-select, and multi-select results.
5. Open **Visuals**. Page through Overview, Text + motion, Charts, and Markdown. Cycle Nova transitions and Stellar data, and verify Spectrum tokenization, Mirage effects, four chart renderers, Pulsar frontmatter/TOC/search/streaming, and reduced-motion behavior.
6. Open **Mouse**, move over and click the target. Confirm pointer coordinates, semantic target, event type, and click count change.
7. Hold the verification receipt, drag it into the drop bay, and release. Confirm the drag offset and accepted-payload count change.
8. Right-click an active and inactive lab tab, a control, blank panel space, a floating-window body, and a minimized shelf item. Confirm each menu is target-specific, supports pointer and arrow-key selection, includes **Close menu**, closes with `Escape`, resize, or click-away, and never activates the surface beneath it.
9. Open **Layers**. Exercise modal, confirmation, drawer, tooltip, palette, and toast; use the drawer's live actions; resize to the minimum viewport; and confirm visible close affordances, Escape, click-away shielding, and complete wrapped copy.
10. Resize across 80 and 120 columns. Confirm `COMPACT / single`, `MEDIUM / split`, and `WIDE / floating` representations preserve form, workflow, control, window, surface, and receipt state while stale drags and menus cancel.
11. At 120+ columns, open **Windows / Manager**. Bring both instruments into one workspace and exercise workspace tabs, chrome, dragging, resizing, minimize/restore, maximize/fullscreen, close/reopen, and the all-workspace taskbar shelf. Then open **Layout systems**, cycle snap zones and column/row tiling, and confirm bounded frames plus the `session round trip` and `restored panes` receipts — the session is serialized and reloaded, so those report whether the saved workspace actually survives transport — change without invisible floating-window hit targets.
12. Open **App shell** with `9`. Navigate to Jobs and back through the live Compass router, resolve the modal release confirmation, let one background task finish and confirm its explicit `workspace-config | 2 checked | first-listed-wins` Nebula receipt, then start and cancel a second task. Use the action palette and canonical keyboard help, and confirm the status bar, durable inbox, and toast projection all reflect the same shell state.
13. Press `?` in at least two labs. Confirm contextual instructions change, close help with `Escape`, then open **Smoke** and confirm all thirteen receipts are checked.

## Automated smoke

```bash
pnpm --filter @celestial/demo-showcase typecheck
pnpm --filter @celestial/demo-showcase test
pnpm --filter @celestial/demo-showcase build
pnpm --filter @celestial/demo-showcase test:pty
```

The headless suite enforces the machine-readable 18-package/52-builder ledger, all 52 builders across nine themes at compact and wide widths with zero painted interaction-audit violations, representative hover/selection/resize/drag/scroll states, persistent changes for every stateful gallery descriptor, real Compass/app-shell history and receipt coordination, explicit Nebula config precedence and terminal diagnostics, every Core/Workflow/Visual/Window sub-instrument, all three breakpoints, accessibility audits, semantic and raw pointer routing, Orbit state, reduced motion, Nexus drag/drop, smoke receipts, target-specific context menus, layered dismissal, complete wrapping, toast expiry, complete Horizon window/shelf/snap/tile/session behavior, runtime locale-data detection, and the session serialization round trip. The PTY test covers real process launch, the `F10` keyboard context-menu fallback, every lab, the natural `workspace-config | 2 checked | first-listed-wins` completion receipt followed by second-run task cancellation, app-shell navigation/modal/help/notification receipts, both Core sub-pages, every Workflows/Visuals/Windows deep instrument, the first Components page turn, terminal resize, contextual help, Escape, and clean quit. Host-dependent pointer gestures stay in the deterministic headless suite.
