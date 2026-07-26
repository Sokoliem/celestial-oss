---
'@celestial/ui': minor
'@celestial/gravity': patch
---

Export the uniform-windowing kernel from `@celestial/ui`. `createVirtualScrollState`, `getVisibleRange`, `virtualScrollUpdate`, `scrollToIndex` and their types were implemented, input-guarded and unit-tested, but never re-exported from the barrel, so no consumer could reach them. These are helpers rather than component builders, so the curated 46-builder count is unchanged.

Fix a process-lifetime retention leak in `@celestial/gravity`'s scroll controller. Every controller created by `createScrollController` was appended to a module-level registry with no removal path, so a long-running app that builds lists dynamically retained one controller — and its measure cache — per list, forever. The registry is now a `Set`, and the new `disposeScrollController(controller)` removes an entry and releases its cache. Disposing twice is a no-op.

Fix a silently collapsed scroll extent in `@celestial/gravity`'s virtual list. When the visible window was empty (`endIndex === 0`, reachable with a zero-height viewport and no overscan on the variable-size path), the below-spacer read `offsets[-1]`/`sizes[-1]` behind non-null assertions and evaluated to `NaN`. Because `NaN > 0` is false the spacer was dropped rather than rendered wrong, so the list reported zero scroll extent instead of the full content height.
