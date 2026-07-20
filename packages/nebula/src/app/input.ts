import { StringDecoder } from 'node:string_decoder';
import { matchOsc52Response, parseBracketedPaste } from '../clipboard.js';
import { focusNext, focusPrev } from '../focus.js';
import { parseMouseInputFromBuffer } from '../mouse.js';
import { createKeyInputDecoder, type KeyEvent } from '../terminal.js';
import { type MouseEventData, type Sub, subKind } from '../types.js';
import { diff, type LayoutPlan, type LayoutRect, renderUpdates } from '../vdom.js';
import { applyFastEchoPatches, buildFastEchoPatches } from './fast-echo.js';
import type { RuntimeContext } from './runtime-context.js';
import { applySubMap } from './sub-map.js';

export function installInput<Model, M>(ctx: RuntimeContext<Model, M>): void {
  const inputTextDecoder = new StringDecoder('utf8');
  const keyDecoder = createKeyInputDecoder();
  let pendingKeyFlush: ReturnType<typeof setTimeout> | null = null;

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
      ctx.combinatorIdCounter = 0;
      ctx.dispatchKeyEvent(subs, event);

      if (event.key === 'tab' && !event.ctrl && !event.alt) {
        ctx.focusState = event.shift ? focusPrev(ctx.focusState, ctx.lastFocusNodes) : focusNext(ctx.focusState, ctx.lastFocusNodes);
        ctx.combinatorIdCounter = 0;
        ctx.dispatchFocusChange(subs, ctx.focusState.currentId);
        ctx.cancelScheduledRender();
        ctx.render();
        continue;
      }

      const refreshedSubs = ctx.safeGetSubs();
      ctx.combinatorIdCounter = 0;
      ctx.matchKeySub(refreshedSubs, event.key, event);
    }
  }

  function decodeKeyBytes(data: Buffer): void {
    if (pendingKeyFlush) {
      clearTimeout(pendingKeyFlush);
      pendingKeyFlush = null;
    }
    dispatchKeyEvents(keyDecoder.push(data));
    if (keyDecoder.pendingBytes > 0) {
      pendingKeyFlush = setTimeout(() => {
        pendingKeyFlush = null;
        dispatchKeyEvents(keyDecoder.flush());
      }, 25);
      pendingKeyFlush.unref?.();
    }
  }

  ctx.handleInput = (data: Buffer): void => {
    if (!ctx.running || ctx.suspended) return;
    let inputText = inputTextDecoder.write(data);
    if (inputText.length === 0) return;

    while (true) {
      const clipboardMatch = matchOsc52Response(inputText);
      if (!clipboardMatch) break;
      const pendingRequest = ctx.pendingClipboardRequests.shift();
      if (pendingRequest) {
        pendingRequest({ ok: true, value: clipboardMatch.text });
      }
      inputText = `${inputText.slice(0, clipboardMatch.start)}${inputText.slice(clipboardMatch.end)}`;
      if (!inputText) return;
    }

    if (process.env.CELESTIAL_DEBUG_INPUT) {
      process.stderr.write(`[input] len=${data.length} hex=${data.toString('hex').slice(0, 60)} str=${JSON.stringify(inputText.slice(0, 40))}\n`);
    }

    ctx.resetIdleTimers();

    while (true) {
      const focusEvent = ctx.parseWindowFocusEvent(inputText);
      if (!focusEvent) break;
      const subs = ctx.safeGetSubs();
      ctx.combinatorIdCounter = 0;
      ctx.dispatchWindowFocus(subs, focusEvent.focused);
      inputText = `${inputText.slice(0, focusEvent.start)}${inputText.slice(focusEvent.end)}`;
      if (!inputText) return;
    }

    const mouseEvent = parseMouseInputFromBuffer(data);
    if (mouseEvent) {
      const subs = ctx.safeGetSubs();
      ctx.combinatorIdCounter = 0;
      ctx.dispatchMouseEvent(subs, mouseEvent);
      ctx.combinatorIdCounter = 0;
      ctx.dispatchAutoElementMouse(subs, mouseEvent);
      return;
    }

    if (ctx.pasteActive) {
      const pastedText = parseBracketedPaste(inputText);
      if (pastedText !== null) {
        const subs = ctx.safeGetSubs();
        ctx.combinatorIdCounter = 0;
        ctx.dispatchPasteEvent(subs, pastedText);
        return;
      }
    }

    decodeKeyBytes(Buffer.from(inputText, 'utf8'));
  };

  ctx.dispatchPasteEvent = (sub: Sub<M>, text: string): void => {
    const kind = subKind(sub);
    switch (kind.kind) {
      case 'paste':
        ctx.dispatchFn(kind.toMsg(text));
        break;
      case 'batch':
        for (const s of kind.subs) ctx.dispatchPasteEvent(s, text);
        break;
      case 'map':
        ctx.dispatchPasteEvent(applySubMap(kind.sub, kind.fn), text);
        break;
      case 'debounce':
      case 'throttle':
      case 'filter':
      case 'distinct':
        ctx.walkCombinator(kind, (inner) => ctx.dispatchPasteEvent(inner, text));
        break;
      default:
        break;
    }
  };

  ctx.dispatchKeyEvent = (sub: Sub<M>, event: KeyEvent): void => {
    const kind = subKind(sub);
    switch (kind.kind) {
      case 'keyEvent':
        ctx.dispatchFn(kind.toMsg(event));
        break;
      case 'batch':
        for (const s of kind.subs) ctx.dispatchKeyEvent(s, event);
        break;
      case 'map':
        ctx.dispatchKeyEvent(applySubMap(kind.sub, kind.fn), event);
        break;
      case 'debounce':
      case 'throttle':
      case 'filter':
      case 'distinct':
        ctx.walkCombinator(kind, (inner) => ctx.dispatchKeyEvent(inner, event));
        break;
      default:
        break;
    }
  };

  ctx.dispatchMouseEvent = (sub: Sub<M>, event: MouseEventData): void => {
    const kind = subKind(sub);
    switch (kind.kind) {
      case 'mouse':
        ctx.dispatchFn(kind.toMsg(event));
        break;
      case 'batch':
        for (const s of kind.subs) ctx.dispatchMouseEvent(s, event);
        break;
      case 'map':
        ctx.dispatchMouseEvent(applySubMap(kind.sub, kind.fn), event);
        break;
      case 'debounce':
      case 'throttle':
      case 'filter':
      case 'distinct':
        ctx.walkCombinator(kind, (inner) => ctx.dispatchMouseEvent(inner, event));
        break;
      default:
        break;
    }
  };

  ctx.dispatchResizeEvent = (sub: Sub<M>, cols: number, rows: number): void => {
    const kind = subKind(sub);
    switch (kind.kind) {
      case 'resize':
        ctx.dispatchFn(kind.toMsg(cols, rows));
        break;
      case 'batch':
        for (const s of kind.subs) ctx.dispatchResizeEvent(s, cols, rows);
        break;
      case 'map':
        ctx.dispatchResizeEvent(applySubMap(kind.sub, kind.fn), cols, rows);
        break;
      case 'debounce':
      case 'throttle':
      case 'filter':
      case 'distinct':
        ctx.walkCombinator(kind, (inner) => ctx.dispatchResizeEvent(inner, cols, rows));
        break;
      default:
        break;
    }
  };

  installFeedbackDispatchers(ctx);
}

function installFeedbackDispatchers<Model, M>(ctx: RuntimeContext<Model, M>): void {
  ctx.dispatchFocusChange = (sub: Sub<M>, focusedId: string | null): void => {
    if (ctx.lastA11yFocusId !== focusedId) {
      ctx.lastA11yFocusId = focusedId;
      ctx.accessibilityRuntime.focusChanged(focusedId, focusedId === null ? 'Focus cleared' : `focus: ${focusedId}`);
    }

    const kind = subKind(sub);
    switch (kind.kind) {
      case 'focus':
        ctx.dispatchFn(kind.toMsg(focusedId));
        break;
      case 'batch':
        for (const s of kind.subs) ctx.dispatchFocusChange(s, focusedId);
        break;
      case 'map':
        ctx.dispatchFocusChange(applySubMap(kind.sub, kind.fn), focusedId);
        break;
      case 'debounce':
      case 'throttle':
      case 'filter':
      case 'distinct':
        ctx.walkCombinator(kind, (inner) => ctx.dispatchFocusChange(inner, focusedId));
        break;
      default:
        break;
    }
  };

  ctx.dispatchWindowFocus = (sub: Sub<M>, focused: boolean): void => {
    const kind = subKind(sub);
    switch (kind.kind) {
      case 'windowFocus':
        ctx.dispatchFn(kind.toMsg(focused));
        break;
      case 'batch':
        for (const s of kind.subs) ctx.dispatchWindowFocus(s, focused);
        break;
      case 'map':
        ctx.dispatchWindowFocus(applySubMap(kind.sub, kind.fn), focused);
        break;
      case 'debounce':
      case 'throttle':
      case 'filter':
      case 'distinct':
        ctx.walkCombinator(kind, (inner) => ctx.dispatchWindowFocus(inner, focused));
        break;
      default:
        break;
    }
  };

  ctx.dispatchLayoutFeedback = (sub: Sub<M>, plan: LayoutPlan): void => {
    const kind = subKind(sub);
    switch (kind.kind) {
      case 'layout': {
        const rects = new Map<string, LayoutRect>();
        for (const id of kind.ids) {
          const entry = plan.index.get(id);
          if (entry) {
            rects.set(id, entry.rect);
          }
        }
        ctx.dispatchFn(kind.toMsg({ rects }));
        break;
      }
      case 'batch':
        for (const s of kind.subs) ctx.dispatchLayoutFeedback(s, plan);
        break;
      case 'map':
        ctx.dispatchLayoutFeedback(applySubMap(kind.sub, kind.fn), plan);
        break;
      case 'debounce':
      case 'throttle':
      case 'filter':
      case 'distinct':
        ctx.walkCombinator(kind, (inner) => ctx.dispatchLayoutFeedback(inner, plan));
        break;
      default:
        break;
    }
  };

  ctx.matchKeySub = (sub: Sub<M>, key: string, event: { ctrl: boolean; alt: boolean; shift: boolean }): void => {
    const kind = subKind(sub);
    switch (kind.kind) {
      case 'key':
        if (!event.ctrl && !event.alt && kind.key === key) {
          ctx.dispatchFn(kind.msg);
        }
        break;
      case 'keyWithModifiers':
        if (
          kind.key === key &&
          (kind.modifiers.ctrl ?? false) === event.ctrl &&
          (kind.modifiers.alt ?? false) === event.alt &&
          (kind.modifiers.shift ?? false) === event.shift
        ) {
          ctx.dispatchFn(kind.msg);
        }
        break;
      case 'batch':
        for (const s of kind.subs) ctx.matchKeySub(s, key, event);
        break;
      case 'map':
        ctx.matchKeySub(applySubMap(kind.sub, kind.fn), key, event);
        break;
      case 'debounce':
      case 'throttle':
      case 'filter':
      case 'distinct':
        ctx.walkCombinator(kind, (inner) => ctx.matchKeySub(inner, key, event));
        break;
      default:
        break;
    }
  };
}
