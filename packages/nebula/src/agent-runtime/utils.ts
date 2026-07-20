import { type ChildProcess, spawnSync } from 'node:child_process';
import type { RetryPolicy } from '../agent-types.js';

const MAX_TIMER_MS = 2_147_483_647;

export function validateRetryPolicy(policy: RetryPolicy): void {
  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 0) {
    throw new RangeError('retryPolicy.maxAttempts must be a non-negative integer');
  }
  for (const [name, value] of [
    ['baseDelayMs', policy.baseDelayMs],
    ['maxDelayMs', policy.maxDelayMs],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > MAX_TIMER_MS) {
      throw new RangeError(`retryPolicy.${name} must be between 0 and ${MAX_TIMER_MS} milliseconds`);
    }
  }
  if (policy.maxDelayMs < policy.baseDelayMs) {
    throw new RangeError('retryPolicy.maxDelayMs must be greater than or equal to baseDelayMs');
  }
  if (!Number.isFinite(policy.backoffFactor) || policy.backoffFactor <= 0) {
    throw new RangeError('retryPolicy.backoffFactor must be a positive finite number');
  }
}

export function computeRetryDelay(attempt: number, policy: RetryPolicy): number {
  validateRetryPolicy(policy);
  if (!Number.isInteger(attempt) || attempt < 0) throw new RangeError('retry attempt must be a non-negative integer');
  const delay = policy.baseDelayMs * policy.backoffFactor ** attempt;
  return Math.min(delay, policy.maxDelayMs);
}

export function shouldRetry(attempt: number, policy: RetryPolicy): boolean {
  validateRetryPolicy(policy);
  if (!Number.isInteger(attempt) || attempt < 0) throw new RangeError('retry attempt must be a non-negative integer');
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
