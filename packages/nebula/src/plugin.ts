/**
 * Nebula Plugin System
 *
 * Formalizes the AppConfig wrapping pattern used by developer tooling
 * (see packages/chronos/src/wrapper.ts) into a first-class plugin interface.
 *
 * Plugins transform an AppConfig by wrapping its lifecycle functions.
 * The `wrap` function gives full control over init, update, view, and subscriptions.
 */

import type { AppConfig } from './app.js';
import type { VNode } from './vdom.js';

// ─── Plugin Interface ────────────────────────────────────────────────────────

/**
 * A Plugin transforms an AppConfig, wrapping its lifecycle functions.
 * This is the formalized version of the pattern used by withChronos.
 */
export interface Plugin<Model, M> {
  /** Plugin name (for debugging/identification) */
  readonly name: string;

  /**
   * Wrap the entire AppConfig. This is the most powerful hook --
   * it can intercept init, update, view, and subscriptions.
   */
  wrap?: (config: AppConfig<Model, M>) => AppConfig<Model, M>;

  /**
   * Called by the runtime between phases of `replaceConfig`. Plugins that
   * hold module-scoped resources (sockets, child processes, ports, timers,
   * registry entries) use this hook to drain prior-version state before
   * the next config takes over.
   *
   * Idempotent: implementations must tolerate being called multiple times.
   * Errors thrown here are caught by the runtime and forwarded to
   * onRenderError; they do not abort the swap.
   */
  onConfigSwap?: (info: ConfigSwapInfo<Model, M>) => void;
}

export interface ConfigSwapInfo<Model, M> {
  prev: AppConfig<Model, M>;
  next: AppConfig<Model, M>;
  prevVersion: number;
  nextVersion: number;
}

// ─── Composition ─────────────────────────────────────────────────────────────

/**
 * Symbol marking a config as plugin-decorated. The runtime reads this on
 * app() construction and on replaceConfig to dispatch onConfigSwap callbacks.
 * Symbol-keyed so it never collides with user model fields.
 */
export const PLUGINS_SYMBOL = Symbol.for('@celestial/nebula/plugins');

/**
 * Apply a sequence of plugins to an AppConfig.
 * Plugins are applied left-to-right (first plugin wraps first).
 *
 * The plugin list is attached to the resulting config under PLUGINS_SYMBOL so
 * the runtime can call onConfigSwap on each plugin during replaceConfig.
 */
export function withPlugins<Model, M>(config: AppConfig<Model, M>, plugins: Plugin<Model, M>[]): AppConfig<Model, M> {
  let result = config;

  for (const plugin of plugins) {
    if (plugin.wrap) {
      result = plugin.wrap(result);
    }
  }

  // Attach the plugin registry — the runtime uses this to dispatch
  // onConfigSwap. Use defineProperty so the symbol field doesn't show up
  // in user enumerations of config.
  Object.defineProperty(result, PLUGINS_SYMBOL, {
    value: plugins,
    enumerable: false,
    configurable: true,
  });

  return result;
}

/** Read the plugin list attached by withPlugins. Returns [] if none. */
export function getAttachedPlugins<Model, M>(config: AppConfig<Model, M>): Plugin<Model, M>[] {
  const value = (config as unknown as Record<symbol, unknown>)[PLUGINS_SYMBOL];
  return Array.isArray(value) ? (value as Plugin<Model, M>[]) : [];
}

// ─── Convenience Creators ────────────────────────────────────────────────────

/**
 * Create a plugin from simple lifecycle hooks (convenience over full wrap).
 *
 * Internally constructs a `wrap` function that composes the hooks into
 * the appropriate lifecycle interception points.
 */
export function createPlugin<Model, M>(
  name: string,
  hooks: {
    onInit?: (model: Model) => void;
    beforeUpdate?: (msg: M, model: Model) => void;
    afterUpdate?: (msg: M, prevModel: Model, nextModel: Model) => void;
    wrapView?: (view: (model: Model) => VNode) => (model: Model) => VNode;
  },
): Plugin<Model, M> {
  return {
    name,
    wrap(config: AppConfig<Model, M>): AppConfig<Model, M> {
      const wrappedInit = hooks.onInit
        ? (): [Model, ReturnType<AppConfig<Model, M>['init']>[1]] => {
            const [model, cmd] = config.init();
            hooks.onInit!(model);
            return [model, cmd];
          }
        : config.init;

      const wrappedUpdate =
        hooks.beforeUpdate || hooks.afterUpdate
          ? (msg: M, model: Model): [Model, ReturnType<AppConfig<Model, M>['update']>[1]] => {
              if (hooks.beforeUpdate) {
                hooks.beforeUpdate(msg, model);
              }
              const [newModel, cmd] = config.update(msg, model);
              if (hooks.afterUpdate) {
                hooks.afterUpdate(msg, model, newModel);
              }
              return [newModel, cmd];
            }
          : config.update;

      const wrappedView = hooks.wrapView ? hooks.wrapView(config.view) : config.view;

      return {
        ...config,
        init: wrappedInit,
        update: wrappedUpdate,
        view: wrappedView,
        subscriptions: config.subscriptions,
      };
    },
  };
}

/**
 * Create a plugin that logs all messages dispatched to update.
 */
export function loggerPlugin<Model, M>(options?: { filter?: (msg: M) => boolean; output?: (msg: M, model: Model) => void }): Plugin<Model, M> {
  const log: Array<{ msg: M; model: Model }> = [];
  const filter = options?.filter;
  const output = options?.output;

  const plugin: Plugin<Model, M> & { readonly log: Array<{ msg: M; model: Model }> } = {
    name: 'logger',
    log,
    wrap(config: AppConfig<Model, M>): AppConfig<Model, M> {
      return {
        ...config,
        update(msg: M, model: Model) {
          const shouldLog = filter ? filter(msg) : true;

          if (shouldLog) {
            log.push({ msg, model });
            if (output) {
              output(msg, model);
            }
          }

          return config.update(msg, model);
        },
      };
    },
  };

  return plugin;
}
