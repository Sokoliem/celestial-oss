# @celestial/ui

A curated set of 47 terminal UI component builders for the Celestial preview.

```ts
import { button, cardGrid, combobox, dataTable, indeterminateProgress, modal, popoverGroup, statusBar, textInput } from '@celestial/ui';
```

The package includes Unicode-safe form controls, navigation, data display,
feedback, and mouse-first layered surfaces. Context-menu composition helpers, popovers, and
hovercards expose Escape dismissal and visible close affordances where the
surface can remain open. Additional components remain outside this focused
preview until they meet the same release gates.

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

Modal title rows include a pointer-accessible `[x]` control, and every modal
also retains Escape dismissal with a visible keyboard hint.

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
