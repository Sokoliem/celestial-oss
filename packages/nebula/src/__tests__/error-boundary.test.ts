import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../app.js';
import { text } from '../elements.js';
import { type ErrorInfo, errorBoundary, simpleErrorBoundary } from '../error-boundary.js';
import { Cmd, Sub } from '../types.js';

// ─── Test helpers ───────────────────────────────────────────────────────────

type TestModel = { count: number };
type TestMsg = { type: 'increment' } | { type: 'crash' } | { type: 'retry' } | { type: 'report'; error: ErrorInfo };

function makeTestConfig(opts?: { crashOnUpdate?: boolean; crashOnView?: boolean; crashOnInit?: boolean }): AppConfig<TestModel, TestMsg> {
  return {
    init: () => {
      if (opts?.crashOnInit) throw new Error('init crash');
      return [{ count: 0 }, Cmd.none()];
    },
    update: (msg, model) => {
      if (opts?.crashOnUpdate && msg.type === 'crash') {
        throw new Error('update crash');
      }
      if (msg.type === 'increment') {
        return [{ count: model.count + 1 }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },
    view: (model) => {
      if (opts?.crashOnView && model.count > 5) {
        throw new Error('view crash');
      }
      return text(`Count: ${model.count}`);
    },
    subscriptions: () => Sub.none(),
  };
}

function makeBoundaryConfig(config: AppConfig<TestModel, TestMsg>, onError?: boolean) {
  return errorBoundary(config, {
    fallbackView: (error, _retry) => text(`Error: ${error.message}`),
    retryMsg: { type: 'retry' } as TestMsg,
    onError: onError ? (error) => ({ type: 'report', error }) as TestMsg : undefined,
    maxRetries: 3,
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('errorBoundary', () => {
  describe('normal operation', () => {
    it('initializes inner config normally', () => {
      const config = makeTestConfig();
      const bounded = makeBoundaryConfig(config);
      const [model, _cmd] = bounded.init();

      expect(model.innerModel.count).toBe(0);
      expect(model.error).toBeNull();
      expect(model.inFallback).toBe(false);
    });

    it('passes updates through to inner config', () => {
      const config = makeTestConfig();
      const bounded = makeBoundaryConfig(config);
      const [initModel] = bounded.init();

      const [model] = bounded.update({ type: 'increment' }, initModel);
      expect(model.innerModel.count).toBe(1);
      expect(model.error).toBeNull();
      expect(model.inFallback).toBe(false);
    });

    it('renders inner view normally', () => {
      const config = makeTestConfig();
      const bounded = makeBoundaryConfig(config);
      const [initModel] = bounded.init();

      const vnode = bounded.view(initModel) as { kind: string; content: string };
      expect(vnode.kind).toBe('text');
      expect(vnode.content).toBe('Count: 0');
    });

    it('passes subscriptions through', () => {
      const config = makeTestConfig();
      const bounded = makeBoundaryConfig(config);
      const [initModel] = bounded.init();

      const sub = bounded.subscriptions(initModel);
      expect(sub._tag).toBe('sub');
    });
  });

  describe('catching init errors', () => {
    it('catches init errors and enters fallback', () => {
      const config = makeTestConfig({ crashOnInit: true });
      const bounded = makeBoundaryConfig(config);
      const [model] = bounded.init();

      expect(model.inFallback).toBe(true);
      expect(model.error).not.toBeNull();
      expect(model.error!.phase).toBe('init');
      expect(model.error!.message).toBe('init crash');
      expect(model.errorCount).toBe(1);
    });

    it('renders fallback view after init error', () => {
      const config = makeTestConfig({ crashOnInit: true });
      const bounded = makeBoundaryConfig(config);
      const [model] = bounded.init();

      const vnode = bounded.view(model) as { kind: string; content: string };
      expect(vnode.content).toBe('Error: init crash');
    });
  });

  describe('catching update errors', () => {
    it('catches update errors and enters fallback', () => {
      const config = makeTestConfig({ crashOnUpdate: true });
      const bounded = makeBoundaryConfig(config);
      const [initModel] = bounded.init();

      const [model] = bounded.update({ type: 'crash' }, initModel);
      expect(model.inFallback).toBe(true);
      expect(model.error!.phase).toBe('update');
      expect(model.error!.message).toBe('update crash');
    });

    it('renders fallback view after update error', () => {
      const config = makeTestConfig({ crashOnUpdate: true });
      const bounded = makeBoundaryConfig(config);
      const [initModel] = bounded.init();
      const [errorModel] = bounded.update({ type: 'crash' }, initModel);

      const vnode = bounded.view(errorModel) as { kind: string; content: string };
      expect(vnode.content).toBe('Error: update crash');
    });
  });

  describe('catching view errors', () => {
    it('catches view errors and shows fallback', () => {
      const config = makeTestConfig({ crashOnView: true });
      const bounded = makeBoundaryConfig(config);
      const [initModel] = bounded.init();

      // Set count > 5 to trigger view crash
      const model = { ...initModel, innerModel: { count: 10 } };
      const vnode = bounded.view(model) as { kind: string; content: string };
      expect(vnode.content).toBe('Error: view crash');
    });
  });

  describe('recovery via retry', () => {
    it('retries by re-initializing on retry message', () => {
      const config = makeTestConfig({ crashOnUpdate: true });
      const bounded = makeBoundaryConfig(config);
      const [initModel] = bounded.init();

      // Crash
      const [errorModel] = bounded.update({ type: 'crash' }, initModel);
      expect(errorModel.inFallback).toBe(true);

      // Retry (config no longer crashes on init, so retry succeeds)
      const [recoveredModel] = bounded.update({ type: 'retry' }, errorModel);
      expect(recoveredModel.inFallback).toBe(false);
      expect(recoveredModel.innerModel.count).toBe(0); // re-initialized
    });

    it('ignores non-retry messages in fallback', () => {
      const config = makeTestConfig({ crashOnUpdate: true });
      const bounded = makeBoundaryConfig(config);
      const [initModel] = bounded.init();

      const [errorModel] = bounded.update({ type: 'crash' }, initModel);
      const [stillError] = bounded.update({ type: 'increment' }, errorModel);

      expect(stillError.inFallback).toBe(true);
    });

    it('enforces max retries', () => {
      // Config that always crashes on init
      const config = makeTestConfig({ crashOnInit: true });
      const bounded = makeBoundaryConfig(config);
      const [initModel] = bounded.init();

      // errorCount starts at 1 from the init crash
      let model = initModel;
      // Try to retry 3 times (already at count 1)
      for (let i = 0; i < 3; i++) {
        const [next] = bounded.update({ type: 'retry' }, model);
        model = next;
      }

      // After max retries, should stay in fallback
      expect(model.inFallback).toBe(true);
      expect(model.errorCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('error reporting', () => {
    it('fires onError when configured', () => {
      const config = makeTestConfig({ crashOnInit: true });
      const bounded = makeBoundaryConfig(config, true);
      const [_model, cmd] = bounded.init();

      // The cmd should be a perform that produces the error report message
      expect(cmd._tag).toBe('cmd');
    });
  });

  describe('subscriptions in fallback', () => {
    it('returns Sub.none when in fallback', () => {
      const config = makeTestConfig({ crashOnInit: true });
      const bounded = makeBoundaryConfig(config);
      const [model] = bounded.init();

      const sub = bounded.subscriptions(model);
      expect(sub._kind.kind).toBe('none');
    });
  });

  describe('resets error count on success', () => {
    it('resets errorCount after successful update', () => {
      const config = makeTestConfig();
      const bounded = makeBoundaryConfig(config);
      const [initModel] = bounded.init();

      const [model] = bounded.update({ type: 'increment' }, initModel);
      expect(model.errorCount).toBe(0);
    });
  });
});

// ─── simpleErrorBoundary ────────────────────────────────────────────────────

describe('simpleErrorBoundary', () => {
  it('creates a boundary with text fallback', () => {
    const config = makeTestConfig({ crashOnInit: true });
    const bounded = simpleErrorBoundary(config, { type: 'retry' } as TestMsg);
    const [model] = bounded.init();

    const vnode = bounded.view(model) as { kind: string; content: string };
    expect(vnode.content).toContain('init crash');
    expect(vnode.content).toContain('init');
  });

  it('normal operation passes through', () => {
    const config = makeTestConfig();
    const bounded = simpleErrorBoundary(config, { type: 'retry' } as TestMsg);
    const [model] = bounded.init();

    const vnode = bounded.view(model) as { kind: string; content: string };
    expect(vnode.content).toBe('Count: 0');
  });
});
