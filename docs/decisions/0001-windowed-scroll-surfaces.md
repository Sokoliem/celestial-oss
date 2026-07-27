# Decision 0001: Windowed scroll surfaces

- Status: Accepted
- Date: 2026-07-27
- Donor reference: `celestial@d2d23c79d14aba1e7214cf9c459d40dd06cdf328`
- Public package: `@celestial/ui`

## Context

The public package already exports a hardened, pure `virtual-scroll` kernel and
`list()` directs large-data callers to `virtualList()`. No public
`virtualList()` or `scrollbar()` builder exists, so applications must either
render unbounded lists or recreate wheel, keyboard, pointer, hover, selection,
and viewport math.

The donor repository contains prototypes for both builders. They establish the
product direction, but they do not meet the current public interaction
contract:

- overscan rows are rendered without a clipping boundary and can exceed the
  advertised viewport;
- pointer behavior is described but not wired into the descriptor;
- geometry and item collections are closed over at construction time;
- selection is index-based and drifts when items are replaced or reordered;
- host callbacks can throw through the Elm update loop;
- drag cancellation, malformed geometry, duplicate keys, empty collections,
  disabled rows, and stale leave events are not handled consistently.

## Decision

Reintroduce two framework-owned builders, adapted to the current public APIs:

1. `scrollbar()` is a persistent, cell-accurate controlled viewport control.
   It owns proportional thumb metrics, token-driven hover/active/focus states,
   wheel and keyboard parity, track paging, thumb dragging, global release,
   Escape rollback, responsive geometry synchronization, pointer cursors, and
   accessible numeric state.
2. `virtualList()` is a fixed-one-row windowed list built on
   `virtual-scroll.ts` and composed with `scrollbar()`. It owns exact viewport
   rendering, stable keyed focus and selection, disabled-row skipping,
   pointer/keyboard/wheel parity, replacement and append reconciliation,
   bottom-stickiness with an explicit unseen-item receipt, and callback
   isolation.

Both builders use message-driven synchronization instead of silently reading
mutated configuration. `virtualList()` requires stable keys. Replacements
reject duplicate keys before state changes, preserve focus and selection by
key, and treat only a strict old-key prefix as an append.

The first public version intentionally supports one terminal row per item. The
renderer therefore emits exactly `viewportRows` item slots and does not render
overscan outside a clip boundary. Variable-height rows require a measured
height index and are deferred rather than approximated.

The scrollbar remains persistent. Auto-hide is deferred because disappearing
scroll chrome conflicts with terminal discoverability and adds timer/motion
state without improving the core scrolling contract.

## Rejected alternatives

- Copy the donor files unchanged: rejected because their pointer, clipping,
  controlled-state, and failure-isolation behavior is incomplete.
- Publish only the pure kernel: rejected because it leaves interaction and
  visual consistency in every host application.
- Add variable-height rows now: rejected because terminal-cell measurement,
  replacement invalidation, and indexed seeking need a separate data
  structure and contract.
- Reuse `optionListView()` for large data: rejected because it filters and
  models options but renders a bounded option set rather than a window over a
  large keyed collection.
- Add copy/clipboard or transfer-list in this pass: rejected because neither
  closes an already documented public API gap as directly as windowed lists.

## Consequences and gates

- `@celestial/ui` grows by two builders and receives a minor changeset.
- The Flight Deck data-structures page must demonstrate both builders through
  public APIs and expose live offset/selection receipts.
- Unit tests must cover non-finite and oversized geometry, empty and
  all-disabled collections, duplicate keys, stale hover leaves, wheel
  boundaries, drag release/cancel outside the track, callback failures,
  replacement/reorder/shrink, sticky append behavior, accessibility metadata,
  and rendered-row bounds.
- The existing pointer/keyboard and wheel-parity ratchets, full preview gate,
  PTY traversal, and packed ESM/CommonJS consumer checks must remain green.
