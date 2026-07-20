import { type ChildProcess, spawn } from 'node:child_process';
import type { StdioTransportConfig } from '../agent-types.js';
import type { AgentTransport } from './contracts.js';
import { killProcessTree, splitLines } from './utils.js';

export function createStdioTransport(config: StdioTransportConfig): AgentTransport {
  let child: ChildProcess | null = null;
  let isConnected = false;
  let stdoutBuffer = '';

  const messageHandlers: Array<(message: string) => void> = [];
  const closeHandlers: Array<(reason?: string) => void> = [];
  const errorHandlers: Array<(error: Error) => void> = [];

  function emitMessage(message: string): void {
    for (const handler of messageHandlers) handler(message);
  }

  function emitClose(reason?: string): void {
    isConnected = false;
    for (const handler of closeHandlers) handler(reason);
  }

  function emitError(error: Error): void {
    for (const handler of errorHandlers) handler(error);
  }

  return {
    get connected() {
      return isConnected;
    },
    connect() {
      return new Promise<void>((resolve, reject) => {
        if (isConnected) {
          resolve();
          return;
        }

        try {
          child = spawn(config.command, config.args ? [...config.args] : [], {
            shell: false,
            cwd: config.cwd,
            env: config.env ? { ...process.env, ...config.env } : process.env,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }

        let spawnErrored = false;

        child.on('error', (error: Error) => {
          if (!spawnErrored && !isConnected) {
            spawnErrored = true;
            reject(error);
            return;
          }
          emitError(error);
        });

        child.stdout?.on('data', (chunk: Buffer) => {
          stdoutBuffer += chunk.toString('utf8');
          const [lines, remainder] = splitLines(stdoutBuffer);
          stdoutBuffer = remainder;
          for (const line of lines) {
            if (line.trim().length > 0) emitMessage(line);
          }
        });

        child.stderr?.on('data', (chunk: Buffer) => {
          process.stderr.write(chunk);
        });

        child.on('close', (code, signal) => {
          isConnected = false;
          child = null;
          stdoutBuffer = '';
          emitClose(signal ? `Process killed by signal ${signal}` : `Process exited with code ${code ?? 1}`);
        });

        child.on('spawn', () => {
          if (!spawnErrored) {
            isConnected = true;
            resolve();
          }
        });
      });
    },
    send(message: string) {
      if (!isConnected || !child?.stdin || child.stdin.destroyed) {
        emitError(new Error('Cannot send: transport is not connected'));
        return;
      }
      child.stdin.write(message + '\n');
    },
    onMessage(handler) {
      messageHandlers.push(handler);
    },
    onClose(handler) {
      closeHandlers.push(handler);
    },
    onError(handler) {
      errorHandlers.push(handler);
    },
    disconnect() {
      if (child) {
        killProcessTree(child);
        child = null;
      }
      isConnected = false;
      stdoutBuffer = '';
    },
  };
}
