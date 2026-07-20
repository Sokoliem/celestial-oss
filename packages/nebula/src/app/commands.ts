import { BRACKETED_PASTE_DISABLE, BRACKETED_PASTE_ENABLE, osc52Copy, osc52PasteRequest } from '../clipboard.js';
import { popFocusGroup, pushFocusGroup } from '../focus.js';
import type { Priority } from '../scheduler.js';
import { type Cmd, cmdKind } from '../types.js';
import type { RuntimeContext } from './runtime-context.js';

interface RunCommandOptions<A, M> {
  mapMessage: (message: A) => M;
  signal: AbortSignal;
  emit: boolean;
}

interface LinkedController {
  controller: AbortController;
  dispose: () => void;
}

const PRIORITY_RANK: Record<Priority, number> = { 'user-blocking': 0, normal: 1, background: 2 };

function isPriorityHigherThan(a: Priority, b: Priority): boolean {
  return PRIORITY_RANK[a] < PRIORITY_RANK[b];
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function invoke<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return Promise.resolve(operation());
  } catch (error: unknown) {
    return Promise.reject(error);
  }
}

function linkAbortController(parent: AbortSignal): LinkedController {
  const controller = new AbortController();
  const abort = () => controller.abort(parent.reason);

  if (parent.aborted) {
    abort();
    return { controller, dispose: () => undefined };
  }

  parent.addEventListener('abort', abort, { once: true });
  return {
    controller,
    dispose: () => parent.removeEventListener('abort', abort),
  };
}

export function installCommands<Model, M>(ctx: RuntimeContext<Model, M>): void {
  const reportedErrors = new WeakSet<object>();

  function writeError(message: string): void {
    if (typeof process !== 'undefined' && process.stderr) {
      process.stderr.write(`[nebula] ${message}\n`);
    }
  }

  function reportError(error: unknown, message: string): void {
    if ((typeof error === 'object' && error !== null) || typeof error === 'function') reportedErrors.add(error as object);
    writeError(message);
  }

  function wasReported(error: unknown): boolean {
    return ((typeof error === 'object' && error !== null) || typeof error === 'function') && reportedErrors.has(error as object);
  }

  function resolveCustomHandler(tag: string): ((payload: unknown, signal: AbortSignal) => Promise<unknown>) | null {
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
        return async (_payload, signal) => {
          ctx.terminal.write(osc52PasteRequest());
          return await new Promise<string>((resolve, reject) => {
            const finish = (operation: () => void): void => {
              signal.removeEventListener('abort', onAbort);
              operation();
            };
            const callback = (result: { ok: true; value: string } | { ok: false; error: Error }): void => {
              finish(() => {
                if (result.ok) resolve(result.value);
                else reject(result.error);
              });
            };
            const onAbort = (): void => {
              const index = ctx.pendingClipboardRequests.indexOf(callback);
              if (index >= 0) ctx.pendingClipboardRequests.splice(index, 1);
              finish(() => reject(abortError()));
            };
            ctx.pendingClipboardRequests.push(callback);
            signal.addEventListener('abort', onAbort, { once: true });
            if (signal.aborted) onAbort();
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
      default: {
        const handler = ctx.options?.commandHandlers?.[tag];
        return handler ? (payload) => handler(payload) : null;
      }
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
    if (entries.size === 0) ctx.runningTasks.delete(taskId);
  }

  function cancelRunningTasks(taskId: string): void {
    const entries = ctx.runningTasks.get(taskId);
    if (!entries) return;
    for (const entry of [...entries]) entry.controller.abort();
  }

  function cancelRunningTasksByOwner(owner: string): void {
    for (const entries of ctx.runningTasks.values()) {
      for (const entry of [...entries]) {
        if (entry.owner === owner) entry.controller.abort();
      }
    }
  }

  function emitMessage<A>(message: A, options: RunCommandOptions<A, M>): void {
    if (options.emit && ctx.running && !options.signal.aborted) {
      ctx.dispatch(options.mapMessage(message));
    }
  }

  async function runCmd<A>(cmd: Cmd<A>, options: RunCommandOptions<A, M>): Promise<unknown> {
    if (options.signal.aborted) throw abortError();
    const kind = cmdKind(cmd);

    switch (kind.kind) {
      case 'none':
        return undefined;

      case 'quit':
        ctx.shutdown();
        return undefined;

      case 'batch':
        return await Promise.all(kind.cmds.map((child) => runCmd(child, options)));

      case 'sequence': {
        let result: unknown;
        for (const child of kind.cmds) {
          result = await runCmd(child, options);
        }
        return result;
      }

      case 'perform': {
        try {
          const result = await invoke(() => kind.task(options.signal));
          if (options.signal.aborted) throw abortError();
          const message = kind.toMsg(result);
          emitMessage(message, options);
          return message;
        } catch (error: unknown) {
          if (!isAbortError(error) && !options.signal.aborted) {
            reportError(error, `Cmd.perform failed: ${error}`);
          }
          throw error;
        }
      }

      case 'attempt': {
        let result: { ok: true; value: unknown } | { ok: false; error: Error };
        try {
          const value = await invoke(() => kind.task(options.signal));
          if (options.signal.aborted) throw abortError();
          result = { ok: true, value };
        } catch (error: unknown) {
          if (options.signal.aborted) throw error;
          result = { ok: false, error: toError(error) };
        }
        const message = kind.toMsg(result);
        emitMessage(message, options);
        return message;
      }

      case 'map': {
        let lastSource: unknown;
        let lastMapped: A | undefined;
        let mapped = false;
        const result = await runCmd(kind.cmd, {
          ...options,
          mapMessage: (message: unknown) => {
            lastSource = message;
            lastMapped = kind.fn(message);
            mapped = true;
            return options.mapMessage(lastMapped);
          },
        });
        if (mapped && Object.is(result, lastSource)) return lastMapped;
        return kind.fn(result);
      }

      case 'debounce':
        return await new Promise<unknown>((resolve, reject) => {
          const existing = ctx.debouncedCmdTimers.get(kind.key);
          existing?.cancel();

          let settled = false;
          const finish = (action: () => void): void => {
            if (settled) return;
            settled = true;
            options.signal.removeEventListener('abort', onAbort);
            action();
          };
          const cancel = (): void => {
            clearTimeout(timer);
            finish(() => resolve(undefined));
          };
          const onAbort = (): void => {
            clearTimeout(timer);
            if (ctx.debouncedCmdTimers.get(kind.key)?.timer === timer) {
              ctx.debouncedCmdTimers.delete(kind.key);
            }
            finish(() => reject(abortError()));
          };
          const timer = setTimeout(() => {
            if (ctx.debouncedCmdTimers.get(kind.key)?.timer === timer) {
              ctx.debouncedCmdTimers.delete(kind.key);
            }
            finish(() => {
              void runCmd(kind.cmd, options).then(resolve, reject);
            });
          }, kind.ms);

          ctx.debouncedCmdTimers.set(kind.key, { timer, cancel });
          options.signal.addEventListener('abort', onAbort, { once: true });
        });

      case 'sendToAgent': {
        try {
          await ctx.connectionManager.send(kind.agentId, kind.message);
          if (options.signal.aborted) throw abortError();
          if (!kind.toMsg) return { ok: true, value: undefined };
          const message = kind.toMsg({ ok: true, value: undefined });
          emitMessage(message, options);
          return message;
        } catch (error: unknown) {
          if (options.signal.aborted) throw error;
          if (!kind.toMsg) return { ok: false, error: toError(error) };
          const message = kind.toMsg({ ok: false, error: toError(error) });
          emitMessage(message, options);
          return message;
        }
      }

      case 'phase-send': {
        const entry = kind.registry.get(kind.machineId);
        if (entry?.running) entry.send(kind.event);
        return undefined;
      }

      case 'custom': {
        const handler = resolveCustomHandler(kind.tag);
        if (!handler) {
          writeError(`No handler registered for custom command "${kind.tag}"`);
          return undefined;
        }
        try {
          const result = await invoke(() => handler(kind.payload, options.signal));
          if (options.signal.aborted) throw abortError();
          if (!kind.toMsg) {
            ctx.flushAccessibilityAnnouncements();
            return result;
          }
          const message = kind.toMsg({ ok: true, value: result });
          emitMessage(message, options);
          return message;
        } catch (error: unknown) {
          if (options.signal.aborted) throw error;
          if (!kind.toMsg) {
            reportError(error, `Custom command "${kind.tag}" failed: ${error}`);
            throw error;
          }
          const message = kind.toMsg({ ok: false, error: toError(error) });
          emitMessage(message, options);
          return message;
        }
      }

      case 'taskStart': {
        if (kind.task.exclusive) cancelRunningTasks(kind.task.id);
        const linked = linkAbortController(options.signal);
        const { controller } = linked;
        trackRunningTask(kind.task.id, controller, kind.task.owner);
        try {
          const message = await invoke(() => kind.task.run(controller.signal));
          if (controller.signal.aborted) throw abortError();
          emitMessage(message, options);
          return message;
        } catch (error: unknown) {
          if (controller.signal.aborted || isAbortError(error)) {
            if (options.signal.aborted) throw error;
            const message = kind.task.onCancel?.();
            if (message !== undefined) emitMessage(message, options);
            return message;
          }
          if (kind.task.onError) {
            const message = kind.task.onError(error);
            emitMessage(message, options);
            return message;
          }
          reportError(error, `Task "${kind.task.id}" failed: ${error}`);
          throw error;
        } finally {
          linked.dispose();
          untrackRunningTask(kind.task.id, controller);
        }
      }

      case 'taskCancel':
        cancelRunningTasks(kind.taskId);
        return undefined;

      case 'taskCancelOwner':
        cancelRunningTasksByOwner(kind.owner);
        return undefined;

      case 'pushFocusGroup':
        ctx.focusState = pushFocusGroup(ctx.focusState, kind.group);
        ctx.cancelScheduledRender();
        ctx.render();
        return undefined;

      case 'popFocusGroup':
        ctx.focusState = popFocusGroup(ctx.focusState);
        ctx.cancelScheduledRender();
        ctx.render();
        return undefined;

      case 'race': {
        const branches = kind.cmds.map(() => linkAbortController(options.signal));
        try {
          const winner = await Promise.any(
            kind.cmds.map(async (child, index) => ({
              index,
              result: await runCmd(child, {
                ...options,
                signal: branches[index]!.controller.signal,
                emit: false,
              }),
            })),
          );
          if (options.signal.aborted) throw abortError();
          const message = kind.toMsg(winner);
          emitMessage(message, options);
          return message;
        } finally {
          for (const branch of branches) {
            branch.controller.abort();
            branch.dispose();
          }
        }
      }

      case 'all': {
        const branches = kind.cmds.map(() => linkAbortController(options.signal));
        try {
          const results = await Promise.all(
            kind.cmds.map((child, index) => runCmd(child, { ...options, signal: branches[index]!.controller.signal, emit: false })),
          );
          if (options.signal.aborted) throw abortError();
          const message = kind.toMsg(results);
          emitMessage(message, options);
          return message;
        } finally {
          for (const branch of branches) {
            branch.controller.abort();
            branch.dispose();
          }
        }
      }

      case 'timeout': {
        const branch = linkAbortController(options.signal);
        const timedOut = Symbol('timed-out');
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<typeof timedOut>((resolve) => {
          timer = setTimeout(() => resolve(timedOut), kind.ms);
        });
        try {
          const result = await Promise.race([runCmd(kind.cmd, { ...options, signal: branch.controller.signal }), timeout]);
          if (result !== timedOut) return result;
          branch.controller.abort();
          if (options.signal.aborted) throw abortError();
          emitMessage(kind.fallbackMsg, options);
          return kind.fallbackMsg;
        } finally {
          if (timer !== undefined) clearTimeout(timer);
          branch.dispose();
        }
      }

      default: {
        const exhaustive: never = kind;
        throw new Error(`Unsupported command kind: ${String(exhaustive)}`);
      }
    }
  }

  const identityMap = (message: M): M => message;

  ctx.executeCmd = (cmd: Cmd<M>): void => {
    void runCmd(cmd, {
      mapMessage: identityMap,
      signal: ctx.appAbortController.signal,
      emit: true,
    }).catch((error: unknown) => {
      if (ctx.appAbortController.signal.aborted || isAbortError(error)) return;
      if (error instanceof AggregateError) {
        writeError(`Cmd.race failed because every branch rejected: ${error.errors.map(String).join('; ')}`);
      } else if (!wasReported(error)) {
        reportError(error, `Command failed: ${error}`);
      }
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
}
