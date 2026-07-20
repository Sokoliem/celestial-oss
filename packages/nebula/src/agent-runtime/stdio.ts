import { type ChildProcess, spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import type { StdioTransportConfig } from '../agent-types.js';
import { type AgentTransport, MAX_AGENT_MESSAGE_BYTES } from './contracts.js';
import { killProcessTree, splitLines } from './utils.js';

export function createStdioTransport(config: StdioTransportConfig): AgentTransport {
  let child: ChildProcess | null = null;
  let isConnected = false;
  let stdoutBuffer = '';
  let stdoutDecoder = new StringDecoder('utf8');

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
          stdoutBuffer += stdoutDecoder.write(chunk);
          const [lines, remainder] = splitLines(stdoutBuffer);
          stdoutBuffer = remainder;
          if (Buffer.byteLength(stdoutBuffer, 'utf8') > MAX_AGENT_MESSAGE_BYTES) {
            const error = new Error(`Stdio message exceeded ${MAX_AGENT_MESSAGE_BYTES} bytes without a line delimiter`);
            stdoutBuffer = '';
            stdoutDecoder = new StringDecoder('utf8');
            emitError(error);
            if (child) killProcessTree(child);
            return;
          }
          for (const line of lines) {
            if (line.trim().length === 0) continue;
            if (Buffer.byteLength(line, 'utf8') > MAX_AGENT_MESSAGE_BYTES) {
              emitError(new Error(`Stdio message exceeded ${MAX_AGENT_MESSAGE_BYTES} bytes`));
              if (child) killProcessTree(child);
              return;
            }
            emitMessage(line);
          }
        });

        child.stderr?.on('data', (chunk: Buffer) => {
          process.stderr.write(chunk);
        });

        child.on('close', (code, signal) => {
          isConnected = false;
          child = null;
          stdoutBuffer = '';
          stdoutDecoder = new StringDecoder('utf8');
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
        const error = new Error('Cannot send: transport is not connected');
        emitError(error);
        throw error;
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
      stdoutDecoder = new StringDecoder('utf8');
    },
  };
}
