# @celestial/horizon

Beta window and workspace management for Celestial terminal applications.

Horizon provides splits, tabs, floating windows, workspaces, snapping,
persistence, and mouse-driven resize/drag behavior. PTY hosting and advanced
view transitions remain experimental and are not part of the beta package.

## Managed window contracts

- `windowManagerUpdateResult()` returns the next immutable manager plus
  `accepted`, `changed`, and structured diagnostics. Use it when an application
  needs to distinguish a real lifecycle transition from a rejected command or
  semantic no-op. `windowManagerUpdate()` remains the model-only convenience
  wrapper.
- Minimized and hidden windows remember whether they should return to normal,
  maximized, or fullscreen mode. Activation also selects the window's workspace
  and restores it before focusing.
- Maximized windows occupy the manager work area, including all four configured
  insets. Fullscreen windows occupy the complete terminal viewport.
- Only windows in `activeWorkspaceId` are visible and hit-testable. Modal
  windows shield other managed windows, and z-order compaction preserves the
  normal, always-on-top, and modal layers.
- Persistence normalizes legacy snapshots into the current schema and preserves
  restore mode, frame, workspace, and lifecycle flags.

```typescript
import {
  createWindowManager,
  windowManagerUpdateResult,
  windowShelf,
  windowShelfActionFromEvent,
} from '@celestial/horizon';

let manager = createWindowManager(windows, {
  cols: 120,
  rows: 40,
  topInset: 2,
  bottomInset: 1,
});

const outcome = windowManagerUpdateResult(
  { type: 'minimize-window', id: 'logs' },
  manager,
);
manager = outcome.model;

const shelf = windowShelf({
  manager,
  width: 120,
  allWorkspaces: true,
});
```

`windowShelf()` is a stateless, conditional one-row recovery surface. It emits
encoded activate, context-menu, hover, leave, and overflow tags; route them with
`windowShelfActionFromEvent()` rather than parsing IDs. The same rule applies to
floating chrome: use `windowManagerMsgFromWindowEvent()` so IDs containing
delimiters round-trip safely.

## Pointer-owned window resizing

`windowManagerPointerUpdate()` composes managed-window geometry, pointer
capture, directional cursors, drag/resize constraints, focus, hover, release,
and cancellation. Hosts keep the returned state beside the manager and apply
raw pointer, Escape/blur cancellation, and viewport resize messages without
duplicating frame arithmetic:

```typescript
import {
  createWindowManagerPointerState,
  windowManagerPointerUpdate,
} from '@celestial/horizon';

let pointer = createWindowManagerPointerState(manager.bounds);
const result = windowManagerPointerUpdate(
  { type: 'pointer', event: mouseEvent },
  pointer,
  manager,
);
pointer = result.state;
manager = result.manager;
```

Integrated chrome reserves its visible controls from the draggable title
region. All eight frame edges use directional resize cursors; an active
interaction remains captured outside the frame and can be rolled back with
`{ type: 'cancel' }`.
