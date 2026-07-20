/**
 * Win32 Console Mouse Enablement
 *
 * On Windows, Node.js's libuv discards MOUSE_EVENT records from
 * ReadConsoleInput, and ConPTY may intercept VT mouse enable sequences.
 *
 * This module takes a simpler approach than a full ReadConsoleInput bridge:
 * it spawns a one-shot PowerShell command that uses P/Invoke to call
 * SetConsoleMode on CONIN$ with ENABLE_VIRTUAL_TERMINAL_INPUT and
 * ENABLE_MOUSE_INPUT flags. This tells the Windows console subsystem to
 * convert mouse events into VT escape sequences and deliver them through
 * the normal stdin data stream — where the existing SGR 1006 / X11 parser
 * handles them with correct terminal-cell coordinates.
 *
 * The bridge then stays alive to keep the console mode flags active
 * (they'd be reset if the process exited).
 *
 * @see https://github.com/nodejs/node/issues/56338
 * @see https://github.com/microsoft/terminal/issues/376
 * @see https://github.com/microsoft/terminal/issues/15977
 */

// ─── PowerShell one-shot: set console mode flags ──────────────────────────

/**
 * PowerShell script that sets ENABLE_VIRTUAL_TERMINAL_INPUT and
 * ENABLE_MOUSE_INPUT on CONIN$, then sleeps forever to keep flags active.
 * The flags are restored when the process exits.
 */
const SET_CONSOLE_MODE_SCRIPT = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class ConsoleMouse {
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    static extern IntPtr CreateFileW(string f, uint a, uint s, IntPtr p, uint d, uint fl, IntPtr t);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool GetConsoleMode(IntPtr h, out uint m);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool SetConsoleMode(IntPtr h, uint m);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

    public static int Enable() {
        var h = CreateFileW("CONIN$", 0xC0000000u, 3u, IntPtr.Zero, 3u, 0u, IntPtr.Zero);
        if (h == IntPtr.Zero || h == new IntPtr(-1)) return 1;
        uint mode;
        if (!GetConsoleMode(h, out mode)) { CloseHandle(h); return 2; }
        // ENABLE_VIRTUAL_TERMINAL_INPUT=0x0200, ENABLE_MOUSE_INPUT=0x0010,
        // ENABLE_WINDOW_INPUT=0x0008, ENABLE_EXTENDED_FLAGS=0x0080
        // Clear ENABLE_QUICK_EDIT_MODE=0x0040 (blocks mouse)
        uint newMode = (mode | 0x0200u | 0x0010u | 0x0008u | 0x0080u) & ~0x0040u;
        if (!SetConsoleMode(h, newMode)) { CloseHandle(h); return 3; }
        // Write success + the mode values for diagnostics
        Console.Out.WriteLine("OK " + mode + " " + newMode);
        Console.Out.Flush();
        // Keep alive — console mode reverts when all handles close
        System.Threading.Thread.Sleep(System.Threading.Timeout.Infinite);
        return 0;
    }
}
"@
exit [ConsoleMouse]::Enable()
`;

// ─── Bridge Interface ─────────────────────────────────────────────────────

export interface Win32InputBridge {
  start(): boolean;
  onData(handler: (data: Buffer) => void): void;
  offData(handler: (data: Buffer) => void): void;
  onResize(handler: (cols: number, rows: number) => void): void;
  offResize(handler: (cols: number, rows: number) => void): void;
  onError(handler: () => void): void;
  offError(handler: () => void): void;
  stop(): void;
  readonly running: boolean;
}

import { type ChildProcess, spawn } from 'node:child_process';

function debugWin32Mouse(message: string, kind: 'info' | 'error' = 'info'): void {
  if (!process.env.CELESTIAL_DEBUG_INPUT) return;
  const prefix = kind === 'error' ? '[win32-mouse-err]' : '[win32-mouse]';
  process.stderr.write(`${prefix} ${message}\n`);
}

export function createWin32InputBridge(): Win32InputBridge {
  let child: ChildProcess | null = null;
  let isRunning = false;
  // These are unused in the flag-only approach — mouse data comes through
  // stdin which the terminal backend handles directly. But we keep the
  // interface for forward compatibility with a future ReadConsoleInput bridge.
  const dataHandlers = new Set<(data: Buffer) => void>();
  const resizeHandlers = new Set<(cols: number, rows: number) => void>();
  const errorHandlers = new Set<() => void>();

  function emitError(): void {
    for (const handler of errorHandlers) handler();
  }

  return {
    get running() {
      return isRunning;
    },

    start(): boolean {
      if (isRunning) return true;

      try {
        // Spawn PowerShell to set console mode flags and stay alive
        child = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SET_CONSOLE_MODE_SCRIPT], {
          stdio: ['inherit', 'pipe', 'pipe'],
        });

        if (!child.stdout) return false;

        // Log bridge output/errors for debugging
        child.stdout.on('data', (chunk: Buffer) => {
          const msg = chunk.toString('utf8').trim();
          if (msg) {
            debugWin32Mouse(msg);
          }
        });

        if (child.stderr) {
          child.stderr.on('data', (chunk: Buffer) => {
            const msg = chunk.toString('utf8').trim();
            if (msg) {
              debugWin32Mouse(msg, 'error');
            }
          });
        }

        child.on('exit', (code) => {
          isRunning = false;
          child = null;
          if (code !== 0) {
            debugWin32Mouse(`bridge exited with code ${code}`);
          }
          emitError();
        });

        child.on('error', () => {
          isRunning = false;
          child = null;
          emitError();
        });

        isRunning = true;
        return true;
      } catch {
        return false;
      }
    },

    onData(handler: (data: Buffer) => void): void {
      dataHandlers.add(handler);
    },
    offData(handler: (data: Buffer) => void): void {
      dataHandlers.delete(handler);
    },
    onResize(handler: (cols: number, rows: number) => void): void {
      resizeHandlers.add(handler);
    },
    offResize(handler: (cols: number, rows: number) => void): void {
      resizeHandlers.delete(handler);
    },
    onError(handler: () => void): void {
      errorHandlers.add(handler);
    },
    offError(handler: () => void): void {
      errorHandlers.delete(handler);
    },

    stop(): void {
      if (child) {
        child.kill();
        child = null;
      }
      isRunning = false;
    },
  };
}

/**
 * Check if the current platform needs the Win32 input bridge for mouse support.
 */
export function needsWin32InputBridge(): boolean {
  if (process.env.CELESTIAL_DISABLE_WIN32_INPUT_BRIDGE === '1') return false;
  return process.platform === 'win32' && (process.stdin?.isTTY ?? false);
}
