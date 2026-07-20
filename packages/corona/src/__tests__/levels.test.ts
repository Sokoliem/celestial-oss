import { describe, expect, it } from 'vitest';
import { LOG_LEVELS, shouldLog } from '../log/levels.js';
import type { LogLevel } from '../log/types.js';

describe('LOG_LEVELS', () => {
  it('should have trace at 0', () => {
    expect(LOG_LEVELS.trace).toBe(0);
  });

  it('should have debug at 10', () => {
    expect(LOG_LEVELS.debug).toBe(10);
  });

  it('should have info at 20', () => {
    expect(LOG_LEVELS.info).toBe(20);
  });

  it('should have warn at 30', () => {
    expect(LOG_LEVELS.warn).toBe(30);
  });

  it('should have error at 40', () => {
    expect(LOG_LEVELS.error).toBe(40);
  });

  it('should have fatal at 50', () => {
    expect(LOG_LEVELS.fatal).toBe(50);
  });

  it('should maintain correct ordering: trace < debug < info < warn < error < fatal', () => {
    const ordered: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(LOG_LEVELS[ordered[i]!]).toBeLessThan(LOG_LEVELS[ordered[i + 1]!]);
    }
  });
});

describe('shouldLog', () => {
  it('should return true when message level equals configured level', () => {
    expect(shouldLog('info', 'info')).toBe(true);
  });

  it('should return true when message level is above configured level', () => {
    expect(shouldLog('error', 'info')).toBe(true);
  });

  it('should return false when message level is below configured level', () => {
    expect(shouldLog('debug', 'info')).toBe(false);
  });

  it('should return true for fatal when configured at trace (all pass)', () => {
    expect(shouldLog('fatal', 'trace')).toBe(true);
  });

  it('should return false for trace when configured at fatal (most restrictive)', () => {
    expect(shouldLog('trace', 'fatal')).toBe(false);
  });

  it('should return true for trace when configured at trace', () => {
    expect(shouldLog('trace', 'trace')).toBe(true);
  });

  it('should return true when message level equals configured level for all levels', () => {
    const levels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    for (const lvl of levels) {
      expect(shouldLog(lvl, lvl)).toBe(true);
    }
  });

  it('should produce correct results for all level pair combinations', () => {
    const levels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    for (const msgLevel of levels) {
      for (const cfgLevel of levels) {
        const expected = LOG_LEVELS[msgLevel] >= LOG_LEVELS[cfgLevel];
        expect(shouldLog(msgLevel, cfgLevel)).toBe(expected);
      }
    }
  });
});
