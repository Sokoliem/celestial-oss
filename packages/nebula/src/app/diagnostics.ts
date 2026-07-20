import type { Sub } from '../types.js';
import type { RuntimeContext } from './runtime-context.js';

export function installDiagnostics<Model, M>(ctx: RuntimeContext<Model, M>): void {
  ctx.flushAccessibilityAnnouncements = () => {
    ctx.accessibilityRuntime.flush();
  };

  /** Safely evaluate config.subscriptions, returning last good subs on error. */
  ctx.safeGetSubs = (): Sub<M> => {
    try {
      const subs = ctx.config.subscriptions(ctx.model);
      ctx.lastGoodSubs = subs;
      return subs;
    } catch (err: unknown) {
      ctx.notifyRenderError(err);
      return ctx.lastGoodSubs;
    }
  };

  /** Dedup + notify: fire onRenderError callback only for new error messages. */
  ctx.notifyRenderError = (err: unknown): void => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg !== ctx.lastRenderErrorMsg) {
      ctx.lastRenderErrorMsg = msg;
      ctx.options?.onRenderError?.(err);
      try {
        const { cols, rows } = ctx.terminal.getSize();
        const label = ` \u26a0 ${msg.slice(0, cols - 4)} `;
        ctx.terminal.write(`\x1b[${rows};1H\x1b[41;97m${label.padEnd(cols)}\x1b[0m`);
      } catch {
        // terminal write failed — silently ignore
      }
    }
  };
}
