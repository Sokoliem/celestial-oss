import { cellWidth, sanitizeTerminalText, truncateCells } from '@celestial/corona';
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
      const handler = ctx.options?.onRenderError;
      if (handler) {
        try {
          handler(err);
        } catch (callbackError: unknown) {
          if (typeof process !== 'undefined' && process.stderr) {
            process.stderr.write(`[nebula] onRenderError callback failed: ${String(callbackError)}\n`);
          }
        }
      } else if ((ctx.options?.renderErrorReporting ?? 'stderr') === 'stderr') {
        // With no handler the only trace was a single truncated row on the alt
        // screen, which vanishes on the next repaint and never reaches CI logs.
        // stderr survives the alt-screen buffer and is captured by PTY harnesses
        // and shell redirection, without disturbing the rendered frame.
        if (typeof process !== 'undefined' && process.stderr) {
          const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
          process.stderr.write(`[nebula] uncaught render error: ${detail}\n`);
        }
      }
      try {
        const { cols, rows } = ctx.terminal.getSize();
        const safeCols = Number.isFinite(cols) ? Math.max(1, Math.floor(cols)) : 1;
        const safeRows = Number.isFinite(rows) ? Math.max(1, Math.floor(rows)) : 1;
        const prefix = ' Error: ';
        const safeMessage = sanitizeTerminalText(msg, {
          allowHyperlinks: false,
          allowSgr: false,
          controlPolicy: 'strip',
        });
        const label = truncateCells(`${prefix}${safeMessage}`, safeCols, '', {
          allowHyperlinks: false,
          allowSgr: false,
          controlPolicy: 'strip',
          trusted: true,
        });
        const padding = ' '.repeat(Math.max(0, safeCols - cellWidth(label)));
        ctx.terminal.write(`\x1b[${safeRows};1H\x1b[41;97m${label}${padding}\x1b[0m`);
      } catch {
        // terminal write failed — silently ignore
      }
    }
  };
}
