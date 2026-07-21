import { detectCapabilities } from './detect.js';
import { acquireTerminalLease, type TerminalInputStream } from './terminal-lease.js';
import type { AtlasCapabilities, AtlasSurface, DeviceAttributeResult, SecondaryAttributeResult } from './types.js';

export interface QueryOptions {
  readonly timeout?: number;
  readonly stdin?: NodeJS.ReadableStream & {
    isTTY?: boolean;
    isRaw?: boolean;
    setRawMode?: (mode: boolean) => void;
  };
  readonly stdout?: NodeJS.WritableStream & { isTTY?: boolean };
}

const DEFAULT_TIMEOUT = 500;

function queryTerminal(sequence: string, responsePattern: RegExp, options?: QueryOptions): Promise<string | null> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const stdin = (options?.stdin ?? process.stdin) as TerminalInputStream & {
    isTTY?: boolean;
    isRaw?: boolean;
    setRawMode?: (mode: boolean) => void;
    resume(): void;
    pause(): void;
    on(event: string, listener: (data: Buffer) => void): void;
    removeListener(event: string, listener: (data: Buffer) => void): void;
  };
  const stdout = (options?.stdout ?? process.stdout) as NodeJS.WritableStream & {
    isTTY?: boolean;
    write(s: string): boolean;
  };

  if (!stdin.isTTY || !stdout.isTTY) return Promise.resolve(null);

  return new Promise<string | null>((resolve) => {
    let settled = false;
    let buffer = '';
    let releaseLease: (() => void) | undefined;

    const cleanup = (): void => {
      if (settled) return;
      settled = true;
      stdin.removeListener('data', onData);
      try {
        releaseLease?.();
      } catch {
        /* ignore */
      }
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeout);

    const onData = (data: Buffer): void => {
      buffer += data.toString();
      const match = buffer.match(responsePattern);
      if (match) {
        cleanup();
        clearTimeout(timer);
        resolve(match[0]!);
      }
    };

    try {
      releaseLease = acquireTerminalLease(stdin).release;
      stdin.on('data', onData);
      stdout.write(sequence);
    } catch {
      clearTimeout(timer);
      cleanup();
      resolve(null);
    }
  });
}

export async function queryDeviceAttributes(options?: QueryOptions): Promise<DeviceAttributeResult | null> {
  const raw = await queryTerminal('\x1b[c', /\x1b\[\?([0-9;]+)c/, options);
  if (!raw) return null;
  const match = raw.match(/\x1b\[\?([0-9;]+)c/);
  if (!match) return null;
  const attributes = match[1]!.split(';').map(Number);
  return { raw, attributes, sixel: attributes.includes(4), reGIS: attributes.includes(3) };
}

export async function querySecondaryAttributes(options?: QueryOptions): Promise<SecondaryAttributeResult | null> {
  const raw = await queryTerminal('\x1b[>c', /\x1b\[>([0-9;]+)c/, options);
  if (!raw) return null;
  const match = raw.match(/\x1b\[>([0-9;]+)c/);
  if (!match) return null;
  const parts = match[1]!.split(';').map(Number);
  return {
    raw,
    terminalType: parts[0] ?? 0,
    firmwareVersion: parts[1] ?? 0,
    romCartridgeRegistration: parts[2] ?? 0,
  };
}

export async function detectCapabilitiesAsync(options?: QueryOptions & { surface?: AtlasSurface; env?: NodeJS.ProcessEnv }): Promise<AtlasCapabilities> {
  const syncCaps = detectCapabilities({ surface: options?.surface, env: options?.env });

  // High-confidence protocols skip DA1
  if (syncCaps.sixelGraphics || syncCaps.kittyGraphics) {
    return syncCaps;
  }

  const da1 = await queryDeviceAttributes(options);
  if (da1?.sixel) {
    return { ...syncCaps, sixelGraphics: true };
  }

  return syncCaps;
}
