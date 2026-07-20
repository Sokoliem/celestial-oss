/**
 * Nebula Error Boundaries
 *
 * Wraps components to catch render/update errors, display fallback views,
 * and provide error recovery strategies.
 */

import type { AppConfig } from './app.js';
import { Cmd, Sub } from './types.js';
import type { VNode } from './vdom.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ErrorInfo {
  /** The error that was caught */
  readonly error: unknown;
  /** Human-readable error message */
  readonly message: string;
  /** Phase where the error occurred */
  readonly phase: 'init' | 'update' | 'view' | 'subscriptions';
  /** Timestamp when the error was caught */
  readonly timestamp: number;
}

export type RecoveryStrategy = 'retry' | 'reset' | 'fallback';

export interface ErrorBoundaryOptions<M> {
  /** View to render when an error occurs */
  fallbackView: (error: ErrorInfo, retry: M) => VNode;
  /** Message to dispatch for retry attempts */
  retryMsg: M;
  /** Predicate to identify retry messages (uses deep equality by default) */
  isRetry?: (msg: M) => boolean;
  /** Message dispatched when an error is caught (for reporting) */
  onError?: (error: ErrorInfo) => M;
  /** Maximum consecutive errors before permanent fallback (default: 3) */
  maxRetries?: number;
}

interface BoundaryState<Model> {
  innerModel: Model;
  error: ErrorInfo | null;
  errorCount: number;
  inFallback: boolean;
}

// ─── Error extraction helper ────────────────────────────────────────────────

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

/** Default retry check using JSON deep equality */
function defaultIsRetry<M>(retryMsg: M): (msg: M) => boolean {
  const serialized = JSON.stringify(retryMsg);
  return (msg: M) => JSON.stringify(msg) === serialized;
}

// ─── Error boundary wrapper ─────────────────────────────────────────────────

/**
 * Wrap an AppConfig with error boundary protection.
 *
 * If the wrapped config's update or view throws, the error boundary
 * catches the error and renders a fallback view. The app can recover
 * by dispatching the retryMsg, which resets the error state.
 */
export function errorBoundary<Model, M>(config: AppConfig<Model, M>, options: ErrorBoundaryOptions<M>): AppConfig<BoundaryState<Model>, M> {
  const maxRetries = options.maxRetries ?? 3;
  const isRetry = options.isRetry ?? defaultIsRetry(options.retryMsg);

  return {
    init(): [BoundaryState<Model>, Cmd<M>] {
      try {
        const [innerModel, cmd] = config.init();
        return [{ innerModel, error: null, errorCount: 0, inFallback: false }, cmd];
      } catch (err: unknown) {
        const errorInfo: ErrorInfo = {
          error: err,
          message: extractMessage(err),
          phase: 'init',
          timestamp: Date.now(),
        };
        const state: BoundaryState<Model> = {
          innerModel: undefined as unknown as Model,
          error: errorInfo,
          errorCount: 1,
          inFallback: true,
        };
        const cmd = options.onError
          ? Cmd.perform(
              async () => errorInfo,
              (info) => options.onError!(info),
            )
          : Cmd.none<M>();
        return [state, cmd];
      }
    },

    update(msg: M, model: BoundaryState<Model>): [BoundaryState<Model>, Cmd<M>] {
      // Handle retry message
      if (isRetry(msg) && model.inFallback) {
        if (model.errorCount >= maxRetries) {
          // Max retries exceeded — stay in fallback
          return [model, Cmd.none()];
        }

        // Try re-initializing
        try {
          const [innerModel, cmd] = config.init();
          return [{ innerModel, error: null, errorCount: model.errorCount, inFallback: false }, cmd];
        } catch (err: unknown) {
          const errorInfo: ErrorInfo = {
            error: err,
            message: extractMessage(err),
            phase: 'init',
            timestamp: Date.now(),
          };
          return [
            { ...model, error: errorInfo, errorCount: model.errorCount + 1 },
            options.onError
              ? Cmd.perform(
                  async () => errorInfo,
                  (info) => options.onError!(info),
                )
              : Cmd.none(),
          ];
        }
      }

      // If in fallback, only handle retry
      if (model.inFallback) {
        return [model, Cmd.none()];
      }

      // Normal update — catch errors
      try {
        const [newInnerModel, cmd] = config.update(msg, model.innerModel);
        return [{ innerModel: newInnerModel, error: null, errorCount: 0, inFallback: false }, cmd];
      } catch (err: unknown) {
        const errorInfo: ErrorInfo = {
          error: err,
          message: extractMessage(err),
          phase: 'update',
          timestamp: Date.now(),
        };
        const newState: BoundaryState<Model> = {
          ...model,
          error: errorInfo,
          errorCount: model.errorCount + 1,
          inFallback: true,
        };
        return [
          newState,
          options.onError
            ? Cmd.perform(
                async () => errorInfo,
                (info) => options.onError!(info),
              )
            : Cmd.none(),
        ];
      }
    },

    view(model: BoundaryState<Model>): VNode {
      if (model.inFallback && model.error) {
        return options.fallbackView(model.error, options.retryMsg);
      }

      try {
        return config.view(model.innerModel);
      } catch (err: unknown) {
        const errorInfo: ErrorInfo = {
          error: err,
          message: extractMessage(err),
          phase: 'view',
          timestamp: Date.now(),
        };
        return options.fallbackView(errorInfo, options.retryMsg);
      }
    },

    subscriptions(model: BoundaryState<Model>): Sub<M> {
      if (model.inFallback) {
        return Sub.none();
      }

      try {
        return config.subscriptions(model.innerModel);
      } catch (_err: unknown) {
        return Sub.none();
      }
    },
  };
}

// ─── Utility: create a simple error boundary config ─────────────────────────

/**
 * Create a simple error boundary that shows an error message text node.
 * This is a convenience for the common case of a text-only fallback.
 */
export function simpleErrorBoundary<Model, M>(
  config: AppConfig<Model, M>,
  retryMsg: M,
  opts?: { maxRetries?: number; onError?: (error: ErrorInfo) => M },
): AppConfig<BoundaryState<Model>, M> {
  return errorBoundary(config, {
    fallbackView: (error) => ({
      kind: 'text',
      content: `Error: ${error.message} (${error.phase})`,
    }),
    retryMsg,
    maxRetries: opts?.maxRetries,
    onError: opts?.onError,
  });
}
