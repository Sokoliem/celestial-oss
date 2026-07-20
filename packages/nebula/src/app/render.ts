import { buildAutomationSnapshot } from '../automation.js';
import { applyFocusToTree, collectFocusNodes } from '../focus.js';
import { collectHitRegions } from '../hit-regions.js';
import { createRenderCauseBuilder, type RenderCauseBuilder } from '../message-priority.js';
import { applyShaders, shaders } from '../shader.js';
import { ansi } from '../terminal.js';
import { diff, extractRawBlobs, type LayoutPlan, planLayout, rasterize, renderUpdates, snapLayoutPlanToGrid } from '../vdom.js';
import { FRAME_MS } from './constants.js';
import type { RenderFrameTelemetry } from './contracts.js';
import type { RuntimeContext } from './runtime-context.js';

export function installRender<Model, M>(ctx: RuntimeContext<Model, M>): void {
  ctx.render = (): void => {
    if (!ctx.running || ctx.suspended) return;
    ctx.isRendering = true;
    const t = ctx.renderTracer;
    const phaseTimings: Array<{ name: string; ms: number }> = [];
    let renderInterrupted = false;
    let renderCommitted = false;
    let renderError: unknown;
    let renderCols = 0;
    let renderRows = 0;
    let layoutStats: LayoutPlan['stats'] | undefined;

    function traced<T>(name: string, fn: () => T): T {
      const start = performance.now();
      if (t) t.beginSpan(name);
      try {
        return fn();
      } finally {
        if (t) t.endSpan();
        phaseTimings.push({ name, ms: performance.now() - start });
      }
    }

    const useScheduler = ctx.scheduler !== null;
    const causeBld: RenderCauseBuilder | null = useScheduler ? createRenderCauseBuilder(ctx.lastDispatchedMsgType, ctx.lastDispatchedPriority) : null;
    if (useScheduler) {
      ctx.renderGeneration = ctx.scheduler!.generation;
      ctx.currentRenderPriority = ctx.lastDispatchedPriority;
      ctx.scheduler!.resetDeadline();
    }

    function isStaleRender(): boolean {
      return useScheduler && ctx.scheduler!.generation !== ctx.renderGeneration;
    }

    function interruptRender(): void {
      renderInterrupted = true;
      causeBld?.recordInterrupt();
      ctx.lastRenderCause = causeBld?.finalize() ?? null;
      if (ctx.lastRenderCause) ctx.options?.onRenderInterrupt?.(ctx.lastRenderCause);
    }

    const renderStart = performance.now();
    ctx.renderWatchdog?.beginRender();
    t?.beginSpan('render');
    try {
      const subs = ctx.safeGetSubs();
      const { cols, rows: termRows } = ctx.terminal.getSize();
      const rows = ctx.inlineMode ? ctx.inlineHeight : termRows;
      renderCols = cols;
      renderRows = rows;

      const rawVnode = traced('view', () => ctx.config.view(ctx.model));

      traced('focus', () => {
        const focusNodes = collectFocusNodes(rawVnode);
        ctx.lastFocusNodes = focusNodes;
        const focusableIds = focusNodes.map((n) => n.id);
        const seededFocusId = ctx.focusState.currentId ?? focusNodes.find((node) => node.focused)?.id ?? null;
        ctx.focusState = { ...ctx.focusState, focusableIds, currentId: seededFocusId };

        if (ctx.focusState.currentId !== null && !focusableIds.includes(ctx.focusState.currentId)) {
          let navigable = focusableIds;
          if (ctx.focusState.groups.length > 0) {
            const activeGroup = ctx.focusState.groups[ctx.focusState.groups.length - 1]!;
            const groupIds = new Set(focusNodes.filter((n) => n.group === activeGroup).map((n) => n.id));
            navigable = focusableIds.filter((id) => groupIds.has(id));
          }
          ctx.focusState = { ...ctx.focusState, currentId: navigable.length > 0 ? navigable[0]! : null };
          ctx.combinatorIdCounter = 0;
          ctx.dispatchFocusChange(subs, ctx.focusState.currentId);
        }
      });

      const vnode = traced('applyFocus', () => applyFocusToTree(rawVnode, ctx.focusState.currentId));
      if (isStaleRender()) {
        interruptRender();
        return;
      }

      const targetPlan = traced('layout', () => planLayout(vnode, cols, rows));
      layoutStats = targetPlan.stats;
      const visualPlan = ctx.compositor ? ctx.compositor.update(targetPlan, Date.now()) : targetPlan;
      const plan = ctx.compositor ? snapLayoutPlanToGrid(visualPlan) : visualPlan;
      ctx.compositorAnimating = ctx.compositor?.isAnimating() ?? false;

      if (isStaleRender()) {
        interruptRender();
        return;
      }

      const newGrid = traced('rasterize', () => rasterize(plan));
      ctx.lastLayoutPlan = targetPlan;

      if (isStaleRender()) {
        interruptRender();
        return;
      }

      let shadedGrid = newGrid;
      const userShaders = ctx.config.shaders ? (typeof ctx.config.shaders === 'function' ? ctx.config.shaders(ctx.model) : ctx.config.shaders) : [];
      const shaderList = [shaders.systemStyle(), ...userShaders];
      if (shaderList.length > 0) {
        shadedGrid = traced('shaders', () =>
          applyShaders(newGrid, plan, shaderList, {
            time: Date.now(),
            tick: ctx.animFrameTimer !== null ? ctx.animFrameCount : ctx.frameTick++,
            cols,
            rows,
            plan,
            custom: {},
          }),
        );
      }

      if (isStaleRender()) {
        interruptRender();
        return;
      }

      ctx.lastRenderAt = Date.now();

      if (ctx.useSyncOutput) {
        ctx.terminal.write(ansi.syncOutput.begin);
      }
      if (ctx.inlineMode) {
        ctx.terminal.write('\x1b8');
        ctx.terminal.write('\x1b7');
      }

      traced('diff+write', () => {
        const previous = ctx.prevGrid ?? { cells: [], width: 0, height: 0 };
        if (!ctx.prevGrid && !ctx.inlineMode) {
          ctx.terminal.write(ansi.clearScreen);
        }
        const updates = diff(previous, shadedGrid);
        if (updates.length > 0 || !ctx.prevGrid) {
          ctx.terminal.write(renderUpdates(updates));
          for (const blob of extractRawBlobs(updates)) {
            ctx.terminal.write(`\x1b[${blob.row + 1};${blob.col + 1}H`);
            ctx.terminal.write(blob.blob);
          }
        }
      });

      if (ctx.useSyncOutput) {
        ctx.terminal.write(ansi.syncOutput.end);
      }

      ctx.prevGrid = shadedGrid;
      renderCommitted = true;
      ctx.currentHitRegions = collectHitRegions(targetPlan);

      if (ctx.lensBridge) {
        ctx.latestAutomationSnapshot = buildAutomationSnapshot(vnode, shadedGrid, cols, rows, targetPlan);
        ctx.lensBridge.publish(ctx.latestAutomationSnapshot);
      }

      if (ctx.lastRenderErrorMsg !== null) {
        ctx.lastRenderErrorMsg = null;
        ctx.options?.onRenderRecovery?.();
      }

      ctx.combinatorIdCounter = 0;
      ctx.dispatchLayoutFeedback(subs, targetPlan);
    } catch (err: unknown) {
      renderError = err;
      ctx.notifyRenderError(err);
    } finally {
      ctx.renderWatchdog?.endRender();
      t?.endSpan();
      ctx.isRendering = false;
      const renderDuration = performance.now() - renderStart;

      if (renderDuration > FRAME_MS && process.env.CELESTIAL_DEBUG_RENDER) {
        process.stderr.write(`[nebula] render budget: ${renderDuration.toFixed(1)}ms\n`);
      }
      if (renderDuration > FRAME_MS && t) {
        // Tracer already captures timing via beginSpan/endSpan above.
      }

      try {
        const frame: RenderFrameTelemetry = {
          frameNumber: ctx.renderFrameNumber++,
          msgType: ctx.lastDispatchedMsgType,
          priority: ctx.lastDispatchedPriority,
          cols: renderCols,
          rows: renderRows,
          totalMs: renderDuration,
          overBudget: renderDuration > FRAME_MS,
          interrupted: renderInterrupted,
          committed: renderCommitted,
          phases: phaseTimings,
          ...(layoutStats ? { layoutStats } : {}),
          ...(renderError !== undefined ? { error: renderError } : {}),
        };
        ctx.options?.onRenderFrame?.(frame);
      } catch (err: unknown) {
        ctx.notifyRenderError(err);
      }

      if (ctx.pendingRenderNeeded) {
        ctx.pendingRenderNeeded = false;
        try {
          ctx.scheduleRender();
          ctx.reconcileSubscriptions();
        } catch (err: unknown) {
          ctx.notifyRenderError(err);
        }
      } else if (ctx.compositorAnimating) {
        try {
          ctx.scheduleRender();
        } catch (err: unknown) {
          ctx.notifyRenderError(err);
        }
      }
    }
  };
}
