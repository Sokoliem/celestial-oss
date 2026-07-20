import { describe, expect, it } from 'vitest';
import type { Bus } from '../bus.js';
import { createBus } from '../bus.js';

// ─── Test event map ─────────────────────────────────────────────────────────

type TestEvents = {
  ping: { ts: number };
  pong: { value: string };
  count: number;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract the internal kind from a Cmd or Sub so we can inspect it
 * without running the full app runtime.
 */
function cmdKind(cmd: { _kind: unknown }): any {
  return cmd._kind;
}

function subKind(sub: { _kind: unknown }): any {
  return sub._kind;
}

/**
 * Simulate the runtime wiring for a Sub.stream:
 * call setup(), register the data callback, and return a handle
 * for tearing down.
 */
function wireStream(sub: { _kind: unknown }) {
  const kind = subKind(sub);
  expect(kind.kind).toBe('stream');

  const source = kind.setup();
  const received: unknown[] = [];

  source.onData((data: unknown) => {
    received.push(kind.toMsg(data));
  });

  return { received, teardown: () => source.teardown() };
}

/**
 * Execute a Cmd.perform synchronously by calling its task and toMsg.
 */
async function runCmd(cmd: { _kind: unknown }) {
  const kind = cmdKind(cmd);
  expect(kind.kind).toBe('perform');
  const result = await kind.task(new AbortController().signal);
  return kind.toMsg(result);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('createBus', () => {
  it('emit dispatches to on subscribers', async () => {
    const bus: Bus<TestEvents> = createBus<TestEvents>();

    type Msg = { type: 'got-ping'; ts: number };
    const sub = bus.on<Msg, 'ping'>('ping', (data) => ({ type: 'got-ping', ts: data.ts }));
    const { received } = wireStream(sub);

    await runCmd(bus.emit('ping', { ts: 42 }));

    expect(received).toEqual([{ type: 'got-ping', ts: 42 }]);
  });

  it('multiple subscribers receive the same event', async () => {
    const bus = createBus<TestEvents>();

    const sub1 = bus.on('ping', (data) => ({ type: 'a' as const, ts: data.ts }));
    const sub2 = bus.on('ping', (data) => ({ type: 'b' as const, ts: data.ts }));

    const wire1 = wireStream(sub1);
    const wire2 = wireStream(sub2);

    await runCmd(bus.emit('ping', { ts: 99 }));

    expect(wire1.received).toEqual([{ type: 'a', ts: 99 }]);
    expect(wire2.received).toEqual([{ type: 'b', ts: 99 }]);
  });

  it('different event keys are independent', async () => {
    const bus = createBus<TestEvents>();

    const pingSub = bus.on('ping', (d) => d);
    const pongSub = bus.on('pong', (d) => d);

    const pingWire = wireStream(pingSub);
    const pongWire = wireStream(pongSub);

    await runCmd(bus.emit('ping', { ts: 1 }));
    await runCmd(bus.emit('pong', { value: 'hello' }));

    // ping subscriber only got the ping event
    expect(pingWire.received).toEqual([{ ts: 1 }]);
    // pong subscriber only got the pong event
    expect(pongWire.received).toEqual([{ value: 'hello' }]);
  });

  it('unsubscribe (teardown from stream) removes listener', async () => {
    const bus = createBus<TestEvents>();

    const sub = bus.on('count', (n) => ({ type: 'counted' as const, n }));
    const { received, teardown } = wireStream(sub);

    await runCmd(bus.emit('count', 1));
    expect(received).toEqual([{ type: 'counted', n: 1 }]);

    // Tear down the subscription
    teardown();

    // Emit again — should NOT be received
    await runCmd(bus.emit('count', 2));
    expect(received).toEqual([{ type: 'counted', n: 1 }]);
  });

  it('multiple independent buses do not interfere', async () => {
    const busA = createBus<TestEvents>();
    const busB = createBus<TestEvents>();

    const subA = busA.on('ping', (d) => ({ from: 'A' as const, ...d }));
    const subB = busB.on('ping', (d) => ({ from: 'B' as const, ...d }));

    const wireA = wireStream(subA);
    const wireB = wireStream(subB);

    // Emit only on bus A
    await runCmd(busA.emit('ping', { ts: 10 }));

    expect(wireA.received).toEqual([{ from: 'A', ts: 10 }]);
    expect(wireB.received).toEqual([]);

    // Emit only on bus B
    await runCmd(busB.emit('ping', { ts: 20 }));

    expect(wireA.received).toEqual([{ from: 'A', ts: 10 }]);
    expect(wireB.received).toEqual([{ from: 'B', ts: 20 }]);
  });

  it('emit returns a Cmd with perform kind', () => {
    const bus = createBus<TestEvents>();
    const cmd = bus.emit('ping', { ts: 0 });

    expect(cmd._tag).toBe('cmd');
    expect(cmdKind(cmd).kind).toBe('perform');
  });

  it('on returns a Sub with stream kind', () => {
    const bus = createBus<TestEvents>();
    const sub = bus.on('ping', (d) => d);

    expect(sub._tag).toBe('sub');
    expect(subKind(sub).kind).toBe('stream');
  });

  it('each on() call gets a unique stream id', () => {
    const bus = createBus<TestEvents>();
    const sub1 = bus.on('ping', (d) => d);
    const sub2 = bus.on('ping', (d) => d);

    const id1 = subKind(sub1).id;
    const id2 = subKind(sub2).id;

    expect(id1).not.toBe(id2);
  });
});
