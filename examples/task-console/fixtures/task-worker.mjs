const taskId = process.argv[2];
const attempt = Number(process.argv[3] ?? '1');
const fast = process.argv[4] === 'fast';

const definitions = {
  compile: [
    [18, 'Reading TypeScript graph'],
    [47, 'Checking public entry points'],
    [76, 'Emitting JavaScript'],
    [100, 'Compile complete'],
  ],
  test: [
    [20, 'Starting deterministic suite'],
    [55, 'Running interaction tests'],
    [82, 'Checking retry fixture'],
    [100, 'Test run complete'],
  ],
  package: [
    [25, 'Collecting package files'],
    [58, 'Verifying dependency closure'],
    [84, 'Writing archive'],
    [100, 'Package complete'],
  ],
};

if (!(taskId in definitions)) {
  process.stderr.write(`Unknown task: ${taskId}\n`);
  process.exitCode = 2;
} else {
  const send = (type, payload = {}) => process.stdout.write(`${JSON.stringify({ type, ...payload })}\n`);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, fast ? Math.max(6, Math.round(ms / 8)) : ms));
  let cancelled = false;

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    send('cancel', { message: `${taskId} cancelled` });
    process.exitCode = 130;
  };

  process.once('SIGTERM', cancel);
  process.once('SIGINT', cancel);

  send('start', { message: `${taskId} started (attempt ${attempt})` });
  for (const [progress, message] of definitions[taskId]) {
    await wait(120);
    if (cancelled) break;
    send('log', { level: 'info', message });
    send('progress', { progress, message });
  }

  if (!cancelled) {
    if (taskId === 'test' && attempt === 1) {
      send('log', { level: 'error', message: 'test failed: intentional first-attempt fixture' });
      send('exit', { code: 1, message: 'test failed on attempt 1' });
      process.exitCode = 1;
    } else {
      send('log', { level: 'info', message: `${taskId} passed` });
      send('exit', { code: 0, message: `${taskId} passed` });
    }
  }
}
