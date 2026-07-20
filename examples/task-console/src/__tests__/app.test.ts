import { createScreen, createTestApp } from '@celestial/test';
import { afterEach, describe, expect, it } from 'vitest';
import { createTaskConsoleApp, type TaskConsoleModel, type TaskConsoleMsg } from '../app.js';
import type { TaskId, TaskRuntime, TaskWorkerEvent } from '../runtime.js';

class FakeTaskRuntime implements TaskRuntime {
  readonly runs: Array<{ taskId: TaskId; generation: number; attempt: number }> = [];
  readonly cancelled: TaskId[] = [];
  disposed = false;
  private listener: ((event: TaskWorkerEvent) => void) | undefined;

  async run(taskId: TaskId, generation: number, attempt: number): Promise<void> {
    this.runs.push({ taskId, generation, attempt });
  }

  cancel(taskId: TaskId): void {
    this.cancelled.push(taskId);
  }

  subscribe(listener: (event: TaskWorkerEvent) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }

  emit(event: TaskWorkerEvent): void {
    this.listener?.(event);
  }

  dispose(): void {
    this.disposed = true;
  }

  activeCount(): number {
    return 0;
  }
}

function findText(frame: string, needle: string): { col: number; row: number } {
  const lines = frame.split('\n');
  const row = lines.findIndex((line) => line.includes(needle));
  if (row < 0) throw new Error(`Could not find ${needle} in frame:\n${frame}`);
  return { row, col: lines[row]!.indexOf(needle) };
}

describe('task console app', () => {
  const handles: Array<ReturnType<typeof createTestApp<TaskConsoleModel, TaskConsoleMsg>>> = [];

  afterEach(() => {
    for (const handle of handles.splice(0)) handle.stop();
  });

  for (const size of [
    { cols: 80, rows: 24 },
    { cols: 140, rows: 40 },
  ]) {
    it(`renders and responds at ${size.cols}x${size.rows}`, async () => {
      const taskRuntime = new FakeTaskRuntime();
      const handle = createTestApp(createTaskConsoleApp({ runtime: taskRuntime, autoStart: false, animate: false, initialSize: size }), size);
      handles.push(handle);

      expect(handle.lastFrame()).toContain('Celestial Task Console');
      expect(handle.lastFrame()).toContain('Compile');
      expect(handle.snapshot().audit.violations.filter((violation) => violation.severity === 'error')).toEqual([]);

      handle.pressKey('down');
      expect(handle.model.selected).toBe('test');
      handle.pressKey('enter');
      await handle.waitForUpdate();
      expect(taskRuntime.runs.at(-1)).toEqual({ taskId: 'test', generation: 1, attempt: 1 });

      taskRuntime.emit({ type: 'log', taskId: 'test', generation: 1, attempt: 1, level: 'error', message: 'test failed' });
      taskRuntime.emit({ type: 'exit', taskId: 'test', generation: 1, attempt: 1, code: 1, message: 'test failed on attempt 1' });
      await handle.waitForUpdate();
      expect(handle.model.tasks.test.status).toBe('failed');
      expect(handle.lastFrame()).toContain('test failed');

      handle.pressKey('r');
      await handle.waitForUpdate();
      expect(taskRuntime.runs.at(-1)).toEqual({ taskId: 'test', generation: 2, attempt: 2 });

      const packagePoint = findText(handle.lastFrame(), 'Package');
      handle.click(packagePoint.col, packagePoint.row);
      expect(handle.model.selected).toBe('package');

      handle.pressKey('enter');
      handle.pressKey('x');
      expect(handle.model.cancelDialog.open).toBe(true);
      handle.pressKey('escape');
      expect(handle.model.cancelDialog.open).toBe(false);
      handle.pressKey('x');
      handle.pressKey('y');
      await handle.waitForUpdate();
      expect(taskRuntime.cancelled).toContain('package');

      handle.pressKey('p', { ctrl: true });
      expect(handle.model.palette.palette.open).toBe(true);
      handle.pressKey('escape');
      expect(handle.model.palette.palette.open).toBe(false);

      const screen = createScreen(handle);
      screen.fireResize(100, 30);
      expect(handle.model.cols).toBe(100);
      expect(handle.model.rows).toBe(30);
    });
  }

  it('ignores stale worker generations and caps logs', async () => {
    const taskRuntime = new FakeTaskRuntime();
    const handle = createTestApp(createTaskConsoleApp({ runtime: taskRuntime, autoStart: false, animate: false, initialSize: { cols: 80, rows: 24 } }), {
      cols: 80,
      rows: 24,
    });
    handles.push(handle);
    handle.dispatch({ type: 'run-selected' });
    handle.dispatch({ type: 'run-selected' });
    taskRuntime.emit({ type: 'exit', taskId: 'compile', generation: 1, attempt: 1, code: 1, message: 'stale failure' });
    for (let index = 0; index < 210; index += 1) {
      taskRuntime.emit({ type: 'log', taskId: 'compile', generation: 2, attempt: 2, level: 'info', message: `line ${index}` });
    }
    await handle.waitForUpdate();
    expect(handle.model.tasks.compile.status).toBe('running');
    expect(handle.model.tasks.compile.logs).toHaveLength(200);
    expect(handle.model.tasks.compile.logs.at(-1)).toBe('line 209');
  });
});
