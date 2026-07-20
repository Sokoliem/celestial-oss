import { describe, expect, it } from 'vitest';
import { classifyMessagePriority, createRenderCauseBuilder, extractMsgType } from '../message-priority.js';

describe('extractMsgType()', () => {
  it('returns null for null and undefined', () => {
    expect(extractMsgType(null)).toBe(null);
    expect(extractMsgType(undefined)).toBe(null);
  });

  it('returns the string itself for string messages', () => {
    expect(extractMsgType('keyDown')).toBe('keyDown');
  });

  it('extracts type field from object messages', () => {
    expect(extractMsgType({ type: 'KeyPressed' })).toBe('KeyPressed');
  });

  it('extracts kind field from object messages', () => {
    expect(extractMsgType({ kind: 'MouseMove' })).toBe('MouseMove');
  });

  it('extracts tag field from object messages', () => {
    expect(extractMsgType({ tag: 'FetchDone' })).toBe('FetchDone');
  });

  it('prefers type over kind over tag', () => {
    expect(extractMsgType({ type: 'A', kind: 'B', tag: 'C' })).toBe('A');
  });

  it('returns null for objects without type/kind/tag', () => {
    expect(extractMsgType({ value: 42 })).toBe(null);
    expect(extractMsgType({})).toBe(null);
  });

  it('returns null for non-string type fields', () => {
    expect(extractMsgType({ type: 42 })).toBe(null);
    expect(extractMsgType({ type: true })).toBe(null);
  });

  it('returns null for numbers and booleans', () => {
    expect(extractMsgType(42)).toBe(null);
    expect(extractMsgType(true)).toBe(null);
  });
});

describe('classifyMessagePriority()', () => {
  describe('user-blocking classification', () => {
    it('classifies key-related messages as user-blocking', () => {
      expect(classifyMessagePriority({ type: 'KeyPressed' })).toBe('user-blocking');
      expect(classifyMessagePriority({ type: 'keyDown' })).toBe('user-blocking');
      expect(classifyMessagePriority('key')).toBe('user-blocking');
    });

    it('classifies mouse-related messages as user-blocking', () => {
      expect(classifyMessagePriority({ type: 'MouseMove' })).toBe('user-blocking');
      expect(classifyMessagePriority({ type: 'mouseDown' })).toBe('user-blocking');
    });

    it('classifies click messages as user-blocking', () => {
      expect(classifyMessagePriority({ type: 'Click' })).toBe('user-blocking');
      expect(classifyMessagePriority({ type: 'onClick' })).toBe('user-blocking');
    });

    it('classifies paste messages as user-blocking', () => {
      expect(classifyMessagePriority({ type: 'PasteReceived' })).toBe('user-blocking');
    });

    it('classifies resize messages as user-blocking', () => {
      expect(classifyMessagePriority({ type: 'Resize' })).toBe('user-blocking');
    });

    it('classifies focus messages as user-blocking', () => {
      expect(classifyMessagePriority({ type: 'FocusChanged' })).toBe('user-blocking');
    });

    it('classifies scroll messages as user-blocking', () => {
      expect(classifyMessagePriority({ type: 'ScrollDelta' })).toBe('user-blocking');
    });

    it('classifies input messages as user-blocking', () => {
      expect(classifyMessagePriority({ type: 'InputChanged' })).toBe('user-blocking');
    });

    it('classifies hover messages as user-blocking', () => {
      expect(classifyMessagePriority({ type: 'HoverEnter' })).toBe('user-blocking');
    });

    it('classifies drag messages as user-blocking', () => {
      expect(classifyMessagePriority({ type: 'DragStart' })).toBe('user-blocking');
    });

    it('classifies wheel messages as user-blocking', () => {
      expect(classifyMessagePriority({ type: 'WheelEvent' })).toBe('user-blocking');
    });
  });

  describe('background classification', () => {
    it('classifies agent messages as background', () => {
      expect(classifyMessagePriority({ type: 'AgentResponse' })).toBe('background');
    });

    it('classifies stream messages as background', () => {
      expect(classifyMessagePriority({ type: 'StreamChunk' })).toBe('background');
    });

    it('classifies fetch messages as background', () => {
      expect(classifyMessagePriority({ type: 'FetchDone' })).toBe('background');
    });

    it('classifies load messages as background', () => {
      expect(classifyMessagePriority({ type: 'DataLoaded' })).toBe('background');
    });

    it('classifies websocket messages as background', () => {
      expect(classifyMessagePriority({ type: 'WebSocketMessage' })).toBe('background');
    });

    it('classifies SSE messages as background', () => {
      expect(classifyMessagePriority({ type: 'SSEEvent' })).toBe('background');
    });

    it('classifies data messages as background', () => {
      expect(classifyMessagePriority({ type: 'DataReceived' })).toBe('background');
    });

    it('classifies chunk messages as background', () => {
      expect(classifyMessagePriority({ type: 'ChunkArrived' })).toBe('background');
    });

    it('classifies response messages as background', () => {
      expect(classifyMessagePriority({ type: 'ResponseComplete' })).toBe('background');
    });
  });

  describe('normal (default) classification', () => {
    it('classifies timer messages as normal', () => {
      expect(classifyMessagePriority({ type: 'Tick' })).toBe('normal');
    });

    it('classifies animation messages as normal', () => {
      expect(classifyMessagePriority({ type: 'AnimationFrame' })).toBe('normal');
    });

    it('classifies unknown messages as normal', () => {
      expect(classifyMessagePriority({ type: 'SomethingElse' })).toBe('normal');
    });

    it('classifies null/undefined as normal', () => {
      expect(classifyMessagePriority(null)).toBe('normal');
      expect(classifyMessagePriority(undefined)).toBe('normal');
    });

    it('classifies objects without type as normal', () => {
      expect(classifyMessagePriority({ value: 42 })).toBe('normal');
    });
  });

  describe('supports kind and tag discriminants', () => {
    it('classifies via kind field', () => {
      expect(classifyMessagePriority({ kind: 'KeyDown' })).toBe('user-blocking');
      expect(classifyMessagePriority({ kind: 'FetchResult' })).toBe('background');
    });

    it('classifies via tag field', () => {
      expect(classifyMessagePriority({ tag: 'MouseClick' })).toBe('user-blocking');
      expect(classifyMessagePriority({ tag: 'StreamEnd' })).toBe('background');
    });
  });
});

describe('RenderCauseBuilder', () => {
  it('creates a basic render cause', () => {
    const builder = createRenderCauseBuilder('KeyPressed', 'user-blocking');
    const cause = builder.finalize();

    expect(cause.msgType).toBe('KeyPressed');
    expect(cause.priority).toBe('user-blocking');
    expect(cause.yielded).toBe(false);
    expect(cause.yieldCount).toBe(0);
    expect(cause.interrupted).toBe(false);
    expect(cause.totalMs).toBeGreaterThanOrEqual(0);
    expect(cause.phases).toEqual([]);
  });

  it('tracks phases', () => {
    const builder = createRenderCauseBuilder('Tick', 'normal');
    builder.beginPhase('view');
    builder.endPhase();
    builder.beginPhase('layout');
    builder.endPhase();
    const cause = builder.finalize();

    expect(cause.phases).toHaveLength(2);
    expect(cause.phases[0]!.name).toBe('view');
    expect(cause.phases[1]!.name).toBe('layout');
    expect(cause.phases[0]!.ms).toBeGreaterThanOrEqual(0);
    expect(cause.phases[1]!.ms).toBeGreaterThanOrEqual(0);
  });

  it('tracks yields', () => {
    const builder = createRenderCauseBuilder('Tick', 'normal');
    builder.recordYield();
    builder.recordYield();
    const cause = builder.finalize();

    expect(cause.yielded).toBe(true);
    expect(cause.yieldCount).toBe(2);
  });

  it('tracks interruption', () => {
    const builder = createRenderCauseBuilder('DataLoaded', 'background');
    builder.recordInterrupt();
    const cause = builder.finalize();

    expect(cause.interrupted).toBe(true);
  });

  it('auto-closes open phases on finalize', () => {
    const builder = createRenderCauseBuilder('Tick', 'normal');
    builder.beginPhase('view');
    // Do not call endPhase — finalize should close it
    const cause = builder.finalize();

    expect(cause.phases).toHaveLength(1);
    expect(cause.phases[0]!.name).toBe('view');
    expect(cause.phases[0]!.ms).toBeGreaterThanOrEqual(0);
  });
});
