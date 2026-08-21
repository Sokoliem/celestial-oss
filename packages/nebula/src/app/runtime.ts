import { BRACKETED_PASTE_ENABLE } from '../clipboard.js';
import { installCrashRecovery } from '../crash-recovery.js';
import { MOUSE_ENABLE } from '../mouse.js';
import type { Cmd } from '../types.js';
import { installCombinators } from './combinators.js';
import { installCommands } from './commands.js';
import { WINDOW_FOCUS_ENABLE } from './constants.js';
import type { AppConfig, AppHandle, AppOptions } from './contracts.js';
import { installDiagnostics } from './diagnostics.js';
import { installElementMouse } from './element-mouse.js';
import { installInput } from './input.js';
import { installLifecycle } from './lifecycle.js';
import { installPointerCursor } from './pointer-cursor.js';
import { installRender } from './render.js';
import { createRuntimeContext } from './runtime-context.js';
import { installScheduling } from './scheduling.js';
import { installSubscriptions } from './subscriptions.js';
import { installTerminalSession } from './terminal-session.js';

function installRuntime<Model, M>(ctx: ReturnType<typeof createRuntimeContext<Model, M>>): void {
  installDiagnostics(ctx);
  installScheduling(ctx);
  installCombinators(ctx);
  installCommands(ctx);
  installRender(ctx);
  installSubscriptions(ctx);
  installElementMouse(ctx);
  installPointerCursor(ctx);
  installInput(ctx);
  installTerminalSession(ctx);
  installLifecycle(ctx);
}

/** Run a Nebula application */
export function app<Model, M>(initialConfig: AppConfig<Model, M>, options?: AppOptions): AppHandle<M> {
  const ctx = createRuntimeContext(initialConfig, options);
  installRuntime(ctx);

  try {
    ctx.enterTerminalSession(true);

    if (!options?.disableCrashRecovery) {
      ctx.crashGuard = installCrashRecovery({
        terminal: ctx.terminal,
        crashLogPath: options?.crashLogPath,
        getModel: () => ctx.model,
      });
    }

    const [initialModel, initCmd] = ctx.config.init() as [Model, Cmd<M>];
    ctx.model = initialModel;

    ctx.attachRuntimeHandlers();
    ctx.installSuspendResumeHandlers();

    const initSubs = ctx.config.subscriptions(ctx.model);
    ctx.lastGoodSubs = initSubs;
    if (ctx.hasPasteSub(initSubs) && !ctx.pasteActive) {
      ctx.terminal.write(BRACKETED_PASTE_ENABLE);
      ctx.pasteActive = true;
    }
    if (ctx.hasMouseSub(initSubs) && !ctx.mouseActive) {
      if (process.env.CELESTIAL_DEBUG_INPUT) {
        process.stderr.write('[mouse-mode] enable source=startup\n');
      }
      ctx.terminal.write(MOUSE_ENABLE);
      ctx.mouseActive = true;
    }
    if (ctx.hasWindowFocusSub(initSubs) && !ctx.windowFocusActive) {
      ctx.terminal.write(WINDOW_FOCUS_ENABLE);
      ctx.windowFocusActive = true;
    }

    ctx.executeCmd(initCmd);
    ctx.flushAccessibilityAnnouncements();
    ctx.render();
    ctx.initialRenderDone = true;
    ctx.reconcileSubscriptions();
  } catch (error: unknown) {
    try {
      ctx.shutdown();
    } catch (cleanupError: unknown) {
      if (typeof process !== 'undefined' && process.stderr) {
        process.stderr.write(`[nebula] Startup cleanup failed: ${cleanupError}\n`);
      }
    }
    throw error;
  }

  return {
    dispatch: ctx.dispatch,
    stop: ctx.shutdown,
    suspend: ctx.suspend,
    resume: ctx.resume,
    replaceConfig: ctx.replaceConfig,
    requestRedraw() {
      if (!ctx.running || ctx.suspended) return;
      ctx.cancelScheduledRender();
      ctx.prevGrid = null;
      ctx.resetCompositorState();
      ctx.render();
    },
    getLayoutPlan: () => ctx.lastLayoutPlan,
    getHitRegions: () => ctx.currentHitRegions,
    get model() {
      return ctx.model;
    },
  };
}
