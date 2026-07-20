import { describe, expect, it, vi } from 'vitest';
import { type AppConfig, app } from '../app.js';
import { text } from '../elements.js';
import { cancelTask, cancelTasksByOwner, startTask, type TaskState, taskCancelled, taskFailed, taskIdle, taskRunning, taskSucceeded } from '../tasks.js';
import type { TerminalBackend } from '../terminal.js';
import { Cmd, cmdKind, Sub } from '../types.js';

function createMockTerminal(): TerminalBackend & { output: string[]; inputHandlers: ((data: Buffer) => void)[] } {
  const output: string[] = [];
  const inputHandlers: ((data: Buffer) => void)[] = [];
  return {
    output,
    inputHandlers,
    enterRawMode: vi.fn(),
    exitRawMode: vi.fn(),
    write(data: string) {
      output.push(data);
    },
    onInput(handler: (data: Buffer) => void) {
      inputHandlers.push(handler);
    },
    offInput(handler: (data: Buffer) => void) {
      const idx = inputHandlers.indexOf(handler);
      if (idx >= 0) inputHandlers.splice(idx, 1);
    },
    onResize: vi.fn(),
    offResize: vi.fn(),
    getSize: () => ({ cols: 40, rows: 10 }),
  };
}

describe('task helpers', () => {
  it('creates task commands with the expected runtime kinds', () => {
    const task = {
      id: 'load-project',
      run: async () => ({ type: 'done' as const }),
    };

    expect(cmdKind(startTask(task)).kind).toBe('taskStart');
    expect(cmdKind(cancelTask('load-project')).kind).toBe('taskCancel');
    expect(cmdKind(cancelTasksByOwner('screen:projects')).kind).toBe('taskCancelOwner');
  });

  it('creates task state snapshots for each lifecycle stage', () => {
    const err = new Error('boom');
    const states: TaskState[] = [taskIdle(), taskRunning(10), taskSucceeded(10, 20), taskFailed(err, 10, 30), taskCancelled(10, 40)];

    expect(states).toEqual([
      { status: 'idle' },
      { status: 'running', startedAt: 10 },
      { status: 'success', startedAt: 10, finishedAt: 20 },
      { status: 'error', startedAt: 10, finishedAt: 30, error: err },
      { status: 'cancelled', startedAt: 10, finishedAt: 40 },
    ]);
  });
});

describe('task runtime execution', () => {
  type Msg = { type: 'done'; taskId: string } | { type: 'cancelled'; taskId: string } | { type: 'failed'; message: string };

  interface Model {
    readonly seen: readonly Msg[];
  }

  function makeApp(initCmd: import('../types.js').Cmd<Msg>, updateSpy: ReturnType<typeof vi.fn>) {
    const terminal = createMockTerminal();

    const config: AppConfig<Model, Msg> = {
      init: () => [{ seen: [] }, initCmd],
      update: (msg, model) => {
        updateSpy(msg, model);
        return [{ seen: [...model.seen, msg] }, Cmd.none()];
      },
      view: () => text('tasks'),
      subscriptions: () => Sub.none(),
    };

    return { terminal, handle: app(config, { terminal }) };
  }

  it('dispatches the resolved task message on success', async () => {
    const updateSpy = vi.fn();
    const { handle } = makeApp(
      startTask<Msg>({
        id: 'load-project',
        run: async () => ({ type: 'done', taskId: 'load-project' }),
      }),
      updateSpy,
    );

    await vi.waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({ type: 'done', taskId: 'load-project' }, { seen: [] });
    });

    handle.stop();
  });

  it('maps task errors through onError when provided', async () => {
    const updateSpy = vi.fn();
    const { handle } = makeApp(
      startTask<Msg>({
        id: 'save-project',
        run: async () => {
          throw new Error('save failed');
        },
        onError: (error) => ({ type: 'failed', message: (error as Error).message }),
      }),
      updateSpy,
    );

    await vi.waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({ type: 'failed', message: 'save failed' }, { seen: [] });
    });

    handle.stop();
  });

  it('cancels running tasks by id and dispatches onCancel when provided', async () => {
    const updateSpy = vi.fn();
    const { handle } = makeApp(
      Cmd.batch(
        startTask<Msg>({
          id: 'refresh',
          run: (signal) =>
            new Promise<Msg>((_resolve, reject) => {
              signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
            }),
          onCancel: () => ({ type: 'cancelled', taskId: 'refresh' }),
        }),
        cancelTask<Msg>('refresh'),
      ),
      updateSpy,
    );

    await vi.waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({ type: 'cancelled', taskId: 'refresh' }, { seen: [] });
    });

    handle.stop();
  });

  it('cancels tasks by owner token', async () => {
    const updateSpy = vi.fn();
    const { handle } = makeApp(
      Cmd.batch(
        startTask<Msg>({
          id: 'task-a',
          owner: 'screen:a',
          run: (signal) =>
            new Promise<Msg>((_resolve, reject) => {
              signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
            }),
          onCancel: () => ({ type: 'cancelled', taskId: 'task-a' }),
        }),
        startTask<Msg>({
          id: 'task-b',
          owner: 'screen:b',
          run: async () => ({ type: 'done', taskId: 'task-b' }),
        }),
        cancelTasksByOwner<Msg>('screen:a'),
      ),
      updateSpy,
    );

    await vi.waitFor(() => {
      expect(updateSpy.mock.calls.map((call) => call[0])).toEqual(
        expect.arrayContaining([
          { type: 'cancelled', taskId: 'task-a' },
          { type: 'done', taskId: 'task-b' },
        ]),
      );
    });

    handle.stop();
  });

  it('cancels earlier exclusive tasks sharing the same id', async () => {
    const updateSpy = vi.fn();
    const { handle } = makeApp(
      Cmd.batch(
        startTask<Msg>({
          id: 'load-shared',
          run: (signal) =>
            new Promise<Msg>((_resolve, reject) => {
              signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
            }),
          onCancel: () => ({ type: 'cancelled', taskId: 'load-shared' }),
        }),
        startTask<Msg>({
          id: 'load-shared',
          exclusive: true,
          run: async () => ({ type: 'done', taskId: 'load-shared' }),
        }),
      ),
      updateSpy,
    );

    await vi.waitFor(() => {
      expect(updateSpy.mock.calls.map((call) => call[0])).toEqual(
        expect.arrayContaining([
          { type: 'cancelled', taskId: 'load-shared' },
          { type: 'done', taskId: 'load-shared' },
        ]),
      );
    });

    handle.stop();
  });
});
