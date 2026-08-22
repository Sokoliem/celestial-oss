# @celestial/gravity

## 0.1.0-preview.2

### Minor Changes

- eca0f94: Add typed pointer-shape projection and harden resize interactions across windows,
  split panes, and data-table columns. Resize state now handles directional
  cursors, pointer capture, cancellation, keyboard parity, invalid inputs,
  constraints, persistence boundaries, and accessible separator metadata through
  framework-owned APIs.
- 062aeae: Harden terminal capability lifecycles, animation and responsive-layout boundaries, input protocols, direct runtime dispatch, mouse and clipboard fallbacks, beta window management, and the deterministic headless/PTY testing surface for the focused preview.

### Patch Changes

- 5a8168a: Enforce deterministic pointer feedback for actionable regions. Nebula now
  infers managed or calm, contrast-preserving text-cell hover contracts,
  preserves terminal-native style effects through shaders and snapshots, and
  audits every actionable non-spatial surface for visible hover behavior.

  Harden semantic hover faces for virtual lists, assisted inputs, range sliders,
  and popovers; repair context-menu token overrides for contrast; route Gravity
  splitters through the canonical event builder; and reserve minimized-window
  shelf rows through framework-owned shell and bounds helpers.

- 8089aaa: Export the uniform-windowing kernel from `@celestial/ui`. `createVirtualScrollState`, `getVisibleRange`, `virtualScrollUpdate`, `scrollToIndex` and their types were implemented, input-guarded and unit-tested, but never re-exported from the barrel, so no consumer could reach them. These are helpers rather than component builders, so the curated 46-builder count is unchanged.

  Fix a process-lifetime retention leak in `@celestial/gravity`'s scroll controller. Every controller created by `createScrollController` was appended to a module-level registry with no removal path, so a long-running app that builds lists dynamically retained one controller — and its measure cache — per list, forever. The registry is now a `Set`, and the new `disposeScrollController(controller)` removes an entry and releases its cache. Disposing twice is a no-op.

  Fix a silently collapsed scroll extent in `@celestial/gravity`'s virtual list. When the visible window was empty (`endIndex === 0`, reachable with a zero-height viewport and no overscan on the variable-size path), the below-spacer read `offsets[-1]`/`sizes[-1]` behind non-null assertions and evaluated to `NaN`. Because `NaN > 0` is false the spacer was dropped rather than rendered wrong, so the list reported zero scroll extent instead of the full content height.

- Updated dependencies [a723fb0]
- Updated dependencies [48dd7fd]
- Updated dependencies [3d47bc5]
- Updated dependencies [5a8168a]
- Updated dependencies [5a8168a]
- Updated dependencies [5a8168a]
- Updated dependencies [9407abc]
- Updated dependencies [eca0f94]
- Updated dependencies
- Updated dependencies [8914391]
- Updated dependencies [2776d8b]
- Updated dependencies [aea524d]
- Updated dependencies [9407abc]
- Updated dependencies [062aeae]
  - @celestial/corona@0.1.0-preview.2
  - @celestial/nebula@0.1.0-preview.2
  - @celestial/aurora@0.1.0-preview.2
