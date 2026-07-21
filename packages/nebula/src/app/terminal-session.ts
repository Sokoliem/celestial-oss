import { BRACKETED_PASTE_DISABLE } from '../clipboard.js';
import { focusById } from '../focus.js';
import { MOUSE_DISABLE } from '../mouse.js';
import { ansi } from '../terminal.js';
import { WINDOW_FOCUS_DISABLE } from './constants.js';
import type { RuntimeContext } from './runtime-context.js';

export function installTerminalSession<Model, M>(ctx: RuntimeContext<Model, M>): void {
  ctx.attachRuntimeHandlers = (): void => {
    if (ctx.inputHandler) {
      ctx.terminal.offInput(ctx.inputHandler);
    }
    ctx.inputHandler = ctx.handleInput;
    ctx.terminal.onInput(ctx.inputHandler);

    if (ctx.lensBridge) {
      ctx.lensBridge.onCommand((cmd) => {
        if (cmd.type === 'raw' && cmd.buffer && ctx.inputHandler) {
          ctx.inputHandler(Buffer.from(cmd.buffer, 'hex'));
        }
        if (cmd.type === 'focusById' && cmd.focusId) {
          ctx.focusState = focusById(ctx.focusState, cmd.focusId);
          ctx.scheduleRender();
        }
        if (cmd.type === 'activate' && cmd.actionId && ctx.inputHandler) {
          const action = ctx.latestAutomationSnapshot?.actions.find((a) => a.id === cmd.actionId);
          if (action?.focusId) {
            ctx.focusState = focusById(ctx.focusState, action.focusId);
            ctx.scheduleRender();
            queueMicrotask(() => ctx.inputHandler?.(Buffer.from('\r')));
          }
        }
      });
    }

    if (ctx.resizeHandler) {
      ctx.terminal.offResize(ctx.resizeHandler);
    }
    ctx.resizeHandler = () => {
      if (!ctx.running || ctx.suspended) return;
      ctx.prevGrid = null;
      ctx.resetCompositorState();
      const { cols, rows } = ctx.terminal.getSize();
      const subs = ctx.safeGetSubs();

      if (ctx.hasResizeSub(subs)) {
        ctx.dispatchResizeEvent(subs, cols, rows);
      } else {
        ctx.cancelScheduledRender();
        ctx.render();
      }
    };
    ctx.terminal.onResize(ctx.resizeHandler);
  };

  ctx.detachRuntimeHandlers = (): void => {
    let firstError: unknown;
    let failed = false;
    if (ctx.inputHandler) {
      try {
        ctx.terminal.offInput(ctx.inputHandler);
      } catch (error: unknown) {
        failed = true;
        firstError = error;
      } finally {
        ctx.inputHandler = null;
      }
    }
    if (ctx.resizeHandler) {
      try {
        ctx.terminal.offResize(ctx.resizeHandler);
      } catch (error: unknown) {
        if (!failed) firstError = error;
        failed = true;
      } finally {
        ctx.resizeHandler = null;
      }
    }
    if (failed) throw firstError;
  };

  ctx.enterTerminalSession = (initial: boolean): void => {
    if (ctx.terminalSessionActive) return;
    ctx.terminal.enterRawMode();
    ctx.terminalSessionActive = true;
    try {
      if (ctx.inlineMode) {
        if (initial) {
          ctx.terminal.write('\n'.repeat(ctx.inlineHeight));
          ctx.terminal.write(`\x1b[${ctx.inlineHeight}A`);
        } else {
          ctx.terminal.write(`\x1b[${ctx.inlineHeight}A`);
        }
        ctx.terminal.write('\x1b7');
        ctx.terminal.write(ansi.cursorHide);
      } else {
        ctx.terminal.write(ansi.altScreenEnter);
        ctx.terminal.write(ansi.cursorHide);
      }
    } catch (error: unknown) {
      try {
        for (const sequence of ctx.inlineMode ? [ansi.cursorShow] : [ansi.cursorShow, ansi.altScreenExit]) {
          try {
            ctx.terminal.write(sequence);
          } catch {
            // Preserve the original setup failure while attempting every rollback write.
          }
        }
        ctx.terminal.exitRawMode();
      } finally {
        ctx.terminalSessionActive = false;
      }
      throw error;
    }
  };

  function detachTerminalModes(): void {
    let firstError: unknown;
    let failed = false;
    const attempt = (action: () => void): void => {
      try {
        action();
      } catch (error: unknown) {
        if (!failed) firstError = error;
        failed = true;
      }
    };

    attempt(ctx.clearIdleTimers);

    if (ctx.mouseActive) {
      if (process.env.CELESTIAL_DEBUG_INPUT) {
        process.stderr.write('[mouse-mode] disable source=suspend\n');
      }
      attempt(() => ctx.terminal.write(MOUSE_DISABLE));
      ctx.mouseActive = false;
    }

    if (ctx.pasteActive) {
      attempt(() => ctx.terminal.write(BRACKETED_PASTE_DISABLE));
      ctx.pasteActive = false;
    }

    if (ctx.windowFocusActive) {
      attempt(() => ctx.terminal.write(WINDOW_FOCUS_DISABLE));
      ctx.windowFocusActive = false;
    }

    if (failed) throw firstError;
  }

  ctx.exitTerminalSession = (final: boolean): void => {
    if (!ctx.terminalSessionActive) return;
    let firstError: unknown;
    let failed = false;
    const attempt = (action: () => void): void => {
      try {
        action();
      } catch (error: unknown) {
        if (!failed) firstError = error;
        failed = true;
      }
    };

    try {
      attempt(detachTerminalModes);

      if (ctx.inlineMode) {
        attempt(() => ctx.terminal.write(`\x1b[${ctx.inlineHeight}B`));
        attempt(() => ctx.terminal.write(ansi.cursorShow));
        if (final) {
          attempt(() => ctx.terminal.write('\n'));
        }
      } else {
        attempt(() => ctx.terminal.write(ansi.cursorShow));
        attempt(() => ctx.terminal.write(ansi.altScreenExit));
      }
    } finally {
      try {
        attempt(() => ctx.terminal.exitRawMode());
      } finally {
        ctx.terminalSessionActive = false;
      }
    }
    if (failed) throw firstError;
  };

  ctx.installSuspendResumeHandlers = (): void => {
    if (typeof process === 'undefined' || typeof process.on !== 'function' || typeof process.off !== 'function') {
      return;
    }

    ctx.suspendSignalHandler = () => {
      ctx.suspend();
      if (typeof process.kill === 'function' && typeof process.pid === 'number') {
        process.off('SIGTSTP', ctx.suspendSignalHandler!);
        try {
          process.kill(process.pid, 'SIGTSTP');
        } finally {
          process.on('SIGTSTP', ctx.suspendSignalHandler!);
        }
      }
    };

    ctx.resumeSignalHandler = () => {
      ctx.resume();
    };

    process.on('SIGTSTP', ctx.suspendSignalHandler);
    process.on('SIGCONT', ctx.resumeSignalHandler);
  };

  ctx.uninstallSuspendResumeHandlers = (): void => {
    if (typeof process === 'undefined' || typeof process.off !== 'function') {
      return;
    }

    if (ctx.suspendSignalHandler) {
      process.off('SIGTSTP', ctx.suspendSignalHandler);
      ctx.suspendSignalHandler = null;
    }
    if (ctx.resumeSignalHandler) {
      process.off('SIGCONT', ctx.resumeSignalHandler);
      ctx.resumeSignalHandler = null;
    }
  };
}
