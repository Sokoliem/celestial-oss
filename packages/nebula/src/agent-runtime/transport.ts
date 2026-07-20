import type { TransportConfig } from '../agent-types.js';
import type { AgentTransport } from './contracts.js';
import { createSseTransport } from './sse.js';
import { createStdioTransport } from './stdio.js';
import { createWebSocketTransport } from './websocket.js';

export function createTransport(config: TransportConfig): AgentTransport {
  switch (config.kind) {
    case 'stdio':
      return createStdioTransport(config);
    case 'sse':
      return createSseTransport(config);
    case 'websocket':
      return createWebSocketTransport(config);
  }
}
