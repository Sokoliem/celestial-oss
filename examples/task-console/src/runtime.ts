import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

export const taskIds = ['compile', 'test', 'package'] as const;
export type TaskId = (typeof taskIds)[number];

export type TaskWorkerEvent =
  | { type: 'start'; taskId: TaskId; generation: number; attempt: number; message: string }
  | { type: 'progress'; taskId: TaskId; generation: number; attempt: number; progress: number; message: string }
  | { type: 'log'; taskId: TaskId; generation: number; attempt: number; level: 'info' | 'error'; message: string }
  | { type: 'exit'; taskId: TaskId; generation: number; attempt: number; code: number; message: string }
  | { type: 'error'; taskId: TaskId; generation: number; attempt: number; message: string }
  | { type: 'cancel'; taskId: TaskId; generation: number; attempt: number; message: string };

export interface TaskRuntime {
  run(taskId: TaskId, generation: number, attempt: number, signal?: AbortSignal): Promise<void>;
  cancel(taskId: TaskId): void;
  subscribe(listener: (event: TaskWorkerEvent) => void): () => void;
  dispose(): void;
  activeCount(): number;
}

interface RunningTask {
  child: ChildProcess;
  generation: number;
  attempt: number;
  cancelled: boolean;
  cancelEmitted: boolean;
}

interface LocalTaskRuntimeOptions {
  fast?: boolean;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createLocalTaskRuntime(options: LocalTaskRuntimeOptions = {}): TaskRuntime {
  const listeners = new Set<(event: TaskWorkerEvent) => void>();
  const running = new Map<TaskId, RunningTask>();
  const workerPath = fileURLToPath(new URL('../fixtures/task-worker.mjs', import.meta.url));
  const fast = options.fast ?? process.env['CELESTIAL_DEMO_FAST'] === '1';

  const emit = (event: TaskWorkerEvent): void => {
    for (const listener of listeners) listener(event);
  };

  const cancel = (taskId: TaskId): void => {
    const record = running.get(taskId);
    if (!record) return;
    record.cancelled = true;
    if (!record.cancelEmitted) {
      record.cancelEmitted = true;
      emit({
        type: 'cancel',
        taskId,
        generation: record.generation,
        attempt: record.attempt,
        message: `${taskId} cancelled`,
      });
    }
    record.child.kill();
  };

  return {
    run(taskId, generation, attempt, signal) {
      cancel(taskId);

      return new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, [workerPath, taskId, String(attempt), fast ? 'fast' : 'normal'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
        const record: RunningTask = { child, generation, attempt, cancelled: false, cancelEmitted: false };
        running.set(taskId, record);
        let terminalEvent = false;
        let settled = false;

        const finish = (error?: unknown): void => {
          if (settled) return;
          settled = true;
          if (running.get(taskId) === record) running.delete(taskId);
          signal?.removeEventListener('abort', abort);
          if (error) reject(error);
          else resolve();
        };

        const abort = (): void => cancel(taskId);
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });

        const lines = createInterface({ input: child.stdout! });
        lines.on('line', (line) => {
          try {
            const parsed = JSON.parse(line) as Record<string, unknown>;
            const type = parsed['type'];
            if (type === 'start' || type === 'progress' || type === 'log' || type === 'exit' || type === 'error' || type === 'cancel') {
              if (type === 'exit' || type === 'error' || type === 'cancel') terminalEvent = true;
              emit({ ...parsed, type, taskId, generation, attempt } as TaskWorkerEvent);
            }
          } catch (error) {
            emit({ type: 'error', taskId, generation, attempt, message: `Invalid worker event: ${messageOf(error)}` });
          }
        });

        child.stderr?.on('data', (chunk: Buffer) => {
          emit({ type: 'log', taskId, generation, attempt, level: 'error', message: chunk.toString('utf8').trim() });
        });

        child.once('error', (error) => {
          terminalEvent = true;
          emit({ type: 'error', taskId, generation, attempt, message: messageOf(error) });
          finish(error);
        });

        child.once('exit', (code) => {
          if (!terminalEvent) {
            if (record.cancelled) {
              if (!record.cancelEmitted) emit({ type: 'cancel', taskId, generation, attempt, message: `${taskId} cancelled` });
            } else {
              emit({
                type: 'exit',
                taskId,
                generation,
                attempt,
                code: code ?? 1,
                message: code === 0 ? `${taskId} passed` : `${taskId} exited with code ${code ?? 1}`,
              });
            }
          }
          lines.close();
          finish();
        });
      });
    },

    cancel,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose() {
      for (const taskId of [...running.keys()]) cancel(taskId);
      listeners.clear();
    },

    activeCount() {
      return running.size;
    },
  };
}
