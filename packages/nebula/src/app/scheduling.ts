import { FRAME_MS } from './constants.js';
import type { RuntimeContext } from './runtime-context.js';

export function installScheduling<Model, M>(ctx: RuntimeContext<Model, M>): void {
  ctx.cancelScheduledRender = (): void => {
    if (ctx.renderTimer !== null) {
      clearTimeout(ctx.renderTimer);
      ctx.renderTimer = null;
    }
    ctx.renderScheduled = false;
  };

  ctx.resetCompositorState = (): void => {
    ctx.compositor?.reset();
    ctx.compositorAnimating = false;
  };

  /** Schedule a coalesced render at the next frame boundary. */
  ctx.scheduleRender = (): void => {
    if (ctx.renderScheduled) return;
    ctx.renderScheduled = true;
    const now = Date.now();
    const elapsed = ctx.lastRenderAt === 0 ? FRAME_MS : now - ctx.lastRenderAt;
    const delay = Math.max(0, FRAME_MS - elapsed);
    ctx.renderTimer = setTimeout(() => {
      ctx.renderTimer = null;
      ctx.renderScheduled = false;
      if (!ctx.running || ctx.suspended) return;
      ctx.render();
    }, delay);
  };
}
