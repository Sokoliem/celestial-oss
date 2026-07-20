import { describe, expect, it, vi } from 'vitest';
import { createLocalTaskRuntime, type TaskWorkerEvent } from '../runtime.js';

describe('local task runtime', () => {
  it('runs real fixtures through failure, retry, cancellation, and cleanup', async () => {
    const runtime = createLocalTaskRuntime({ fast: true });
    const events: TaskWorkerEvent[] = [];
    runtime.subscribe((event) => events.push(event));

    await runtime.run('compile', 1, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'exit', taskId: 'compile', code: 0 }));

    await runtime.run('test', 1, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'exit', taskId: 'test', attempt: 1, code: 1 }));

    await runtime.run('test', 2, 2);
    expect(events).toContainEqual(expect.objectContaining({ type: 'exit', taskId: 'test', attempt: 2, code: 0 }));

    const packageRun = runtime.run('package', 1, 1);
    await vi.waitFor(() => expect(runtime.activeCount()).toBe(1));
    runtime.cancel('package');
    await packageRun;
    expect(events).toContainEqual(expect.objectContaining({ type: 'cancel', taskId: 'package' }));

    runtime.dispose();
    expect(runtime.activeCount()).toBe(0);
  });
});
