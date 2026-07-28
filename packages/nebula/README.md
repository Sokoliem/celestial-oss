# @celestial/nebula

Elm Architecture + Signals TUI framework for TypeScript. The core runtime powering the Celestial ecosystem.

## Installation

Celestial is pre-release and not published to npm yet. Clone the monorepo, run the root install flow in [`README.md`](../../README.md), then use this package from a workspace app or example inside the repo.

## Overview

Nebula is the heart of Celestial. It implements the Elm Architecture (init/update/view/subscriptions) with a reactive signal system, providing predictable state management and efficient terminal rendering via cell-level VDOM diffing.

## Features

- **Elm Architecture** - Pure functional update loop with commands and subscriptions
- **Signal System** - Fine-grained reactivity with computed values and effects
- **VDOM Rendering** - Cell-level diffing, layout planning, and rasterization
- **Focus Management** - Keyboard navigation, focus groups (traps), tab cycling
- **Plugin System** - Extensible runtime via composable plugins
- **Accessibility** - ARIA roles, screen reader announcements, focus indicators
- **Cell Shaders** - Programmable post-processing pipeline (blur, vignette, shadows, etc.)
- **Keybindings** - Modal keybinding system with chord sequences and layers
- **Optimistic Updates** - Pure-state optimistic UI patterns
- **Compositor** - Layout transition animations via tweens and springs
- **Error Boundaries** - Catch render/update errors with fallback views and recovery
- **Middleware** - Message processing pipeline (undo, persist, debounce, throttle)
- **Profiler** - Render timing, frame budget tracking, structured tracing
- **Scroll Driver** - Momentum scrolling, snap points, virtual viewport, scroll indicators
- **Breakpoint Context** - Reactive responsive breakpoints via signals
- **Automation** - VNode metadata, accessibility and painted interaction audits, text extraction
- **Clipboard** - OSC 52 clipboard copy/paste, bracketed paste mode
- **Crash Recovery** - Automatic terminal state restoration on crash/signal
- **Config Loading** - Adapter-based source precedence with explicit failure diagnostics
- **Pointer Shapes** - Typed region cursors with topmost-hit resolution, drag/resize capture, host callbacks, and conservative OSC 22 projection

`event()` and `region()` derive baseline hover, click, drag, and scroll
affordances from their handlers. Clickable regions receive a pointer cursor and
drag regions receive a grab cursor unless explicit metadata overrides those
defaults, keeping custom components consistent with packaged controls.

`auditInteractionTree()` validates the planned/clipped regions and final cells produced
by the same layout pass as the runtime. It checks safe consistent IDs and handler
tags, labels, positive hit geometry, handler/affordance agreement, actionable cursors, disabled
inertness, and 4.5:1 text or 3:1 glyph-only contrast. Automation snapshots run
the audit automatically. Repeated responsive targets may share an ID when
their handler and metadata contracts agree; conflicting reuse is reported.
Standalone component and theme gates can supply
terminal dimensions and resolved default colors:

```typescript
const audit = auditInteractionTree(view, {
  width: 80,
  height: 24,
  defaultForeground: theme.colors.text,
  defaultBackground: theme.colors.surface,
});
```

## The Elm Architecture

```typescript
import { app, Cmd, Sub, text, column, type Msg } from '@celestial/nebula';

interface Model {
  count: number;
}

type AppMsg = Msg<'increment'> | Msg<'decrement'> | Msg<'quit'>;

app<Model, AppMsg>({
  init: () => [{ count: 0 }, Cmd.none()],

  update: (msg, model) => {
    switch (msg.type) {
      case 'increment':
        return [{ count: model.count + 1 }, Cmd.none()];
      case 'decrement':
        return [{ count: model.count - 1 }, Cmd.none()];
      case 'quit':
        return [model, Cmd.quit()];
    }
  },

  view: (model) => column(
    text(`Count: ${model.count}`),
    text('[+] increment  [-] decrement  [q] quit'),
  ),

  subscriptions: () => Sub.batch<AppMsg>(
    Sub.key('+', { type: 'increment' }),
    Sub.key('-', { type: 'decrement' }),
    Sub.key('q', { type: 'quit' }),
  ),
});
```

### AppConfig

```typescript
interface AppConfig<Model, M> {
  init: () => [Model, Cmd<M>];
  update: (msg: M, model: Model) => [Model, Cmd<M>];
  view: (model: Model) => VNode;
  subscriptions: (model: Model) => Sub<M>;
  shaders?: CellShader[] | ((model: Model) => CellShader[]);
}
```

### AppOptions

```typescript
interface AppOptions {
  terminal?: TerminalBackend;
  syncOutput?: boolean;
  crashLogPath?: string;
  disableCrashRecovery?: boolean;
  inline?: boolean | { height: number };
  commandHandlers?: Record<string, (payload: unknown) => Promise<unknown>>;
  accessibility?: AccessibilitySink;
  renderTracer?: RenderTracer;
  pointerCursor?: {
    osc22?: boolean | 'auto';
    onChange?: (cursor: PointerCursor) => void;
  };
}
```

Pointer-shape updates are deduplicated and reset when a terminal session exits,
suspends, or stops. Auto mode emits OSC 22 only for a conservatively detected
compatible terminal; GUI and embedded hosts can consume `onChange` regardless
of terminal support.

### AccessibilitySink

```typescript
interface AccessibilitySink {
  onFocusChange?(description: string, focusedId: string | null): void;
  onAnnouncements?(items: Announcement[]): void;
}
```

### AppHandle

```typescript
const handle = app(config, options);
handle.stop();
handle.suspend();
handle.resume();
```

## Signals

Signals use getter/setter tuples (not `.value` objects). Computed signals are getter functions. Effects return a dispose function.

```typescript
import { signal, computed, effect, batch, createSignalContext } from '@celestial/nebula';

const [getCount, setCount] = signal(0);

const doubled = computed(() => getCount() * 2);

const dispose = effect(() => {
  console.log(`Count is ${getCount()}`);
});
dispose();

batch(() => {
  setCount(1);
  setCount(2);
});
```

### Signal Context

Isolated signal graphs for test isolation or multi-instance apps:

```typescript
const ctx = createSignalContext();
const [get, set] = ctx.signal(42);
const derived = ctx.computed(() => get() * 2);
ctx.effect(() => console.log(derived()));
ctx.batch(() => set(99));
```

## View Elements

```typescript
import {
  text, row, column, box, scroll, focus, empty, component,
  animated, event, hover, imageEl, overlay, flex, link,
} from '@celestial/nebula';
```

### text(content, style?, opts?)

```typescript
text('Hello')
text(() => dynamicContent, style, { wrap: true })
text('Click me', undefined, { href: 'https://example.com' })
```

### row(...children)

```typescript
row(text('Left'), text('Right'))
```

### column(...children)

```typescript
column(text('Item 1'), text('Item 2'))
```

### box(child, style?, options?)

```typescript
import { border, style } from '@celestial/corona';

box(text('Card content'), style({ border: border.rounded }))
box(text('Fixed'), style({ padding: 1 }), { width: 40, height: 10 })
box(text('Responsive'), undefined, { width: { sm: 20, lg: 40 }, height: 10 })
box(text('Clipped'), undefined, { overflow: 'hidden' })
```

### scroll(child, options)

```typescript
scroll(column(...items), { height: 10 })
scroll(column(...items), { height: 10, offset: 3 })
```

### focus(id, child, options?)

```typescript
focus('btn-1', text('Click me'))
focus('input-1', text('Type here'), { focused: true })
focus('input-1', text('Type here'), { tabIndex: 1, group: 'modal' })
focus('input-1', text('Type here'), true)
```

### FocusOptions

```typescript
interface FocusOptions {
  focused?: boolean;
  tabIndex?: number;
  group?: string;
  echoHint?: EchoHint;
}
```

### empty(width?, height?)

```typescript
empty()
empty(10, 1)
```

### component(render, key?)

Lazy rendering with isolated signal scope:

```typescript
component(() => text('Rendered lazily'))
component(() => expensiveView(), 'stable-key')
```

### animated(id, child)

Wraps a VNode with a layoutId for compositor-driven layout animations:

```typescript
animated('card-1', box(text('Content')))
```

### event(id, child, handlers)

```typescript
event('my-btn', text('Click'), {
  onClick: 'click-msg',
  onMouseEnter: 'hover-msg',
  onRightClick: 'right-click-msg',
})
```

### hover(id, child, hovered?)

```typescript
hover('item', (isHovered) => text(isHovered ? '> Active' : '  Item'), model.hovered)
hover('item', text('Static item'), false)
```

### imageEl(content, width, height, opts?)

```typescript
imageEl(kittyImage, 40, 10)
imageEl(sixelData, 40, 10, { raw: true })
```

### overlay(child, options)

Absolute-positioned overlay on top of base content:

```typescript
overlay(text('Tooltip'), { x: 10, y: 5, zIndex: 10 })
overlay(text('Panel'), { x: 0, y: 0, width: 30, height: 10, transparent: true })
overlay(dialog, { x: 8, y: 4, zIndex: 100, focusMode: 'modal' })
```

`focusMode` aligns keyboard ownership with visual stacking. Use `passive` for
tooltips and notifications, `active` for the selected non-modal layer,
`modal` for a focus-owning blocking surface, and `blocked` for a blocking
surface that must expose no keyboard target. Omit it for legacy document-order
focus collection. `portal()` accepts the same option.

### flex(child, opts?)

Proportional sizing inside row/column:

```typescript
row(
  flex(text('A'), { flex: 1 }),
  flex(text('B'), { flex: 2, minWidth: 10 }),
  flex(text('C'), { flex: 1, maxWidth: 20 }),
)
```

### link(url, label, style?)

OSC 8 terminal hyperlink:

```typescript
link('https://example.com', 'Click me')
```

## Commands

```typescript
import { Cmd, type Result } from '@celestial/nebula';
```

| Method | Description |
|--------|-------------|
| `Cmd.none()` | No-op command |
| `Cmd.quit()` | Exit the application |
| `Cmd.batch(...cmds)` | Run commands concurrently |
| `Cmd.sequence(...cmds)` | Run commands in order |
| `Cmd.perform(task, toMsg)` | Async task, result mapped to message |
| `Cmd.attempt(task, toMsg)` | Async task with `Result<T, E>` error handling |
| `Cmd.fetch(url, options, toMsg)` | Fetch URL, deliver JSON as `Result<T, Error>` |
| `Cmd.map(cmd, fn)` | Transform a command's message type |
| `Cmd.sendToAgent(agentId, message, toMsg?)` | Send message to MCP agent |
| `Cmd.toMachine(registry, machineId, event)` | Send event to Phase state machine |
| `Cmd.custom(tag, payload, toMsg?)` | Custom command (handler in `AppOptions.commandHandlers`) |
| `Cmd.announce(message, priority?, toMsg?)` | Screen reader announcement |
| `Cmd.pushFocusGroup(group)` | Restrict focus navigation to a group |
| `Cmd.popFocusGroup()` | Pop the topmost focus group |

```typescript
Cmd.perform(
  (signal) => fetchData(signal),
  (data) => ({ type: 'loaded', data }),
)

Cmd.attempt(
  (signal) => riskyOperation(signal),
  (result) => result.ok
    ? { type: 'success', value: result.value }
    : { type: 'error', error: result.error },
)

Cmd.fetch<User[]>('/api/users', {}, (result) => ({ type: 'users', result }))
```

## Subscriptions

```typescript
import { Sub } from '@celestial/nebula';
```

| Method | Description |
|--------|-------------|
| `Sub.none()` | No subscriptions |
| `Sub.batch(...subs)` | Combine subscriptions |
| `Sub.key(key, msg)` | Key press maps to a message value |
| `Sub.keyWithModifiers(key, mods, msg)` | Key + modifiers maps to a message value |
| `Sub.keyEvent(toMsg)` | Parsed key events with modifiers (callback form) |
| `Sub.timer(ms, toMsg)` | Periodic timer (accepts callback or message value) |
| `Sub.resize(toMsg)` | Terminal resize `(cols, rows) => M` |
| `Sub.mouse(toMsg)` | Mouse events |
| `Sub.elementMouse(toMsg)` | Element-scoped mouse events |
| `Sub.focus(toMsg)` | Focus changes `(focusedId: string \| null) => M` |
| `Sub.layout(ids, toMsg)` | Computed layout rects from previous frame |
| `Sub.paste(toMsg)` | Bracketed paste events |
| `Sub.animationFrame(toMsg)` | 60fps frames, callback receives `FrameInfo` |
| `Sub.agent(config)` | MCP agent connection |
| `Sub.phase(config)` | Phase state machine |
| `Sub.stream(config)` | External event source (streams, sockets, file watchers) |
| `Sub.map(sub, fn)` | Transform message type |
| `Sub.debounce(sub, ms)` | Delay until events settle |
| `Sub.throttle(sub, ms)` | At most one message per ms |
| `Sub.filter(sub, predicate)` | Only deliver matching messages |
| `Sub.distinct(sub, equals?)` | Deduplicate consecutive equal messages |

```typescript
Sub.key('Enter', { type: 'submit' })
Sub.keyEvent((event) => ({ type: 'key', key: event.key, ctrl: event.ctrl }))
Sub.timer(1000, () => ({ type: 'tick' }))
Sub.animationFrame((info) => ({ type: 'frame', frame: info.frame, delta: info.delta }))
```

### StreamSource

The object returned by the `setup` function passed to `Sub.stream()`. The runtime calls `onData` once to register a callback, and `teardown` when the subscription is removed.

```typescript
interface StreamSource {
  onData: (cb: (data: unknown) => void) => void;
  teardown: () => void;
}
```

```typescript
Sub.stream({
  id: 'ws-connection',
  setup: () => {
    const ws = new WebSocket('ws://example.com');
    return {
      onData: (cb) => ws.onmessage = (e) => cb(e.data),
      teardown: () => ws.close(),
    };
  },
  toMsg: (data) => ({ type: 'wsData', data }),
})
```

### FrameInfo

```typescript
interface FrameInfo {
  readonly frame: number;
  readonly timestamp: number;
  readonly delta: number;
}
```

### Result

```typescript
type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
```

### Msg

```typescript
type Msg<'quit'>                     => { readonly type: 'quit' }
type Msg<'set', { v: number }>       => { readonly type: 'set'; v: number }
```

## VNode Types

VNodes use `kind` as the discriminant field:

```typescript
type VNode =
  | TextNode     // kind: 'text'
  | RowNode      // kind: 'row'
  | ColumnNode   // kind: 'column'
  | BoxNode      // kind: 'box'
  | ScrollNode   // kind: 'scroll'
  | FocusNode    // kind: 'focus'
  | EmptyNode    // kind: 'empty'
  | ComponentNode // kind: 'component'
  | EventNode    // kind: 'event'
  | HoverNode    // kind: 'hover'
  | ImageNode    // kind: 'image'
  | OverlayNode  // kind: 'overlay'
  | FlexNode     // kind: 'flex'
```

## VDOM Pipeline

```typescript
import { measure, layout, planLayout, rasterize } from '@celestial/nebula';

const size = measure(vnode, 80);
const grid = layout(vnode, 80, 24);
const plan = planLayout(vnode, 80, 24);
const renderedGrid = rasterize(plan);
```

- `measure(node, containerWidth?)` - Measure natural size `{ width, height }`
- `planLayout(node, width, height)` - Compute positions without painting
- `rasterize(plan)` - Paint LayoutPlan into CellGrid
- `layout(node, width, height)` - Convenience: planLayout + rasterize

## Focus Management

```typescript
import {
  createFocusState, focusNext, focusPrev, focusById,
  pushFocusGroup, popFocusGroup, collectFocusNodes,
  applyFocusToTree, type FocusState,
} from '@celestial/nebula';

let state: FocusState = createFocusState();

state = focusNext(state);
state = focusPrev(state);
state = focusNext(state, focusNodes);
state = focusPrev(state, focusNodes);
state = focusById(state, 'input-2');
state = pushFocusGroup(state, 'modal');
state = popFocusGroup(state);
state.groups; // string[] — stack of active focus groups (for modal traps)

const patched = applyFocusToTree(vnode, state.currentId);
const nodes = collectFocusNodes(vnode);
```

## Plugins

```typescript
import { withPlugins, createPlugin, loggerPlugin, debugPlugin } from '@celestial/nebula';

const myPlugin = createPlugin<Model, Msg>('my-plugin', {
  onInit: (model) => { },
  beforeUpdate: (msg, model) => { },
  afterUpdate: (msg, prevModel, nextModel) => { },
  wrapView: (view) => (model) => view(model),
});

app(withPlugins(config, [
  loggerPlugin({ filter: (msg) => msg.type !== 'tick', output: (msg, model) => console.log(msg, model) }),
  debugPlugin({ logUpdates: true }),
  myPlugin,
]));
```

### Plugin Hooks

`createPlugin(name, hooks)` accepts a hooks config object with these optional fields:

```typescript
interface PluginHooks<Model, M> {
  onInit?: (model: Model) => void;
  beforeUpdate?: (msg: M, model: Model) => void;
  afterUpdate?: (msg: M, prevModel: Model, nextModel: Model) => void;
  wrapView?: (view: (model: Model) => VNode) => (model: Model) => VNode;
}
```

## Resources (Async Data)

```typescript
import { idle, loading, success, error, mapResource, unwrapOr, type Resource } from '@celestial/nebula';

type Data = { name: string };

const initial: Resource<Data> = idle();
const pending: Resource<Data> = loading();
const loaded: Resource<Data> = success({ name: 'Alice' });
const failed: Resource<Data> = error(new Error('Failed'));

const upper = mapResource(loaded, (d) => d.name.toUpperCase());
const name = unwrapOr(loaded, 'fallback');
```

Pattern match with `resource.status`:

```typescript
function viewUser(user: Resource<Data>) {
  switch (user.status) {
    case 'idle': return text('No data');
    case 'loading': return text('Loading...');
    case 'success': return text(`Hello, ${user.data.name}`);
    case 'error': return text(`Error: ${user.error.message}`);
  }
}
```

## Error Boundaries

```typescript
import { errorBoundary, simpleErrorBoundary, type ErrorInfo } from '@celestial/nebula';

const guarded = errorBoundary(config, {
  fallbackView: (err, retryMsg) => column(
    text(`Error: ${err.message}`),
    text(`Phase: ${err.phase}`),
  ),
  retryMsg: { type: 'retry' },
  maxRetries: 3,
  onError: (err) => ({ type: 'errorReport', error: err }),
});

const simple = simpleErrorBoundary(config, { type: 'retry' });
```

## Middleware

```typescript
import {
  middlewares, createMiddlewarePipeline, undoMiddleware,
  persistMiddleware, logMiddleware, composeMiddleware, hookMiddleware,
} from '@celestial/nebula';

const pipeline = createMiddlewarePipeline(
  middlewares.logger(console.log),
  middlewares.debounce((msg) => msg.type === 'search', 300, dispatch),
  middlewares.throttle((msg) => msg.type === 'move', 16),
);

const messages = pipeline(msg, model);

const undo = undoMiddleware<Model, Msg>({
  isUndo: (m) => m.type === 'undo',
  isRedo: (m) => m.type === 'redo',
  maxHistory: 50,
  skip: (m) => m.type === 'cursorMove',
});
undo.getUndoState(); // UndoState<Model> | null
undo.setPresent(model); // externally push current model into undo stack

const persist = persistMiddleware<Model, Msg>('my-app');
const persistCustom = persistMiddleware<Model, Msg>('my-app', {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
});
persist.loadState(); // Model | null
persist.saveNow(model); // force-write

const log = logMiddleware<Model, Msg>({ filter: (m) => m.type !== 'tick' });
log.getLog(); // readonly LogEntry[]
log.clearLog();

const hook = hookMiddleware<Model, Msg>('my-hooks', {
  before: (msg, model) => { },
  after: (msg, model) => { },
});

const composed = composeMiddleware(undo, log);
```

## Optimistic Updates

```typescript
import {
  createOptimisticState, applyOptimistic, confirmOptimistic,
  rejectOptimistic, clearResolved, getPendingCount, getOp,
} from '@celestial/nebula';

let state = createOptimisticState<string>();
state = applyOptimistic(state, 'op-1', 'New value');
state = confirmOptimistic(state, 'op-1', 'Server value');
state = rejectOptimistic(state, 'op-2', new Error('Conflict'));
state = clearResolved(state);
getPendingCount(state);
getOp(state, 'op-1');
```

## Compositor

Layout transition animations between frames:

```typescript
import { createCompositor } from '@celestial/nebula';

const compositor = createCompositor({
  defaultTransition: { duration: 300 },
  overrides: new Map([['hero', { duration: 500 }]]),
});

const animatedPlan = compositor.update(plan);
compositor.isAnimating();
compositor.reset();
```

Compositor interpolation must preserve the full `LayoutEntry`, not just `id`, `node`, `rect`, and `children`.
Animated frames still need `resolvedStyle` and other layout metadata from the original plan. If a clone helper
rebuilds entries field-by-field instead of starting from `...entry`, styled overlays can render correctly on the
first frame and then fall back to monochrome during later animation ticks. Keep clone helpers metadata-safe and
add a compositor regression test whenever animation paths or overlay cloning are refactored.

## Breakpoint Context

Reactive responsive breakpoints via signals:

```typescript
import {
  createBreakpointContext, breakpointPlugin,
  DEFAULT_THRESHOLDS, resolveBreakpoint,
} from '@celestial/nebula';

const ctx = createBreakpointContext({ sm: 50, md: 100, lg: 140, xl: 180 });
ctx.current();              // Signal<BreakpointName>
ctx.size();                 // Signal<{ cols, rows }>
const isWide = ctx.isAtLeast('lg');
ctx.update(cols, rows);

const plugin = breakpointPlugin<Model, Msg>({ sm: 50, md: 100, lg: 140, xl: 180 });

resolveBreakpoint(120, DEFAULT_THRESHOLDS); // 'lg'
```

## Profiler

```typescript
import {
  createProfiler, createRenderTracer,
  measureRender, measureLayout, measureDiff, profilerPlugin,
} from '@celestial/nebula';

const profiler = createProfiler({
  frameBudget: 16,
  maxFrames: 120,
  tracing: true,
  onOverBudget: (frame) => console.warn(`Over budget: ${frame.totalDuration}ms`),
});

const tracer = profiler.tracer;
tracer.beginSpan('custom');
tracer.endSpan();
tracer.span('measure', () => expensiveOp());
tracer.getTrace();
tracer.resetTrace();

profiler.measure('op', () => {});
profiler.getStats();
profiler.getFrames();
profiler.reset();

app(withPlugins(config, [profilerPlugin(profiler)]));
```

## Keybindings

```typescript
import {
  createKeybindingState, processKey, setMode,
  pushLayer, popLayer, getActiveBindings,
  getPendingMatches, findConflicts, resetChord,
  toKeyChord, parseKeyString,
} from '@celestial/nebula';

const state = createKeybindingState([
  {
    id: 'save',
    keys: [toKeyChord('s', { ctrl: true })],
    action: { type: 'save' },
  },
  {
    id: 'quit',
    keys: [parseKeyString('ctrl+q')],
    action: { type: 'quit' },
    description: 'Quit the application',
  },
], { chordTimeoutMs: 500 });

const result = processKey(state, toKeyChord('s', { ctrl: true }), Date.now());
if (result.matched) {
  result.actions; // Msg[]
}

const inInsert = setMode(state, 'insert');
const withOverlay = pushLayer(state, { id: 'which-key', bindings: [...] });
const withoutOverlay = popLayer(withOverlay, 'which-key');
```

## Cell Shaders

Post-processing pipeline between rasterization and diffing:

```typescript
import { applyShaders, shaders, parseAnsiToRgb, rgbToFgAnsi, rgbToBgAnsi, cellToShaderCell, applyShaderOutput, createParseCache, glassShader } from '@celestial/nebula';

const grid = applyShaders(rasterizedGrid, plan, [
  shaders.dim(20),
  shaders.vignette(0.5),
  shaders.scanline(0.3),
  shaders.hueShift(180),
  shaders.tint([255, 0, 0], 0.3),
  shaders.invert(),
  shaders.grayscale(),
  shaders.blur(),
  shaders.mask((x, y, cols, rows) => {
    const dx = x / cols - 0.5, dy = y / rows - 0.5;
    return 1 - Math.sqrt(dx * dx + dy * dy) * 2;
  }),
  shaders.reveal(
    (x, y, cols, rows) => Math.max(Math.abs(x / cols - 0.5), Math.abs(y / rows - 0.5)) * 2,
    0.5,
  ),
  shaders.shadow(),
  shaders.autoStyle(),
  shaders.systemStyle(),
  glassShader(),
], { time: Date.now(), tick: 0, cols, rows, plan, custom: {} });

parseAnsiToRgb('\x1b[38;2;255;0;0m');
rgbToFgAnsi([255, 0, 0]);
```

| Factory | Signature | Description |
|---------|-----------|-------------|
| `shaders.systemStyle()` | `() => CellShader` | Combined shader applying elevation shadows and modern effects in a single pass |
| `shaders.autoStyle()` | `() => CellShader` | Applies style-driven effects: blur, opacity, glass tint, vignette, scanline, noise |
| `shaders.shadow()` | `() => CellShader` | Renders drop shadows for elements with `elevation` style attribute |
| `shaders.reveal(distanceFn, progress)` | `(fn, number) => CellShader` | Animated reveal — cells with `distanceFn(x,y,cols,rows) <= progress` become visible |
| `shaders.mask(shapeFn)` | `(fn: (x, y, cols, rows) => number) => CellShader` | Mask content to a shape; cells outside the shape are cleared |
| `shaders.dim(amount)` | `(amount: number) => CellShader` | Reduce lightness of fg/bg by `amount` percentage points (0-100) |
| `shaders.vignette(strength?, radius?)` | `(number?, number?) => CellShader` | Darken edges/corners with a vignette effect |
| `shaders.scanline(opacity?, spacing?)` | `(number?, number?) => CellShader` | Apply scanline darkening to every Nth row |
| `shaders.hueShift(degrees)` | `(number) => CellShader` | Rotate hue of fg/bg by `degrees` |
| `shaders.tint(tintColor, amount?)` | `(RGB, number?) => CellShader` | Blend fg/bg toward a target color |
| `shaders.invert()` | `() => CellShader` | Invert all color channels |
| `shaders.grayscale()` | `() => CellShader` | Convert to grayscale using luminance weights |
| `shaders.blur()` | `() => CellShader` | Average fg/bg with 4 cardinal neighbors (box blur) |

## Scroll Driver

```typescript
import {
  computeScrollInfo, computeIntersections, parallaxOffset,
  stickyPosition, createMomentumState, applyScrollDelta,
  tickMomentum, snapToNearest, generateSnapPoints,
  computeScrollIndicator, renderScrollIndicator,
  computeVirtualViewport, scrollTo, scrollBy, scrollToElement,
} from '@celestial/nebula';

const info = computeScrollInfo(offset, contentHeight, viewportHeight);
const entries = computeIntersections(elements, scrollOffset, viewportHeight);
parallaxOffset(scrollOffset, 0.5);
stickyPosition(elementY, scrollOffset, 0);

let momentum = createMomentumState();
momentum = applyScrollDelta(momentum, delta, timestamp, maxOffset);
momentum = tickMomentum(momentum, maxOffset);

const snap = snapToNearest(offset, snapPoints);
const indicator = computeScrollIndicator(offset, contentHeight, viewportHeight);
const chars = renderScrollIndicator(indicator, viewportHeight, { track: '│', thumb: '█' });

const viewport = computeVirtualViewport(items, itemHeight, scrollOffset, viewportHeight);
scrollTo(targetOffset, maxOffset);
scrollBy(currentOffset, -3, maxOffset);
scrollToElement(elementY, elementHeight, currentOffset, viewportHeight, maxOffset);
```

## Accessibility

```typescript
import {
  createAria, mergeAria, isInteractive, describeElement,
  isLiveRegion, role, ariaLabel, ariaDescribedBy, ariaLive,
  createLiveRegion, createAccessibilityRuntime,
  announce, focusIndicator, withFocusIndicator,
} from '@celestial/nebula';

createAria({ role: 'button', label: 'Save' });
mergeAria(base, { label: 'Updated' });
isInteractive({ role: 'button' });
describeElement({ role: 'navigation', label: 'Main Menu' });
role('dialog');
ariaLabel('Close button');
ariaDescribedBy('desc-id');
ariaLive('assertive');

const region = createLiveRegion();
region.announce('Item saved');
region.drain();
region.pending();
region.clear();

const runtime = createAccessibilityRuntime({ onFocusChange, onAnnouncements });
runtime.focusChanged('btn-1', 'button: Save');
runtime.announce('Done');
runtime.flush();

const indicator = focusIndicator('bracket');
withFocusIndicator('Save', true, indicator);
```

## Clipboard

```typescript
import {
  ClipboardCmd, osc52Copy, osc52PasteRequest,
  parseBracketedPaste, parseOsc52Response, fromBase64,
  BRACKETED_PASTE_ENABLE, BRACKETED_PASTE_DISABLE,
  BRACKETED_PASTE_START, BRACKETED_PASTE_END,
} from '@celestial/nebula';

osc52Copy('Hello, clipboard!');
osc52PasteRequest();
parseBracketedPaste(inputText);
fromBase64('SGVsbG8=');
```

### ClipboardCmd

Commands for clipboard operations using the OSC 52 protocol:

| Method | Signature | Description |
|--------|-----------|-------------|
| `ClipboardCmd.copyToClipboard(text, toMsg)` | `(string, (result: Result\<void, Error\>) => M) => Cmd<M>` | Copy text to the system clipboard |
| `ClipboardCmd.requestPaste(toMsg)` | `((result: Result\<string, Error\>) => M) => Cmd<M>` | Request clipboard contents; delivers pasted text on success |
| `ClipboardCmd.enableBracketedPaste(toMsg)` | `((result: Result\<void, Error\>) => M) => Cmd<M>` | Enable bracketed paste mode for paste detection |
| `ClipboardCmd.disableBracketedPaste(toMsg)` | `((result: Result\<void, Error\>) => M) => Cmd<M>` | Disable bracketed paste mode |

```typescript
Cmd.batch(
  ClipboardCmd.copyToClipboard('Hello!', (result) =>
    result.ok ? { type: 'copied' } : { type: 'copyError', error: result.error }
  ),
  ClipboardCmd.requestPaste((result) =>
    result.ok ? { type: 'pasted', text: result.value } : { type: 'pasteError' }
  ),
)
```

## Crash Recovery

```typescript
import { installCrashRecovery } from '@celestial/nebula';

const guard = installCrashRecovery({
  terminal,
  getModel: () => model,
  crashLogPath: './crash.log',
});
guard.uninstall();
```

## Config Loading

`loadConfig` coordinates caller-owned readers without assuming a filesystem or
silently substituting defaults. Sources are listed from highest to lowest
precedence. Returning `undefined` means a source is absent; once a source
returns content, any read, parse, or validation failure is terminal and
reported.

```typescript
import { loadConfig, type ConfigValidation } from '@celestial/nebula';

interface ToolConfig {
  port: number;
}

const result = await loadConfig<ToolConfig>({
  precedence: 'first-listed-wins',
  sources: [
    { id: 'project-file', read: () => storage.readText('./tool.json') },
    { id: 'user-file', read: () => storage.readText(userConfigPath) },
  ],
  parse: (contents) => JSON.parse(contents) as unknown,
  validate: (candidate): ConfigValidation<ToolConfig> =>
    isToolConfig(candidate)
      ? { valid: true, value: candidate }
      : { valid: false, issues: ['port must be a positive integer'] },
  stageTimeoutMs: 5_000,
});

if (!result.ok) {
  reportDiagnostics(result.diagnostics);
}
```

Readers may be synchronous or return genuine `Promise` objects. Structural
thenables are treated as synchronous adapter values and rejected when they do
not satisfy that stage's result contract; Nebula never invokes an
attacker-owned `then` property. Nebula never imports Node
filesystem APIs; applications provide adapters appropriate to their platform.
Only `undefined` means a source is absent. Empty strings, `null`, malformed
content, and invalid configs are present failures and never fall through.

Successful validator values are detached into deeply frozen plain-data graphs.
Plain objects, dense arrays, and primitive values are supported; class
instances, functions, accessors, symbols, and stateful collections are rejected
as invalid adapter output. This makes a successful result immune to later
mutation of the validator's original object.

`stageTimeoutMs` independently bounds each read, parse, and validate wait. A
timeout stops the loader from waiting, but cannot cancel caller-owned work;
adapters remain responsible for cancellation and resource cleanup. If the
option is omitted, callers own the liveness guarantee for every adapter.
Malformed loader options reject the returned promise during construction.
Once options are accepted, source, parse, and validation failures are returned
as immutable diagnostic receipts.

## Machine Registry

Generic interface for managing stateful machine services:

```typescript
import { createMachineRegistry } from '@celestial/nebula';

const registry = createMachineRegistry();
registry.register('my-machine', entry);
registry.get('my-machine');
registry.has('my-machine');
registry.unregister('my-machine');
```

## Render Mask

Plugin that masks sensitive output (API keys, tokens):

```typescript
import { createOutputMaskPlugin, maskVNode, type OutputMaskOptions } from '@celestial/nebula';

const plugin = createOutputMaskPlugin({
  patterns: [/\bsecret=\S+/gi],
  replacement: '[redacted]',
});

const masked = maskVNode(vnode, { patterns: [/sk-\S+/g] });
```

## Dev Tools

```typescript
import { devPlugin, saveState, loadState, withStateRecovery } from '@celestial/nebula';

saveState(model);
const restored = loadState<Model>();
app({ ...config, init: withStateRecovery(config.init) });
app(withPlugins(config, [devPlugin({ watch: ['src/'] })]));
```

## Debug Plugin

```typescript
import { debugPlugin, type DebugOptions } from '@celestial/nebula';

debugPlugin({
  logUpdates: true,
  logRenders: true,
  logSubscriptions: true,
  output: (line) => console.log(line),
});
```

## Hit Regions

```typescript
import { collectHitRegions, type HitRegionInfo } from '@celestial/nebula';

const regions: HitRegionInfo[] = collectHitRegions(layoutPlan);
```

## Kitty Keyboard Protocol

```typescript
import { parseKittyKeyInput, isKittySequence, kittyKeyboard, KittyFlags } from '@celestial/nebula';

kittyKeyboard.enable(KittyFlags.DisambiguateEscape | KittyFlags.ReportEventTypes);
kittyKeyboard.disable();

if (isKittySequence(inputData)) {
  const event = parseKittyKeyInput(inputData);
}
```

## Win32 Input Bridge

```typescript
import { needsWin32InputBridge, createWin32InputBridge } from '@celestial/nebula';

if (needsWin32InputBridge()) {
  const bridge = createWin32InputBridge();
  bridge.stop();
}
```

## Terminal Backend

```typescript
import { createTerminal, type TerminalBackend, type KeyEvent } from '@celestial/nebula';

const term = createTerminal();
term.onInput((data: Buffer) => {});
term.onResize(() => {});
term.offInput(handler);
term.offResize(handler);
term.write(data);
term.enterRawMode();
term.exitRawMode();
const { cols, rows } = term.getSize();
```

## Automation

```typescript
import {
  getVNodeMeta, setVNodeMeta, extractAutomationTextRuns,
  buildAutomationSnapshot, auditA11yTree,
  createLensBridgeClientFromEnv, fingerprintAutomationSnapshot,
} from '@celestial/nebula';

setVNodeMeta(node, { testId: 'my-button', a11y: { role: 'button', label: 'Save' } });
getVNodeMeta(node);

const runs = extractAutomationTextRuns(grid);
const snapshot = buildAutomationSnapshot(vnode, grid, cols, rows);
const audit = auditA11yTree(vnode);
const hash = fingerprintAutomationSnapshot(snapshot);
const client = createLensBridgeClientFromEnv();
```

## Supporting Types

### Signal & SignalContext

```typescript
type Signal<T> = () => T;

interface SignalContext {
  signal<T>(initialValue: T): [Signal<T>, (newValue: T) => void];
  computed<T>(fn: () => T): Signal<T>;
  effect(fn: () => void | (() => void)): () => void;
  batch(fn: () => void): void;
}
```

### RecoveryStrategy & ErrorBoundaryOptions

```typescript
type RecoveryStrategy = 'retry' | 'reset' | 'fallback';

interface ErrorBoundaryOptions<M> {
  fallbackView: (error: ErrorInfo, retry: M) => VNode;
  retryMsg: M;
  isRetry?: (msg: M) => boolean;
  onError?: (error: ErrorInfo) => M;
  maxRetries?: number;
}
```

### DevOptions

```typescript
interface DevOptions {
  watch?: string[];
  debounceMs?: number;
  onFileChange?: (path: string) => void;
  showNotification?: boolean;
}
```

### LayoutRects, KeyModifiers, ElementMouseEvent

```typescript
interface LayoutRects {
  readonly rects: ReadonlyMap<string, LayoutRect>;
}

interface KeyModifiers {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

interface ElementMouseEvent {
  handlerTag: string;
  elementId: string;
  phase: 'capture' | 'target' | 'bubble';
  targetId: string;
  currentTargetId: string;
  path: readonly string[];
  x: number;
  y: number;
  button: 0 | 1 | 2 | 'none';
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  stopPropagation(): void;
  isPropagationStopped(): boolean;
}
```

### FocusNodeInfo & RenderTracer

```typescript
interface FocusNodeInfo {
  id: string;
  tabIndex: number;
  group?: string;
  focused?: boolean;
  echoHint?: EchoHint;
}

interface RenderTracer {
  beginSpan(name: string): void;
  endSpan(): void;
  span<T>(name: string, fn: () => T): T;
  getTrace(): RenderTraceSpan | null;
  resetTrace(): void;
}
```

### Plugin

```typescript
interface Plugin<Model, M> {
  readonly name: string;
  wrap?: (config: AppConfig<Model, M>) => AppConfig<Model, M>;
}
```

### cmdKind & subKind

Runtime helpers for extracting the internal kind descriptor from a command or subscription:

```typescript
function cmdKind<M>(cmd: Cmd<M>): CmdKind<M>;
function subKind<M>(sub: Sub<M>): SubKind<M>;
```

### Profiler Types

```typescript
interface ProfilerOptions {
  frameBudget?: number;
  maxFrames?: number;
  onOverBudget?: (frame: FrameProfile) => void;
  tracing?: boolean;
}

interface ProfileSample {
  readonly name: string;
  readonly startTime: number;
  readonly duration: number;
}

interface FrameProfile {
  readonly frameNumber: number;
  readonly totalDuration: number;
  readonly samples: readonly ProfileSample[];
  readonly overBudget: boolean;
  readonly trace?: RenderTraceSpan;
}

interface ProfilerStats {
  readonly totalFrames: number;
  readonly averageFrameTime: number;
  readonly maxFrameTime: number;
  readonly minFrameTime: number;
  readonly overBudgetCount: number;
  readonly overBudgetPercent: number;
}

interface Profiler {
  startMeasure(name: string): void;
  endMeasure(name: string): ProfileSample | null;
  measure<T>(name: string, fn: () => T): T;
  beginFrame(): void;
  endFrame(): FrameProfile;
  getStats(): ProfilerStats;
  getFrames(): readonly FrameProfile[];
  reset(): void;
  readonly frameBudget: number;
  readonly tracer: RenderTracer | null;
}
```

### Middleware Types

```typescript
interface Middleware<Model, M> {
  readonly name: string;
  process(msg: M, model: Model): M | M[] | null;
}

interface UndoConfig<M> {
  isUndo: (msg: M) => boolean;
  isRedo: (msg: M) => boolean;
  maxHistory?: number;
  skip?: (msg: M) => boolean;
}

interface UndoState<Model> {
  past: Model[];
  present: Model;
  future: Model[];
}

interface PersistStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface LogEntry<M, Model> {
  msg: M;
  model: Model;
  timestamp: number;
}
```

### Compositor Types

```typescript
interface LayoutTransitionConfig {
  duration: number;
  easing?: EasingFn;
  spring?: { stiffness: number; damping: number; mass?: number };
}

interface CompositorOptions {
  defaultTransition?: LayoutTransitionConfig;
  overrides?: Map<string, LayoutTransitionConfig>;
}

interface Compositor {
  update(newPlan: LayoutPlan, now?: number): LayoutPlan;
  isAnimating(): boolean;
  reset(): void;
}
```

### Shader Types

```typescript
type RGB = [number, number, number];

interface ShaderCell {
  readonly char: string;
  readonly fg: RGB | null;
  readonly bg: RGB | null;
  readonly bold: boolean;
  readonly dim: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strikethrough: boolean;
  readonly tint: RGB | null;
  readonly style: ResolvedStyleAttrs;
}

interface ShaderOutput {
  char?: string;
  fg?: RGB | null;
  bg?: RGB | null;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

interface ShaderUniforms {
  readonly time: number;
  readonly tick: number;
  readonly cols: number;
  readonly rows: number;
  readonly plan: LayoutPlan;
  readonly custom: Record<string, unknown>;
}

type NeighborFn = (dx: number, dy: number) => ShaderCell | null;

type ShaderFn = (
  x: number, y: number, cell: ShaderCell,
  uniforms: ShaderUniforms, neighbors: NeighborFn,
) => ShaderOutput | null;

interface CellShader {
  readonly name: string;
  readonly fn: ShaderFn;
  readonly regions?: string[];
  readonly processOpaque?: boolean;
  readonly enabled?: boolean;
}

interface ParseCache {
  get(ansi: string | undefined): RGB | null;
  clear(): void;
}
```

### Scroll Driver Types

```typescript
interface ScrollInfo {
  offset: number;
  maxOffset: number;
  progress: number;
  viewportHeight: number;
}

interface IntersectionEntry {
  id: string;
  y: number;
  height: number;
  ratio: number;
  isIntersecting: boolean;
}

interface MomentumState {
  velocity: number;
  offset: number;
  lastTimestamp: number;
  isAnimating: boolean;
}

interface SnapPoint {
  offset: number;
  id?: string;
}

interface ScrollIndicator {
  trackStart: number;
  trackEnd: number;
  thumbStart: number;
  thumbEnd: number;
  thumbSize: number;
  visible: boolean;
}

interface VirtualViewport<T> {
  visibleItems: Array<{ item: T; index: number }>;
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  offsetBefore: number;
  offsetAfter: number;
}
```

### Keybinding Types

```typescript
interface KeyChord {
  readonly key: string;
  readonly ctrl?: boolean;
  readonly alt?: boolean;
  readonly shift?: boolean;
}

interface Keybinding<M> {
  readonly id: string;
  readonly keys: readonly KeyChord[];
  readonly action: M;
  readonly mode?: string;
  readonly description?: string;
  readonly priority?: number;
}

interface KeybindingLayer<M> {
  readonly id: string;
  readonly bindings: readonly Keybinding<M>[];
}

interface KeybindingState<M> {
  readonly mode: string;
  readonly layers: readonly KeybindingLayer<M>[];
  readonly pendingChord: readonly KeyChord[];
  readonly chordTimeoutMs: number;
  readonly chordStartTime: number;
}

type KeyResult<M> =
  | { readonly matched: true; readonly actions: M[]; readonly state: KeybindingState<M> }
  | { readonly matched: false; readonly pending: boolean; readonly state: KeybindingState<M> };
```

### Crash Recovery Types

```typescript
interface CrashRecoveryOptions {
  terminal: TerminalBackend;
  getModel?: () => unknown;
  crashLogPath?: string;
  writeFile?: (path: string, content: string) => void;
}

interface CrashRecoveryGuard {
  uninstall(): void;
}
```

### Agent / MCP Types

```typescript
type AgentEvent =
  | { readonly type: 'agent:connecting'; readonly agentId: string }
  | { readonly type: 'agent:connected'; readonly agentId: string; readonly serverInfo: McpServerInfo }
  | { readonly type: 'agent:disconnected'; readonly agentId: string; readonly reason?: string }
  | { readonly type: 'agent:error'; readonly agentId: string; readonly error: Error }
  | { readonly type: 'agent:thinking'; readonly agentId: string; readonly text: string }
  | { readonly type: 'agent:tool-call'; readonly agentId: string; readonly toolCall: ToolCall }
  | { readonly type: 'agent:tool-result'; readonly agentId: string; readonly toolCallId: string; readonly result: string; readonly isError: boolean }
  | { readonly type: 'agent:response'; readonly agentId: string; readonly content: string; readonly done: boolean }
  | { readonly type: 'agent:token-usage'; readonly agentId: string; readonly usage: TokenUsage }
  | { readonly type: 'agent:tools-available'; readonly agentId: string; readonly tools: readonly McpToolInfo[] };

interface AgentMessage {
  readonly role: 'user' | 'tool';
  readonly content: string;
  readonly toolCallId?: string;
}

type TransportConfig =
  | { readonly kind: 'stdio'; readonly command: string; readonly args?: readonly string[]; readonly cwd?: string; readonly env?: Record<string, string> }
  | { readonly kind: 'sse'; readonly url: string; readonly headers?: Record<string, string> }
  | { readonly kind: 'websocket'; readonly url: string; readonly auth?: string; readonly reconnect?: boolean; readonly reconnectInterval?: number };

interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffFactor: number;
}

interface McpServerInfo {
  readonly name: string;
  readonly version: string;
  readonly protocolVersion: string;
  readonly capabilities: Record<string, unknown>;
}

interface McpToolInfo {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: boolean | Record<string, unknown>;
}

interface AgentSubConfig<M> {
  readonly id: string;
  readonly transport: TransportConfig;
  readonly toMsg: (event: AgentEvent) => M;
  readonly retryPolicy?: RetryPolicy;
}

interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly result?: string;
  readonly status: 'pending' | 'running' | 'done' | 'error';
  readonly duration?: number;
}

interface TokenUsage {
  readonly prompt: number;
  readonly completion: number;
  readonly total: number;
  readonly limit: number;
}
```

### Machine Registry Types

```typescript
interface MachineRegistryEntry {
  start(): void;
  stop(): void;
  send(event: unknown): void;
  onTransition(listener: (state: unknown) => void): () => void;
  readonly running: boolean;
  readonly machineRef: unknown;
}

interface MachineRegistry {
  get(id: string): MachineRegistryEntry | undefined;
  register(id: string, entry: MachineRegistryEntry): void;
  unregister(id: string): void;
  has(id: string): boolean;
}
```

### Optimistic Update Types

```typescript
interface OptimisticOp<T = unknown> {
  readonly id: string;
  readonly optimisticValue: T;
  readonly pending: boolean;
  readonly confirmedValue?: T;
  readonly error?: Error;
}

interface OptimisticState<T = unknown> {
  readonly ops: ReadonlyMap<string, OptimisticOp<T>>;
}
```

### Breakpoint Types

```typescript
interface BreakpointContext {
  readonly current: Signal<BreakpointName>;
  readonly size: Signal<{ cols: number; rows: number }>;
  isAtLeast(name: BreakpointName): Signal<boolean>;
  update(cols: number, rows: number): void;
}

interface BreakpointPlugin<Model, M> extends Plugin<Model, M> {
  readonly context: BreakpointContext;
}
```

### VDOM Internal Types

```typescript
interface StyleAttrs {
  fg?: Responsive<string>;
  bg?: Responsive<string>;
  fgRgb?: Responsive<[number, number, number] | null>;
  bgRgb?: Responsive<[number, number, number] | null>;
  bold?: Responsive<boolean>;
  dim?: Responsive<boolean>;
  italic?: Responsive<boolean>;
  underline?: Responsive<boolean>;
  strikethrough?: Responsive<boolean>;
  effects?: Responsive<ResolvedStyleEffects>;
  elevation?: Responsive<number>;
  icon?: Responsive<string>;
  padding?: Responsive<number | [number, number] | [number, number, number, number]>;
}

interface ResolvedStyleAttrs {
  fg?: string;
  bg?: string;
  fgRgb?: [number, number, number] | null;
  bgRgb?: [number, number, number] | null;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  effects?: ResolvedStyleEffects;
  elevation?: number;
  icon?: string;
  padding?: number | [number, number] | [number, number, number, number];
}

type ResolvedStyleEffects = Omit<StyleEffects, 'tint'> & { tint?: string };

interface OverlayEntry {
  readonly zIndex: number;
  readonly entry: LayoutEntry;
  readonly transparent: boolean;
}

interface EventHandlers {
  readonly onClickCapture?: MouseHandler;
  readonly onClick?: MouseHandler;
  readonly onRightClickCapture?: MouseHandler;
  readonly onRightClick?: MouseHandler;
  readonly onMouseEnter?: string;
  readonly onMouseLeave?: string;
  readonly onMouseDownCapture?: MouseHandler;
  readonly onMouseDown?: MouseHandler;
  readonly onMouseUpCapture?: MouseHandler;
  readonly onMouseUp?: MouseHandler;
  readonly onMouseMoveCapture?: MouseHandler;
  readonly onMouseMove?: MouseHandler;
  readonly onScrollCapture?: MouseHandler;
  readonly onScroll?: MouseHandler;
}

// `MouseHandler = string | MouseModifierHandler` — pass a bare `string` for
// simple clicks, or a modifier map (at least one of default/shift/ctrl/alt/…)
// when behavior should branch on the held modifier keys. Double-click is
// detected via the nexus gesture recognizer (`processGesture`) rather than a
// dedicated `onDoubleClick` handler, so consumers can recognize triple-click
// and long-press on the same primitive.

interface LayoutPlan {
  readonly root: LayoutEntry;
  readonly index: Map<string, LayoutEntry>;
  readonly width: number;
  readonly height: number;
  readonly overlays: OverlayEntry[];
}

interface LayoutRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface LayoutEntry {
  readonly id: string;
  readonly node: VNode;
  readonly rect: LayoutRect;
  readonly children: LayoutEntry[];
  readonly resolvedStyle?: ResolvedStyleAttrs;
}

interface CellGrid {
  cells: Cell[][];
  width: number;
  height: number;
  rawBlobs?: Map<string, { content: string; row: number; col: number; width: number; height: number }>;
}
```

`LayoutEntry` carries render-critical metadata in addition to geometry. Treat manual cloning as unsafe unless the
clone starts from the original entry and only overrides the fields that are intentionally changing.

### Win32 / Kitty Types

```typescript
interface Win32InputBridge {
  start(): boolean;
  onData(handler: (data: Buffer) => void): void;
  offData(handler: (data: Buffer) => void): void;
  onResize(handler: (cols: number, rows: number) => void): void;
  offResize(handler: (cols: number, rows: number) => void): void;
  onError(handler: () => void): void;
  offError(handler: () => void): void;
  stop(): void;
  readonly running: boolean;
}

interface KittyKeyEvent {
  key: string;
  char?: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  eventType: 'press' | 'repeat' | 'release';
  baseKey: string;
}
```

### Automation Types

```typescript
interface VNodeMeta {
  testId?: string;
  a11y?: AriaAttrs;
}

interface AutomationTextRun {
  text: string;
  row: number;
  col: number;
  width: number;
  height: number;
  style?: StyleAttrs;
}

interface AutomationElementSnapshot {
  id: string;
  text: string;
  row: number;
  col: number;
  width: number;
  height: number;
  role?: AriaRole;
  a11y?: AriaAttrs;
  testId?: string;
  focused: boolean;
  focusId?: string;
  hidden?: boolean;
  selected?: boolean;
  expanded?: boolean;
}

interface AutomationActionSnapshot {
  id: string;
  label: string;
  text: string;
  row: number;
  col: number;
  width: number;
  height: number;
  role?: AriaRole;
  a11y?: AriaAttrs;
  testId?: string;
  focusId?: string;
  focused: boolean;
  selected?: boolean;
  expanded?: boolean;
  source: 'focus' | 'role';
}

interface AutomationSnapshot {
  text: string;
  size: { cols: number; rows: number };
  elements: AutomationElementSnapshot[];
  actions: AutomationActionSnapshot[];
  focusedActionId: string | null;
  audit: AutomationA11yAuditResult;
}

type AutomationA11yRuleName =
  | 'interactive-elements-have-labels'
  | 'focus-visible'
  | 'live-regions-have-politeness'
  | 'heading-levels-sequential'
  | 'color-contrast';

interface AutomationA11yViolation {
  rule: AutomationA11yRuleName;
  message: string;
  element: string;
  severity: 'error' | 'warning';
}

interface AutomationA11yAuditResult {
  violations: AutomationA11yViolation[];
  passes: AutomationA11yRuleName[];
}

interface LensBridgeClient {
  publish(snapshot: AutomationSnapshot): void;
  close(): void;
}
```

### Accessibility Types

```typescript
type AriaRole =
  | 'main' | 'navigation' | 'banner' | 'complementary' | 'form' | 'search'
  | 'alert' | 'dialog' | 'status' | 'log' | 'list' | 'listitem'
  | 'menu' | 'menuitem' | 'tab' | 'tabpanel' | 'tree' | 'treeitem'
  | 'button' | 'textbox' | 'heading' | 'region';

interface AriaAttrs {
  role?: AriaRole;
  label?: string;
  description?: string;
  describedBy?: string;
  live?: 'polite' | 'assertive' | 'off';
  hidden?: boolean;
  expanded?: boolean;
  selected?: boolean;
  checked?: boolean | 'mixed';
  level?: number;
  valueNow?: number;
  valueMin?: number;
  valueMax?: number;
}

type AnnouncePriority = 'polite' | 'assertive';

interface Announcement {
  readonly message: string;
  readonly priority: AnnouncePriority;
  readonly timestamp: number;
}

interface AccessibilityRuntime {
  focusChanged(focusedId: string | null, description: string): void;
  announce(message: string, priority?: AnnouncePriority): void;
  flush(): void;
  pending(): readonly Announcement[];
  liveRegion(): LiveRegion;
}

interface LiveRegion {
  announce(message: string, priority?: AnnouncePriority): void;
  drain(): Announcement[];
  pending(): readonly Announcement[];
  clear(): void;
}

interface FocusIndicatorStyle {
  readonly char: string;
  readonly prefix: string;
  readonly suffix: string;
}
```

## Related Packages

- **@celestial/corona** - Styling and colors
- **@celestial/aurora** - Animation (tweens, springs, easing)
- **@celestial/core** - Recommended facade for Nebula and the preview foundations
- **@celestial/gravity** - Flexbox, grid, responsive layout
- **@celestial/nexus** - Mouse tracking, hit regions, clipboard
- **@celestial/constellation** - UI components
- **@celestial/horizon** - Splits, tabs, floating windows
- **@celestial/telescope** - Testing utilities

## License

MIT
