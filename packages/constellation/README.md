# @celestial/ui

A curated set of 49 terminal UI component builders for the Celestial preview.

```ts
import { button, cardGrid, combobox, dataTable, indeterminateProgress, modal, popoverGroup, statusBar, textInput } from '@celestial/ui';
```

The package includes Unicode-safe form controls, navigation, data display,
feedback, and mouse-first layered surfaces. Context-menu composition helpers, popovers, and
hovercards expose Escape dismissal and visible close affordances where the
surface can remain open. Additional components remain outside this focused
preview until they meet the same release gates.

## The Celestial interaction contract

Celestial controls follow one behavior model across themes and surfaces:

- pointing reveals a visible token-driven hover state without activating the control;
- pointer and keyboard activation converge on the same update message and constraints;
- disabled options remain inert and keyboard/wheel navigation skips them;
- a wheel event belongs to the pointed viewport, while the next edit key returns an editor viewport to its cursor;
- stale leave events cannot clear a newer hover target, and host callback failures cannot corrupt the Elm update loop;
- event handlers automatically project baseline pointer and affordance metadata unless a component explicitly overrides it.

Component tests ratchet these rules alongside the package-wide pointer/keyboard
and wheel-parity suites. Application code should compose the public builders
instead of recreating hover, scrolling, or disabled-state behavior.

`virtualList()` closes the large-data path documented by `list()`. It renders
exactly one terminal row per visible keyed item, composes a persistent
`scrollbar()`, and reconciles focus and selection by key when items are
replaced:

```ts
import { text } from '@celestial/core';
import { virtualList } from '@celestial/ui';

const receipts = virtualList({
  items: auditReceipts,
  viewportRows: 8,
  selection: 'single',
  getKey: (receipt) => receipt.id,
  isDisabled: (receipt) => receipt.archived,
  renderItem: (receipt) => text(receipt.summary),
});
```

Use `vl-replace-items` for immutable collection changes and
`vl-sync-viewport` after a terminal resize. In `bottom-sticky` mode, strict
appends follow the tail only while the user remains anchored; otherwise the
model exposes `unseenCount` and a clickable jump receipt. The first public
version intentionally requires fixed one-row items.

Standalone `scrollbar()` uses `total`, `viewport`, and `trackLength` as
separate cell dimensions. It supports wheel, arrows, page keys, track paging,
thumb dragging with global release, Escape rollback, controlled scroll and
geometry messages, pointer cursor metadata, and accessible min/max/current
values.

Application shells can render a terminal-cell-accurate `statusBar` and compose
the canonical `helpView` inside an existing modal or drawer. Both derive from
the same executable `KeyBinding` list, including action categories, so help does
not require a second shortcut registry.

Toasts and the durable notification center project one immutable
`NotificationModel`. Inject the exact same store into both surfaces; the center
is a controlled composition helper rather than a second component-owned inbox:

```ts
import {
  createNotificationCenter,
  createNotificationStore,
  createToastManager,
} from '@celestial/ui';

const store = createNotificationStore();
const toasts = createToastManager({ store, dismissalOwner: 'host' });
const center = createNotificationCenter({
  store,
  ownsToastEscape: false,
  formatTimestamp: (timestamp) => new Date(timestamp).toISOString(),
  resolveAction: (actionId) => ({ label: actionId }),
});
```

`createNotificationCenter` measures variable-height rows, preserves selection
by notification and action ID, and emits action receipts for the host to resolve
through its command model. Explicit Escape ownership prevents composed surfaces
from dismissing two layers for one key press.

`createAppShell` is the optional headless coordinator for these composition
primitives. It requires one host-owned action registry and the exact shared
notification store, projects the registry into palette commands and canonical
keyboard help, and returns immutable receipts instead of executing host actions.
It has no `view()`; applications keep control of screen layout and rendering.
The shell owns one dismissal chain—confirmation, palette, help, notification
internals, notification center, then the latest toast—and always preserves one
unmodified Escape binding even when an additional close shortcut is configured.

Modal title rows include a pointer-accessible `[x]` control, and every modal
also retains Escape dismissal with a visible keyboard hint.

`dataTable({ resizableColumns: true })` owns controlled column widths, bounded
pointer dragging with global release, Escape rollback, Alt+Arrow keyboard
nudging, Ctrl+0 reset, immutable width callbacks, directional cursor metadata,
and accessible separator values. Per-column `minWidth`, `maxWidth`, and
`resizable` options refine the table-level policy.

Drawers may own action rows directly so hover, focus, and activation remain in
the descriptor's Elm state. Handle the emitted action id in the host update:

```ts
import { text } from '@celestial/core';
import { drawer } from '@celestial/ui';

const inspector = drawer({
  content: text('Release details'),
  actions: [{ id: 'publish', label: 'Publish preview', tone: 'success' }],
});

if (message.type === 'activate-action') {
  return publish(message.id, model);
}
```
