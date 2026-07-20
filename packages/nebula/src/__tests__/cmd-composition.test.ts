import { describe, expect, it, vi } from 'vitest';
import { Cmd, cmdKind } from '../types.js';

type TestMsg = { type: string; [key: string]: unknown };

describe('Cmd.race()', () => {
  it('should create a race command with correct kind', () => {
    const cmd1 = Cmd.perform<TestMsg, number>(
      () => Promise.resolve(1),
      (r) => ({ type: 'a', v: r }),
    );
    const cmd2 = Cmd.perform<TestMsg, number>(
      () => Promise.resolve(2),
      (r) => ({ type: 'b', v: r }),
    );
    const raceCmd = Cmd.race([cmd1, cmd2], (winner) => ({ type: 'winner' as const, ...winner }));
    const kind = cmdKind(raceCmd);
    expect(kind.kind).toBe('race');
    if (kind.kind === 'race') {
      expect(kind.cmds.length).toBe(2);
      expect(kind.toMsg).toBeTypeOf('function');
    }
  });

  it('toMsg should receive winner index and result', () => {
    const toMsg = vi.fn((winner: { index: number; result: unknown }) => ({
      type: 'winner' as const,
      ...winner,
    }));
    const raceCmd = Cmd.race([Cmd.none()], toMsg);
    const kind = cmdKind(raceCmd);
    if (kind.kind === 'race') {
      const msg = kind.toMsg({ index: 0, result: 42 });
      expect(msg).toEqual({ type: 'winner', index: 0, result: 42 });
    }
  });
});

describe('Cmd.all()', () => {
  it('should create an all command with correct kind', () => {
    const cmd1 = Cmd.perform<TestMsg, number>(
      () => Promise.resolve(1),
      (_r) => ({ type: 'a' }),
    );
    const cmd2 = Cmd.perform<TestMsg, number>(
      () => Promise.resolve(2),
      (_r) => ({ type: 'b' }),
    );
    const allCmd = Cmd.all([cmd1, cmd2], (results) => ({ type: 'done' as const, results }));
    const kind = cmdKind(allCmd);
    expect(kind.kind).toBe('all');
    if (kind.kind === 'all') {
      expect(kind.cmds.length).toBe(2);
    }
  });

  it('toMsg should receive results array', () => {
    const toMsg = vi.fn((results: unknown[]) => ({
      type: 'done' as const,
      results,
    }));
    const allCmd = Cmd.all([Cmd.none()], toMsg);
    const kind = cmdKind(allCmd);
    if (kind.kind === 'all') {
      const msg = kind.toMsg([1, 2, 3]);
      expect(msg).toEqual({ type: 'done', results: [1, 2, 3] });
    }
  });
});

describe('Cmd.timeout()', () => {
  it('should create a timeout command with correct kind', () => {
    const inner = Cmd.perform<TestMsg, number>(
      () => Promise.resolve(42),
      (r) => ({ type: 'ok', v: r }),
    );
    const timeoutCmd = Cmd.timeout(inner, 5000, { type: 'timeout' });
    const kind = cmdKind(timeoutCmd);
    expect(kind.kind).toBe('timeout');
    if (kind.kind === 'timeout') {
      expect(kind.ms).toBe(5000);
      expect(kind.fallbackMsg).toEqual({ type: 'timeout' });
    }
  });

  it('should preserve the inner command', () => {
    const inner = Cmd.perform<TestMsg, string>(
      () => Promise.resolve('data'),
      (r) => ({ type: 'got', v: r }),
    );
    const timeoutCmd = Cmd.timeout(inner, 1000, { type: 'fallback' });
    const kind = cmdKind(timeoutCmd);
    if (kind.kind === 'timeout') {
      const innerKind = cmdKind(kind.cmd);
      expect(innerKind.kind).toBe('perform');
    }
  });
});

describe('composition', () => {
  it('Cmd.timeout wrapping Cmd.race should compose', () => {
    const cmd1 = Cmd.perform<TestMsg, number>(
      () => Promise.resolve(1),
      (_r) => ({ type: 'a' }),
    );
    const cmd2 = Cmd.perform<TestMsg, number>(
      () => Promise.resolve(2),
      (_r) => ({ type: 'b' }),
    );
    const raceCmd = Cmd.race([cmd1, cmd2], (w) => ({ type: 'winner' as const, ...w }));
    const composed = Cmd.timeout(raceCmd, 5000, { type: 'timeout' as const });
    const kind = cmdKind(composed);
    expect(kind.kind).toBe('timeout');
    if (kind.kind === 'timeout') {
      const innerKind = cmdKind(kind.cmd);
      expect(innerKind.kind).toBe('race');
    }
  });
});
