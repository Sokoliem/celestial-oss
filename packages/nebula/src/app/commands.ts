import { BRACKETED_PASTE_DISABLE, BRACKETED_PASTE_ENABLE, osc52Copy, osc52PasteRequest } from '../clipboard.js';
import { popFocusGroup, pushFocusGroup } from '../focus.js';
import type { Priority } from '../scheduler.js';
import { type Cmd, cmdKind } from '../types.js';
import type { RuntimeContext } from './runtime-context.js';

interface DispatchCmdOpts<M> {
  /** Transform a raw message before dispatching. Identity for direct dispatch. */
  wrap: (msg: unknown) => M;
  /** Called after an async command completes (for sequencing). */
  onDone?: () => void;
  /** Recursively dispatch a sub-command (for batch items). */
  recurse: (cmd: Cmd<M>) => void;
  /** Recursively dispatch a sequence of commands. */
  recurseSequence: (cmds: Cmd<M>[]) => void;
  /** Recursively dispatch a mapped sub-command (for Cmd.map). */
  recurseMap: (cmd: Cmd<M>, fn: (a: unknown) => M) => void;
}

const PRIORITY_RANK: Record<Priority, number> = { 'user-blocking': 0, normal: 1, background: 2 };

function isPriorityHigherThan(a: Priority, b: Priority): boolean {
  return PRIORITY_RANK[a] < PRIORITY_RANK[b];
}

export function installCommands<Model, M>(ctx: RuntimeContext<Model, M>): void {
  function resolveCustomHandler(tag: string): ((payload: unknown) => Promise<unknown>) | null {
    switch (tag) {
      case 'a11y.announce':
        return async (payload: unknown) => {
          const message = (payload as { message?: unknown } | null | undefined)?.message;
          const priority = (payload as { priority?: unknown } | null | undefined)?.priority;
          if (typeof message !== 'string') {
            throw new Error('a11y.announce requires payload { message: string }');
          }
          ctx.accessibilityRuntime.announce(message, priority === 'assertive' ? 'assertive' : 'polite');
        };
      case 'clipboard.copy':
        return async (payload: unknown) => {
          const text = (payload as { text?: unknown } | null | undefined)?.text;
          if (typeof text !== 'string') {
            throw new Error('clipboard.copy requires payload { text: string }');
          }
          ctx.terminal.write(osc52Copy(text));
        };
      case 'clipboard.paste.request':
        return async () => {
          ctx.terminal.write(osc52PasteRequest());
          return await new Promise<string>((resolve, reject) => {
            ctx.pendingClipboardRequests.push((result) => {
              if (result.ok) resolve(result.value);
              else reject(result.error);
            });
          });
        };
      case 'clipboard.paste.enable':
        return async () => {
          ctx.terminal.write(BRACKETED_PASTE_ENABLE);
          ctx.pasteActive = true;
        };
      case 'clipboard.paste.disable':
        return async () => {
          ctx.terminal.write(BRACKETED_PASTE_DISABLE);
          ctx.pasteActive = false;
        };
      default:
        return ctx.options?.commandHandlers?.[tag] ?? null;
    }
  }

  function trackRunningTask(taskId: string, controller: AbortController, owner?: string): void {
    const existing = ctx.runningTasks.get(taskId);
    if (existing) {
      existing.add({ controller, owner });
      return;
    }
    ctx.runningTasks.set(taskId, new Set([{ controller, owner }]));
  }

  function untrackRunningTask(taskId: string, controller: AbortController): void {
    const entries = ctx.runningTasks.get(taskId);
    if (!entries) return;
    for (const entry of entries) {
      if (entry.controller === controller) {
        entries.delete(entry);
        break;
      }
    }
    if (entries.size === 0) {
      ctx.runningTasks.delete(taskId);
    }
  }

  function cancelRunningTasks(taskId: string): void {
    const entries = ctx.runningTasks.get(taskId);
    if (!entries) return;
    for (const entry of [...entries]) {
      entry.controller.abort();
    }
  }

  function cancelRunningTasksByOwner(owner: string): void {
    for (const entries of ctx.runningTasks.values()) {
      for (const entry of [...entries]) {
        if (entry.owner === owner) {
          entry.controller.abort();
        }
      }
    }
  }

  function dispatchCmd(cmd: Cmd<M>, opts: DispatchCmdOpts<M>): void {
    const kind = cmdKind(cmd);
    const { wrap, onDone } = opts;

    switch (kind.kind) {
      case 'none':
        onDone?.();
        break;
      case 'quit':
        ctx.shutdown();
        onDone?.();
        break;
      case 'batch':
        for (const c of kind.cmds) opts.recurse(c);
        onDone?.();
        break;
      case 'sequence':
        opts.recurseSequence(kind.cmds as Cmd<M>[]);
        break;
      case 'perform': {
        let taskPromise: Promise<unknown>;
        try {
          taskPromise = kind.task(ctx.appAbortController.signal);
        } catch (err: unknown) {
          taskPromise = Promise.reject(err);
        }
        const p = taskPromise
          .then((result) => ctx.dispatch(wrap(kind.toMsg(result))))
          .catch((err: unknown) => {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            if (typeof process !== 'undefined' && process.stderr) {
              process.stderr.write(`[nebula] Cmd.perform failed: ${err}\n`);
            }
          });
        if (onDone) p.finally(onDone);
        break;
      }
      case 'attempt': {
        let taskPromise: Promise<unknown>;
        try {
          taskPromise = kind.task(ctx.appAbortController.signal);
        } catch (err: unknown) {
          taskPromise = Promise.reject(err);
        }
        const p = taskPromise
          .then((result) => {
            if (ctx.running) ctx.dispatch(wrap(kind.toMsg({ ok: true, value: result })));
          })
          .catch((err: unknown) => {
            if (!ctx.running) return;
            ctx.dispatch(wrap(kind.toMsg({ ok: false, error: err instanceof Error ? err : new Error(String(err)) })));
          });
        if (onDone) p.finally(onDone);
        break;
      }
      case 'map':
        opts.recurseMap(kind.cmd as Cmd<M>, (a: unknown) => wrap(kind.fn(a)));
        break;
      case 'debounce': {
        const existing = ctx.debouncedCmdTimers.get(kind.key);
        if (existing) {
          clearTimeout(existing.timer);
          existing.onDone?.();
        }
        const timer = setTimeout(() => {
          ctx.debouncedCmdTimers.delete(kind.key);
          dispatchCmd(kind.cmd as Cmd<M>, opts);
        }, kind.ms);
        ctx.debouncedCmdTimers.set(kind.key, { timer, onDone });
        break;
      }
      case 'sendToAgent': {
        const p = ctx.connectionManager
          .send(kind.agentId, kind.message)
          .then(() => {
            if (kind.toMsg) ctx.dispatch(wrap(kind.toMsg({ ok: true, value: undefined })));
          })
          .catch((err: unknown) => {
            if (kind.toMsg) ctx.dispatch(wrap(kind.toMsg({ ok: false, error: err instanceof Error ? err : new Error(String(err)) })));
          });
        if (onDone) p.finally(onDone);
        break;
      }
      case 'phase-send': {
        const entry = kind.registry.get(kind.machineId);
        if (entry?.running) {
          entry.send(kind.event);
        }
        onDone?.();
        break;
      }
      case 'custom': {
        const handler = resolveCustomHandler(kind.tag);
        if (!handler) {
          if (typeof process !== 'undefined' && process.stderr) {
            process.stderr.write(`[nebula] No handler registered for custom command "${kind.tag}"\n`);
          }
          onDone?.();
          break;
        }
        let handlerPromise: Promise<unknown>;
        try {
          handlerPromise = handler(kind.payload);
        } catch (err: unknown) {
          handlerPromise = Promise.reject(err);
        }
        const p = handlerPromise
          .then((result) => {
            if (kind.toMsg) ctx.dispatch(wrap(kind.toMsg({ ok: true, value: result })) as M);
            else ctx.flushAccessibilityAnnouncements();
          })
          .catch((err: unknown) => {
            if (kind.toMsg) ctx.dispatch(wrap(kind.toMsg({ ok: false, error: err instanceof Error ? err : new Error(String(err)) })) as M);
          });
        if (onDone) p.finally(onDone);
        break;
      }
      case 'taskStart': {
        if (kind.task.exclusive) {
          cancelRunningTasks(kind.task.id);
        }
        const controller = new AbortController();
        const signal = AbortSignal.any([ctx.appAbortController.signal, controller.signal]);
        trackRunningTask(kind.task.id, controller, kind.task.owner);
        let taskPromise: Promise<M>;
        try {
          taskPromise = kind.task.run(signal);
        } catch (err: unknown) {
          taskPromise = Promise.reject(err);
        }
        const p = taskPromise
          .then((msg) => {
            if (ctx.running && !signal.aborted) {
              ctx.dispatch(wrap(msg));
            }
          })
          .catch((err: unknown) => {
            const aborted = signal.aborted || (err instanceof DOMException && err.name === 'AbortError');
            if (!ctx.running) return;
            if (aborted) {
              const cancelMsg = kind.task.onCancel?.();
              if (cancelMsg !== undefined) {
                ctx.dispatch(wrap(cancelMsg));
              }
              return;
            }
            if (kind.task.onError) {
              ctx.dispatch(wrap(kind.task.onError(err)));
              return;
            }
            if (typeof process !== 'undefined' && process.stderr) {
              process.stderr.write(`[nebula] Task "${kind.task.id}" failed: ${err}\n`);
            }
          })
          .finally(() => {
            untrackRunningTask(kind.task.id, controller);
          });
        if (onDone) p.finally(onDone);
        break;
      }
      case 'taskCancel':
        cancelRunningTasks(kind.taskId);
        onDone?.();
        break;
      case 'taskCancelOwner':
        cancelRunningTasksByOwner(kind.owner);
        onDone?.();
        break;
      case 'pushFocusGroup':
        ctx.focusState = pushFocusGroup(ctx.focusState, kind.group);
        ctx.cancelScheduledRender();
        ctx.render();
        onDone?.();
        break;
      case 'popFocusGroup':
        ctx.focusState = popFocusGroup(ctx.focusState);
        ctx.cancelScheduledRender();
        ctx.render();
        onDone?.();
        break;
    }
  }

  const identityWrap = (msg: unknown): M => msg as M;

  function executeSequence(cmds: Cmd<M>[], index: number): void {
    if (index >= cmds.length) return;
    dispatchCmd(cmds[index]!, {
      wrap: identityWrap,
      onDone: () => {
        if (ctx.running) executeSequence(cmds, index + 1);
      },
      recurse: (c) => {
        ctx.executeCmd(c);
      },
      recurseSequence: (seqCmds) => executeSequence(seqCmds, 0),
      recurseMap: executeMappedCmd,
    });
  }

  function executeMappedSequence(cmds: Cmd<M>[], index: number, fn: (a: unknown) => M, onDone?: () => void): void {
    if (index >= cmds.length) {
      onDone?.();
      return;
    }
    executeMappedCmdInSequence(cmds[index]!, fn, () => executeMappedSequence(cmds, index + 1, fn, onDone));
  }

  function executeMappedCmdInSequence(cmd: Cmd<M>, fn: (a: unknown) => M, onDone: () => void): void {
    dispatchCmd(cmd, {
      wrap: fn,
      onDone,
      recurse: (c) => executeMappedCmd(c as Cmd<M>, fn),
      recurseSequence: (cmds) => executeMappedSequence(cmds as Cmd<M>[], 0, fn, onDone),
      recurseMap: (c, composedFn) => executeMappedCmdInSequence(c, composedFn, onDone),
    });
  }

  function executeMappedCmd(cmd: Cmd<M>, fn: (a: unknown) => M): void {
    dispatchCmd(cmd, {
      wrap: fn,
      recurse: (c) => executeMappedCmd(c as Cmd<M>, fn),
      recurseSequence: (cmds) => executeMappedSequence(cmds as Cmd<M>[], 0, fn),
      recurseMap: (c, composedFn) => executeMappedCmd(c, composedFn),
    });
  }

  ctx.executeCmd = (cmd: Cmd<M>): void => {
    dispatchCmd(cmd, {
      wrap: identityWrap,
      recurse: ctx.executeCmd,
      recurseSequence: (cmds) => executeSequence(cmds, 0),
      recurseMap: executeMappedCmd,
    });
  };

  ctx.dispatch = (msg: M): void => {
    if (!ctx.running) return;

    if (ctx.updateLoopThreshold > 0) {
      const now = Date.now();
      ctx.updateTimestamps.push(now);
      const cutoff = now - ctx.updateLoopWindowMs;
      while (ctx.updateTimestamps.length > 0 && ctx.updateTimestamps[0]! < cutoff) {
        ctx.updateTimestamps.shift();
      }
      if (ctx.updateTimestamps.length > ctx.updateLoopThreshold && now - ctx.lastUpdateLoopFiredAt > ctx.updateLoopCooldownMs) {
        ctx.lastUpdateLoopFiredAt = now;
        const count = ctx.updateTimestamps.length;
        ctx.updateTimestamps.length = 0;
        try {
          ctx.options?.onUpdateLoop?.({ count, windowMs: ctx.updateLoopWindowMs });
        } catch {
          // Callback errors must not break the dispatch path.
        }
      }
    }

    if (ctx.scheduler) {
      ctx.lastDispatchedPriority = ctx.classifyMsg(msg);
      ctx.lastDispatchedMsgType =
        typeof msg === 'object' && msg !== null && 'type' in msg ? String((msg as Record<string, unknown>).type) : typeof msg === 'string' ? msg : 'unknown';
      if (ctx.isRendering && isPriorityHigherThan(ctx.lastDispatchedPriority, ctx.currentRenderPriority)) {
        ctx.scheduler.interrupt();
      }
    }

    ctx.renderWatchdog?.beginRender();
    try {
      const [newModel, cmd] = ctx.config.update(msg, ctx.model);
      ctx.model = newModel;
      ctx.executeCmd(cmd);
      ctx.flushAccessibilityAnnouncements();
      if (!ctx.isRendering) {
        if (ctx.initialRenderDone) {
          ctx.scheduleRender();
        } else {
          ctx.render();
        }
        ctx.reconcileSubscriptions();
      } else {
        ctx.pendingRenderNeeded = true;
      }
    } catch (err: unknown) {
      ctx.notifyRenderError(err);
    } finally {
      ctx.renderWatchdog?.endRender();
    }
  };

  ctx.dispatchFn = (msg: M) => ctx.dispatch(msg);
}
