import { Cmd } from './types.js';

export type TaskStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled';

export interface TaskDescriptor<Msg> {
  readonly id: string;
  readonly owner?: string;
  readonly exclusive?: boolean;
  readonly run: (signal: AbortSignal) => Promise<Msg>;
  readonly onError?: (error: unknown) => Msg;
  readonly onCancel?: () => Msg;
}

export interface TaskState {
  readonly status: TaskStatus;
  readonly startedAt?: number;
  readonly finishedAt?: number;
  readonly error?: unknown;
}

export function taskIdle(): TaskState {
  return { status: 'idle' };
}

export function taskRunning(startedAt = Date.now()): TaskState {
  return { status: 'running', startedAt };
}

export function taskSucceeded(startedAt?: number, finishedAt = Date.now()): TaskState {
  return {
    status: 'success',
    startedAt,
    finishedAt,
  };
}

export function taskFailed(error: unknown, startedAt?: number, finishedAt = Date.now()): TaskState {
  return {
    status: 'error',
    startedAt,
    finishedAt,
    error,
  };
}

export function taskCancelled(startedAt?: number, finishedAt = Date.now()): TaskState {
  return {
    status: 'cancelled',
    startedAt,
    finishedAt,
  };
}

export function startTask<Msg>(task: TaskDescriptor<Msg>) {
  return Cmd.startTask(task);
}

export function cancelTask<Msg>(taskId: string) {
  return Cmd.cancelTask<Msg>(taskId);
}

export function cancelTasksByOwner<Msg>(owner: string) {
  return Cmd.cancelTasksByOwner<Msg>(owner);
}
