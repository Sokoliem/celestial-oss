import net from 'node:net';
import type { AutomationSnapshot } from './contracts.js';

interface LensBridgeEnvelope {
  type: 'hello' | 'snapshot' | 'command';
  token?: string;
  protocol?: string;
  version?: number;
  snapshot?: AutomationSnapshot;
  command?: LensBridgeCommand;
}

/** A command sent from the Lens agent to the running Nebula app */
export interface LensBridgeCommand {
  /** Command type */
  type: 'raw' | 'activate' | 'focusById';
  /** Hex-encoded input buffer for 'raw' commands */
  buffer?: string;
  /** Action ID for 'activate' commands (from AutomationSnapshot.actions[].id) */
  actionId?: string;
  /** Focus ID for 'focusById' commands */
  focusId?: string;
}

export interface LensBridgeClient {
  publish(snapshot: AutomationSnapshot): void;
  /** Register a handler for incoming commands from the Lens agent */
  onCommand(handler: (command: LensBridgeCommand) => void): void;
  close(): void;
}

function serializeEnvelope(envelope: LensBridgeEnvelope): string {
  return `${JSON.stringify(envelope)}\n`;
}

export function createLensBridgeClientFromEnv(): LensBridgeClient | null {
  const host = process.env.CELESTUI_LENS_BRIDGE_HOST;
  const portValue = process.env.CELESTUI_LENS_BRIDGE_PORT;
  const token = process.env.CELESTUI_LENS_BRIDGE_TOKEN;

  if (!host || !portValue || !token) {
    return null;
  }

  const port = Number(portValue);
  if (!Number.isInteger(port) || port <= 0) {
    if (process.stderr) {
      process.stderr.write('[nebula] invalid CELESTUI_LENS_BRIDGE_PORT value\n');
    }
    return null;
  }

  let socket: net.Socket | null = null;
  let connected = false;
  let latestSnapshot: AutomationSnapshot | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let closed = false;
  const commandHandlers: Array<(command: LensBridgeCommand) => void> = [];
  let lineBuffer = '';

  const connect = (): void => {
    if (closed || socket) return;

    socket = net.createConnection({ host, port });
    socket.setNoDelay(true);
    socket.setEncoding('utf8');

    socket.on('connect', () => {
      connected = true;
      lineBuffer = '';
      socket?.write(
        serializeEnvelope({
          type: 'hello',
          token,
          protocol: 'celestui-lens-bridge',
          version: 1,
        }),
      );

      if (latestSnapshot) {
        socket?.write(
          serializeEnvelope({
            type: 'snapshot',
            snapshot: latestSnapshot,
          }),
        );
      }
    });

    // Listen for incoming commands from the Lens bridge server
    socket.on('data', (chunk) => {
      lineBuffer += chunk;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const envelope = JSON.parse(trimmed) as LensBridgeEnvelope;
          if (envelope.type === 'command' && envelope.command) {
            for (const handler of commandHandlers) {
              handler(envelope.command);
            }
          }
        } catch {
          // Ignore malformed envelopes
        }
      }
    });

    socket.on('error', () => {
      // Retry on close; no stderr spam for optional bridge mode.
    });

    socket.on('close', () => {
      connected = false;
      socket = null;
      lineBuffer = '';
      if (closed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 100);
    });
  };

  connect();

  return {
    publish(snapshot: AutomationSnapshot): void {
      latestSnapshot = snapshot;
      if (!connected || !socket) return;
      socket.write(
        serializeEnvelope({
          type: 'snapshot',
          snapshot,
        }),
      );
    },

    onCommand(handler: (command: LensBridgeCommand) => void): void {
      commandHandlers.push(handler);
    },

    close(): void {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket) {
        socket.destroy();
        socket = null;
      }
      connected = false;
    },
  };
}
