import { focusNext, focusPrev } from '../focus.js';
import { createKeyInputDecoder, type KeyEvent } from '../terminal.js';
import type { MouseEventData, Sub } from '../types.js';
import { diff, type LayoutPlan, type LayoutRect, renderUpdates } from '../vdom.js';
import { applyFastEchoPatches, buildFastEchoPatches } from './fast-echo.js';
import { createTerminalInputProtocolDecoder, type TerminalInputEvent } from './input-protocol.js';
import type { RuntimeContext } from './runtime-context.js';
import { walkSubscriptionLeaves } from './subscription-walk.js';

export function installInput<Model, M>(ctx: RuntimeContext<Model, M>): void {
  const protocolDecoder = createTerminalInputProtocolDecoder();
  const keyDecoder = createKeyInputDecoder();
  let pendingKeyFlush: ReturnType<typeof setTimeout> | null = null;
  let pendingProtocolFlush: ReturnType<typeof setTimeout> | null = null;

  function maybeFastEcho(event: KeyEvent): void {
    const patches = buildFastEchoPatches(ctx.focusState.currentId, ctx.lastFocusNodes, ctx.lastLayoutPlan, ctx.prevGrid, event);
    if (!patches || patches.length === 0 || !ctx.prevGrid) return;
    const nextGrid = applyFastEchoPatches(ctx.prevGrid, patches);
    const updates = diff(ctx.prevGrid, nextGrid);
    if (updates.length === 0) return;
    ctx.terminal.write(renderUpdates(updates));
    ctx.prevGrid = nextGrid;
  }

  function dispatchKeyEvents(events: readonly KeyEvent[]): void {
    if (!ctx.running || ctx.suspended) return;
    for (const event of events) {
      maybeFastEcho(event);
      const subs = ctx.safeGetSubs();
      ctx.dispatchKeyEvent(subs, event);
      if (!ctx.running || ctx.suspended) return;

      // Key subscriptions are reconciled after raw decoded-key handlers so a
      // dismissal or mode change can update the active key map for this same
      // event. Match before Tab focus traversal so exact Tab bindings remain
      // observable without consuming the built-in focus move.
      const refreshedSubs = ctx.safeGetSubs();
      ctx.matchKeySub(refreshedSubs, event.key, event);
      if (!ctx.running || ctx.suspended) return;

      if (event.key === 'tab' && !event.ctrl && !event.alt) {
        ctx.focusState = event.shift ? focusPrev(ctx.focusState, ctx.lastFocusNodes) : focusNext(ctx.focusState, ctx.lastFocusNodes);
        ctx.dispatchFocusChange(ctx.safeGetSubs(), ctx.focusState.currentId);
        ctx.cancelScheduledRender();
        ctx.render();
      }
    }
  }

  function decodeKeyBytes(data: Buffer): void {
    if (pendingKeyFlush) {
      clearTimeout(pendingKeyFlush);
      pendingKeyFlush = null;
    }
    const events = keyDecoder.push(data);
    // A bare Escape is a complete, latency-sensitive dismissal action in the
    // application runtime. Terminals normally deliver modified-key/CSI input
    // as one chunk; consumers that need arbitrary chunk streaming can use the
    // exported decoder directly and choose their own ambiguity timeout.
    if (events.length === 0 && data.length === 1 && data[0] === 0x1b) {
      dispatchKeyEvents(keyDecoder.flush());
      return;
    }
    dispatchKeyEvents(events);
    if (keyDecoder.pendingBytes > 0) {
      pendingKeyFlush = setTimeout(() => {
        pendingKeyFlush = null;
        dispatchKeyEvents(keyDecoder.flush());
      }, 25);
      pendingKeyFlush.unref?.();
    }
  }

  function dispatchProtocolEvents(events: readonly TerminalInputEvent[]): void {
    if (!ctx.running || ctx.suspended) return;
    for (const inputEvent of events) {
      switch (inputEvent.type) {
        case 'keys':
          decodeKeyBytes(inputEvent.data);
          break;
        case 'clipboard': {
          const pendingRequest = ctx.pendingClipboardRequests.shift();
          pendingRequest?.({ ok: true, value: inputEvent.text });
          break;
        }
        case 'focus': {
          const subs = ctx.safeGetSubs();
          ctx.dispatchWindowFocus(subs, inputEvent.focused);
          break;
        }
        case 'mouse': {
          const subs = ctx.safeGetSubs();
          ctx.dispatchMouseEvent(subs, inputEvent.event);
          ctx.dispatchAutoElementMouse(subs, inputEvent.event);
          break;
        }
        case 'paste':
          if (ctx.pasteActive) {
            const subs = ctx.safeGetSubs();
            ctx.dispatchPasteEvent(subs, inputEvent.text);
          }
          break;
        case 'discarded':
          if (process.env.CELESTIAL_DEBUG_INPUT) {
            process.stderr.write(`[input] discarded incomplete ${inputEvent.protocol} frame\n`);
          }
          break;
      }
    }
  }

  ctx.handleInput = (data: Buffer): void => {
    if (!ctx.running || ctx.suspended) return;
    if (pendingProtocolFlush) {
      clearTimeout(pendingProtocolFlush);
      pendingProtocolFlush = null;
    }

    if (process.env.CELESTIAL_DEBUG_INPUT) {
      process.stderr.write(`[input] len=${data.length} hex=${data.toString('hex').slice(0, 60)} str=${JSON.stringify(data.toString('utf8').slice(0, 40))}\n`);
    }

    ctx.resetIdleTimers();
    if (data.length === 1 && data[0] === 0x1b && protocolDecoder.pendingBytes === 0) {
      dispatchProtocolEvents([{ type: 'keys', data }]);
      return;
    }
    dispatchProtocolEvents(protocolDecoder.push(data));

    if (protocolDecoder.pendingBytes > 0) {
      const delay = protocolDecoder.pendingKind === 'paste' ? 1000 : protocolDecoder.pendingKind === 'osc' ? 500 : 25;
      pendingProtocolFlush = setTimeout(() => {
        pendingProtocolFlush = null;
        dispatchProtocolEvents(protocolDecoder.flush());
      }, delay);
      pendingProtocolFlush.unref?.();
    }
  };

  ctx.dispatchPasteEvent = (sub: Sub<M>, text: string): void => {
    walkSubscriptionLeaves(ctx, sub, 'subscriptions', (kind, emit) => {
      if (kind.kind === 'paste') emit(kind.toMsg(text));
    });
  };

  ctx.dispatchKeyEvent = (sub: Sub<M>, event: KeyEvent): void => {
    walkSubscriptionLeaves(ctx, sub, 'subscriptions', (kind, emit) => {
      if (kind.kind === 'keyEvent') emit(kind.toMsg(event));
    });
  };

  ctx.dispatchMouseEvent = (sub: Sub<M>, event: MouseEventData): void => {
    walkSubscriptionLeaves(ctx, sub, 'subscriptions', (kind, emit) => {
      if (kind.kind === 'mouse') emit(kind.toMsg(event));
    });
  };

  ctx.dispatchResizeEvent = (sub: Sub<M>, cols: number, rows: number): void => {
    walkSubscriptionLeaves(ctx, sub, 'subscriptions', (kind, emit) => {
      if (kind.kind === 'resize') emit(kind.toMsg(cols, rows));
    });
  };

  installFeedbackDispatchers(ctx);
}

function installFeedbackDispatchers<Model, M>(ctx: RuntimeContext<Model, M>): void {
  ctx.dispatchFocusChange = (sub: Sub<M>, focusedId: string | null): void => {
    if (ctx.lastA11yFocusId !== focusedId) {
      ctx.lastA11yFocusId = focusedId;
      ctx.accessibilityRuntime.focusChanged(focusedId, focusedId === null ? 'Focus cleared' : `focus: ${focusedId}`);
    }

    walkSubscriptionLeaves(ctx, sub, 'subscriptions', (kind, emit) => {
      if (kind.kind === 'focus') emit(kind.toMsg(focusedId));
    });
  };

  ctx.dispatchWindowFocus = (sub: Sub<M>, focused: boolean): void => {
    walkSubscriptionLeaves(ctx, sub, 'subscriptions', (kind, emit) => {
      if (kind.kind === 'windowFocus') emit(kind.toMsg(focused));
    });
  };

  ctx.dispatchLayoutFeedback = (sub: Sub<M>, plan: LayoutPlan): void => {
    walkSubscriptionLeaves(ctx, sub, 'subscriptions', (kind, emit) => {
      if (kind.kind === 'layout') {
        const rects = new Map<string, LayoutRect>();
        for (const id of kind.ids) {
          const entry = plan.index.get(id);
          if (entry) {
            rects.set(id, entry.rect);
          }
        }
        emit(kind.toMsg({ rects }));
      }
    });
  };

  ctx.matchKeySub = (sub: Sub<M>, key: string, event: { ctrl: boolean; alt: boolean; shift: boolean }): void => {
    walkSubscriptionLeaves(ctx, sub, 'subscriptions', (kind, emit) => {
      if (kind.kind === 'key') {
        if (!event.ctrl && !event.alt && !event.shift && kind.key === key) {
          emit(kind.msg);
        }
      } else if (kind.kind === 'keyWithModifiers') {
        if (
          kind.key === key &&
          (kind.modifiers.ctrl ?? false) === event.ctrl &&
          (kind.modifiers.alt ?? false) === event.alt &&
          (kind.modifiers.shift ?? false) === event.shift
        ) {
          emit(kind.msg);
        }
      }
    });
  };
}
