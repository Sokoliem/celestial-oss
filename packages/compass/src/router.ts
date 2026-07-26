import {
  createHistory,
  currentLocation,
  goBack,
  goForward,
  type HistoryState,
  normalizeHistory,
  pushHistory,
  replaceHistory,
} from './history.js';
import { captureObject, diagnosticUnknown, freezeSnapshot } from './internal.js';
import { matchValidatedRoutes, type RouteDefinition, type RouteMatch, validateRouteDefinitions } from './match.js';
import { type LocalUrlInput, type ParsedUrl, toParsedUrl } from './url.js';

export interface RouterConfig<RouteId extends string = string> {
  readonly routes: readonly RouteDefinition<RouteId>[];
  readonly initialLocation?: LocalUrlInput;
}

export interface RouterModel {
  readonly history: HistoryState;
}

export type RouterMsg =
  | { readonly type: 'router:navigate'; readonly location: LocalUrlInput }
  | { readonly type: 'router:replace'; readonly location: LocalUrlInput }
  | { readonly type: 'router:back' }
  | { readonly type: 'router:forward' };

export interface RouterDiagnostic {
  readonly code: 'route-not-found';
  readonly message: string;
  readonly href: string;
}

export type RouterResolution<RouteId extends string = string> =
  | {
      readonly status: 'matched';
      readonly location: ParsedUrl;
      readonly match: RouteMatch<RouteId>;
      readonly diagnostic: null;
    }
  | {
      readonly status: 'not-found';
      readonly location: ParsedUrl;
      readonly match: null;
      readonly diagnostic: RouterDiagnostic;
    };

export interface Router<RouteId extends string = string> {
  readonly init: (initialLocation?: LocalUrlInput) => RouterModel;
  readonly resolve: (model: RouterModel) => RouterResolution<RouteId>;
  readonly update: (msg: RouterMsg, model: RouterModel) => RouterModel;
}

const ROUTER_MODEL_SNAPSHOTS = new WeakSet<object>();

function modelFromHistory(history: HistoryState): RouterModel {
  const snapshot = freezeSnapshot({ history });
  ROUTER_MODEL_SNAPSHOTS.add(snapshot);
  return snapshot;
}

function normalizeRouterModel(model: RouterModel): RouterModel {
  if (
    model !== null &&
    typeof model === 'object' &&
    ROUTER_MODEL_SNAPSHOTS.has(model)
  ) {
    return model;
  }
  const captured = captureObject(model, 'Router model', ['history']);
  const history = normalizeHistory(captured.values.history as HistoryState);
  return modelFromHistory(history);
}

export function createRouter<RouteId extends string = string>(config: RouterConfig<RouteId>): Router<RouteId> {
  const capturedConfig = captureObject(config, 'Router config', ['routes'], ['initialLocation']);
  const routes = validateRouteDefinitions(capturedConfig.values.routes as readonly RouteDefinition<RouteId>[]);
  const configuredInitial = toParsedUrl(
    !capturedConfig.present.has('initialLocation') || capturedConfig.values.initialLocation === undefined
      ? '/'
      : (capturedConfig.values.initialLocation as LocalUrlInput),
  );

  const init = (initialLocation: LocalUrlInput = configuredInitial): RouterModel => modelFromHistory(createHistory(initialLocation));

  const resolve = (model: RouterModel): RouterResolution<RouteId> => {
    const normalized = normalizeRouterModel(model);
    const location = currentLocation(normalized.history);
    const match = matchValidatedRoutes(routes, location);
    if (match !== null) {
      return freezeSnapshot({ status: 'matched', location, match, diagnostic: null });
    }
    const diagnostic = freezeSnapshot({
      code: 'route-not-found' as const,
      message: `No route matches "${location.href}"`,
      href: location.href,
    });
    return freezeSnapshot({ status: 'not-found', location, match: null, diagnostic });
  };

  const update = (msg: RouterMsg, model: RouterModel): RouterModel => {
    const normalized = normalizeRouterModel(model);
    const capturedMessage = captureObject(msg, 'Router message', ['type'], ['location']);
    const type = capturedMessage.values.type;
    if (typeof type !== 'string') {
      throw new TypeError('Router message must be a namespaced message object');
    }

    let history: HistoryState;
    switch (type) {
      case 'router:navigate': {
        if (!capturedMessage.present.has('location')) {
          throw new TypeError('router:navigate location must be an own data URL descriptor or string');
        }
        history = pushHistory(normalized.history, capturedMessage.values.location as LocalUrlInput);
        break;
      }
      case 'router:replace': {
        if (!capturedMessage.present.has('location')) {
          throw new TypeError('router:replace location must be an own data URL descriptor or string');
        }
        history = replaceHistory(normalized.history, capturedMessage.values.location as LocalUrlInput);
        break;
      }
      case 'router:back':
        history = goBack(normalized.history);
        break;
      case 'router:forward':
        history = goForward(normalized.history);
        break;
      default:
        throw new RangeError(`Unknown router message type "${diagnosticUnknown(type)}"`);
    }
    return history === normalized.history ? normalized : modelFromHistory(history);
  };

  return freezeSnapshot({ init, resolve, update });
}
