import { type ChildProcess, spawnSync } from 'node:child_process';
import type { RetryPolicy } from '../agent-types.js';

export function computeRetryDelay(attempt: number, policy: RetryPolicy): number {
  const delay = policy.baseDelayMs * policy.backoffFactor ** attempt;
  return Math.min(delay, policy.maxDelayMs);
}

export function shouldRetry(attempt: number, policy: RetryPolicy): boolean {
  if (policy.maxAttempts === 0) return true;
  return attempt < policy.maxAttempts;
}

export function killProcessTree(child: ChildProcess): void {
  if (child.pid === undefined) {
    child.kill();
    return;
  }

  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      child.kill();
    }
    return;
  }

  child.kill('SIGTERM');
}

export function splitLines(buffer: string): [string[], string] {
  const parts = buffer.split(/\r?\n/);
  const remainder = parts.pop() ?? '';
  return [parts, remainder];
}
