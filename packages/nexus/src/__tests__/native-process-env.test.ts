import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetClipboardToolCache, detectClipboardTools, getEnv, getPlatform, isSshSession } from '../native/process-env.js';
import { makeProbe } from './__fixtures__/platform-injection.js';

describe('isSshSession', () => {
  it('returns true when SSH_CONNECTION is set', () => {
    expect(isSshSession(makeProbe('linux', { SSH_CONNECTION: 'x' }))).toBe(true);
  });

  it('returns true when SSH_CLIENT is set', () => {
    expect(isSshSession(makeProbe('linux', { SSH_CLIENT: 'x' }))).toBe(true);
  });

  it('returns true when SSH_TTY is set', () => {
    expect(isSshSession(makeProbe('linux', { SSH_TTY: '/dev/pts/0' }))).toBe(true);
  });

  it('returns false when no SSH env vars set', () => {
    expect(isSshSession(makeProbe('linux', {}))).toBe(false);
  });

  it('reads the live process env when no probe is passed', () => {
    expect(typeof isSshSession()).toBe('boolean');
  });
});

describe('getPlatform / getEnv', () => {
  it('returns the platform from the live process by default', () => {
    expect(getPlatform()).toBe(process.platform);
  });

  it('returns the platform from a passed probe', () => {
    expect(getPlatform(makeProbe('win32'))).toBe('win32');
  });

  it('returns env from the live process by default', () => {
    expect(getEnv().env).toBe(process.env);
  });
});

describe('detectClipboardTools', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexus-probe-'));
    _resetClipboardToolCache();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    _resetClipboardToolCache();
  });

  it('reports each tool as present when discoverable on PATH', () => {
    for (const name of ['pbcopy', 'pbpaste', 'wl-copy', 'wl-paste', 'xclip', 'xsel', 'wslview']) {
      const file = join(dir, name);
      writeFileSync(file, '#!/bin/sh\n');
      chmodSync(file, 0o755);
    }
    expect(existsSync(join(dir, 'pbcopy'))).toBe(true);
    const probe = detectClipboardTools(makeProbe('linux', { PATH: dir }));
    expect(probe.pbcopy).toBe(true);
    expect(probe.pbpaste).toBe(true);
    expect(probe.wlCopy).toBe(true);
    expect(probe.wlPaste).toBe(true);
    expect(probe.xclip).toBe(true);
    expect(probe.xsel).toBe(true);
    expect(probe.wslview).toBe(true);
    expect(probe.clip).toBe(false);
  });

  it('reports nothing when PATH is empty', () => {
    const probe = detectClipboardTools(makeProbe('linux', { PATH: '' }));
    expect(probe.pbcopy).toBe(false);
    expect(probe.xclip).toBe(false);
  });

  it('honors win32 PATHEXT lookup', () => {
    writeFileSync(join(dir, 'clip.exe'), '');
    const probe = detectClipboardTools(makeProbe('win32', { PATH: dir, PATHEXT: '.EXE;.CMD' }));
    expect(probe.clip).toBe(true);
  });

  it('caches per (platform, PATH)', () => {
    const a = detectClipboardTools(makeProbe('linux', { PATH: dir }));
    const b = detectClipboardTools(makeProbe('linux', { PATH: dir }));
    expect(a).toBe(b);
  });

  it('reset clears the cache', () => {
    const a = detectClipboardTools(makeProbe('linux', { PATH: dir }));
    _resetClipboardToolCache();
    const b = detectClipboardTools(makeProbe('linux', { PATH: dir }));
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
