import {
  type AppConfig,
  border,
  box,
  Cmd,
  column,
  defaultTheme,
  event,
  getTerminalSize,
  type Result,
  row,
  runtime,
  scroll,
  style,
  Sub,
  text,
  type VNode,
} from '@celestial/core';
import {
  alert,
  badge,
  drawer,
  select,
  type SelectModel,
  type SelectMsg,
  tabs,
  type TabsModel,
  type TabsMsg,
  textarea,
  type TextareaModel,
  type TextareaMsg,
  textInput,
  type TextInputModel,
  type TextInputMsg,
} from '@celestial/ui';
import { createApiRuntime, type ApiRequest, type ApiResponse, type ApiRuntime, type ApiRuntimeEvent } from './server.js';

export interface HistoryEntry {
  id: number;
  request: ApiRequest;
  response?: ApiResponse;
  error?: string;
}

export type InspectorFocus = 'method' | 'path' | 'body';

export interface ApiInspectorModel {
  method: SelectModel;
  path: TextInputModel;
  body: TextareaModel;
  responseTabs: TabsModel;
  response?: ApiResponse;
  requestError?: string;
  loading: boolean;
  history: HistoryEntry[];
  historyOpen: boolean;
  focus: InspectorFocus;
  serverState: 'starting' | 'ready' | 'error';
  serverLabel: string;
  cols: number;
  rows: number;
  nextHistoryId: number;
  mobilePane: 'request' | 'response';
}

export type ApiInspectorMsg =
  | { type: 'method'; msg: SelectMsg }
  | { type: 'path'; msg: TextInputMsg }
  | { type: 'body'; msg: TextareaMsg }
  | { type: 'response-tabs'; msg: TabsMsg }
  | { type: 'send' }
  | { type: 'request-result'; request: ApiRequest; result: Result<ApiResponse, Error> }
  | { type: 'server-event'; event: ApiRuntimeEvent }
  | { type: 'focus-next' }
  | { type: 'focus-control'; focus: InspectorFocus }
  | { type: 'toggle-history' }
  | { type: 'show-mobile'; pane: 'request' | 'response' }
  | { type: 'select-history'; index: number }
  | { type: 'reset' }
  | { type: 'set-path'; value: string }
  | { type: 'set-body'; value: string }
  | { type: 'set-method'; index: number }
  | { type: 'mouse'; handlerTag: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'escape' }
  | { type: 'quit' }
  | { type: 'noop' };

export interface ApiInspectorOptions {
  runtime?: ApiRuntime;
  initialSize?: { cols: number; rows: number };
}

const methods = [
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
] as const;

const surfaceStyle = style({ border: border.rounded, color: defaultTheme.colors.border, padding: 1 });
const focusedSurfaceStyle = style({ border: border.rounded, color: defaultTheme.colors.borderActive, padding: 1 });
const headingStyle = style({ color: defaultTheme.colors.tones.accent, bold: true });
const mutedStyle = style({ color: defaultTheme.colors.muted, dim: true });
const actionStyle = style({ color: defaultTheme.colors.interactive, bold: true });
const errorStyle = style({ color: defaultTheme.colors.tones.danger });

function textareaValue(model: TextareaModel): string {
  return model.lines.join('\n');
}

function action(id: string, label: string, shortcut?: string): VNode {
  const node = event(
    `api-action:${id}`,
    text(`[${label}]`, actionStyle),
    { onClick: `api-action:${id}` },
    { label, intent: id, affordances: ['click'], cursor: 'pointer', keyboardHint: shortcut },
  );
  runtime.setVNodeMeta(node, { a11y: { role: 'button', label } });
  return node;
}

function focusable(id: InspectorFocus, label: string, child: VNode): VNode {
  const node = event(
    `api-focus:${id}`,
    child,
    { onClick: `api-focus:${id}` },
    { label, intent: 'focus', affordances: ['click'], cursor: 'text' },
  );
  runtime.setVNodeMeta(node, { a11y: { role: id === 'method' ? 'listbox' : 'textbox', label } });
  return node;
}

function panel(title: string, child: VNode, focused = false): VNode {
  return box(column(text(title, headingStyle), text(''), child), focused ? focusedSurfaceStyle : surfaceStyle, { overflow: 'hidden' });
}

function statusVariant(status: number): 'success' | 'warning' | 'danger' | 'info' {
  if (status >= 500) return 'danger';
  if (status >= 400) return 'warning';
  if (status >= 200 && status < 300) return 'success';
  return 'info';
}

function withFocus(model: ApiInspectorModel, focus: InspectorFocus): ApiInspectorModel {
  return {
    ...model,
    focus,
    method: { ...model.method, focused: focus === 'method', open: focus === 'method' ? model.method.open : false },
    path: { ...model.path, focused: focus === 'path' },
    body: { ...model.body, focused: focus === 'body' },
  };
}

export function createApiInspectorApp(options: ApiInspectorOptions = {}): AppConfig<ApiInspectorModel, ApiInspectorMsg> {
  const apiRuntime = options.runtime ?? createApiRuntime();
  const terminalSize = options.initialSize ?? getTerminalSize();
  const methodComponent = select({ options: [...methods], selected: 0, focused: true, placeholder: 'HTTP method' });
  const pathComponent = textInput({ value: '/health', placeholder: 'Request path' });
  const bodyComponent = textarea({ value: '{\n  "hello": "celestial"\n}', placeholder: 'JSON request body', rows: 5, maxLines: 12, showLineNumbers: true });
  const responseTabsComponent = tabs({
    tabs: [
      { key: 'body', label: 'Body' },
      { key: 'headers', label: 'Headers' },
    ],
  });

  const [initialMethod] = methodComponent.init();
  const [initialPath] = pathComponent.init();
  const [initialBody] = bodyComponent.init();
  const [initialResponseTabs] = responseTabsComponent.init();

  const resetControls = (model: ApiInspectorModel): ApiInspectorModel => {
    const [method] = methodComponent.init();
    const [path] = pathComponent.init();
    const [body] = bodyComponent.init();
    return withFocus({ ...model, method, path, body, response: undefined, requestError: undefined, loading: false, mobilePane: 'request' }, 'method');
  };

  return {
    init() {
      return [
        {
          method: initialMethod,
          path: initialPath,
          body: initialBody,
          responseTabs: initialResponseTabs,
          loading: false,
          history: [],
          historyOpen: false,
          focus: 'method',
          serverState: 'starting',
          serverLabel: 'starting loopback server',
          cols: terminalSize.cols,
          rows: terminalSize.rows,
          nextHistoryId: 1,
          mobilePane: 'request',
        },
        Cmd.none(),
      ];
    },

    update(message, model) {
      switch (message.type) {
        case 'method': {
          const [method, cmd] = methodComponent.update(message.msg, model.method);
          return [{ ...model, method }, Cmd.map(cmd, (msg) => ({ type: 'method', msg }))];
        }
        case 'path': {
          const [path, cmd] = pathComponent.update(message.msg, model.path);
          return [{ ...model, path }, Cmd.map(cmd, (msg) => ({ type: 'path', msg }))];
        }
        case 'body': {
          const [body, cmd] = bodyComponent.update(message.msg, model.body);
          return [{ ...model, body }, Cmd.map(cmd, (msg) => ({ type: 'body', msg }))];
        }
        case 'response-tabs': {
          const [responseTabs, cmd] = responseTabsComponent.update(message.msg, model.responseTabs);
          return [{ ...model, responseTabs }, Cmd.map(cmd, (msg) => ({ type: 'response-tabs', msg }))];
        }
        case 'send': {
          if (model.loading || model.serverState === 'error') return [model, Cmd.none()];
          const request: ApiRequest = {
            method: methods[model.method.selected ?? 0]!.value,
            path: model.path.value,
            body: textareaValue(model.body),
            timeoutMs: 3_000,
          };
          return [
            { ...model, loading: true, requestError: undefined, mobilePane: 'response' },
            Cmd.attempt<ApiInspectorMsg, ApiResponse>((signal) => apiRuntime.request(request, signal), (result) => ({ type: 'request-result', request, result })),
          ];
        }
        case 'request-result': {
          const entry: HistoryEntry = message.result.ok
            ? { id: model.nextHistoryId, request: message.request, response: message.result.value }
            : {
                id: model.nextHistoryId,
                request: message.request,
                error: message.result.error instanceof Error ? message.result.error.message : String(message.result.error),
              };
          return [
            {
              ...model,
              loading: false,
              response: message.result.ok ? message.result.value : undefined,
              requestError: entry.error,
              history: [entry, ...model.history].slice(0, 20),
              nextHistoryId: model.nextHistoryId + 1,
              mobilePane: 'response',
            },
            Cmd.none(),
          ];
        }
        case 'server-event':
          return message.event.type === 'server-ready'
            ? [{ ...model, serverState: 'ready', serverLabel: '127.0.0.1 (ephemeral port)' }, Cmd.none()]
            : [{ ...model, serverState: 'error', serverLabel: message.event.message, requestError: message.event.message }, Cmd.none()];
        case 'focus-next': {
          const order: InspectorFocus[] = ['method', 'path', 'body'];
          const focus = order[(order.indexOf(model.focus) + 1) % order.length]!;
          return [withFocus(model, focus), Cmd.none()];
        }
        case 'focus-control':
          return [withFocus(model, message.focus), Cmd.none()];
        case 'toggle-history':
          return [{ ...model, historyOpen: !model.historyOpen }, Cmd.none()];
        case 'show-mobile':
          return [{ ...model, mobilePane: message.pane }, Cmd.none()];
        case 'select-history': {
          const entry = model.history[message.index];
          if (!entry) return [model, Cmd.none()];
          const methodIndex = methods.findIndex((method) => method.value === entry.request.method);
          return [
            withFocus(
              {
                ...model,
                method: { ...model.method, selected: methodIndex, highlighted: methodIndex, open: false },
                path: { ...model.path, value: entry.request.path, cursor: [...entry.request.path].length },
                body: { ...model.body, lines: entry.request.body.split('\n'), cursorRow: 0, cursorCol: 0 },
                response: entry.response,
                requestError: entry.error,
                historyOpen: false,
              },
              'method',
            ),
            Cmd.none(),
          ];
        }
        case 'reset':
          return [resetControls(model), Cmd.none()];
        case 'set-path':
          return [{ ...model, path: { ...model.path, value: message.value, cursor: [...message.value].length } }, Cmd.none()];
        case 'set-body':
          return [{ ...model, body: { ...model.body, lines: message.value.split('\n'), cursorRow: 0, cursorCol: 0 } }, Cmd.none()];
        case 'set-method': {
          const index = Math.max(0, Math.min(methods.length - 1, message.index));
          return [{ ...model, method: { ...model.method, selected: index, highlighted: index } }, Cmd.none()];
        }
        case 'mouse': {
          if (message.handlerTag.startsWith('api-focus:')) {
            return [withFocus(model, message.handlerTag.slice('api-focus:'.length) as InspectorFocus), Cmd.none()];
          }
          if (message.handlerTag === 'api-action:send') return this.update({ type: 'send' }, model);
          if (message.handlerTag === 'api-action:request-pane') return [{ ...model, mobilePane: 'request' }, Cmd.none()];
          if (message.handlerTag === 'api-action:response-pane') return [{ ...model, mobilePane: 'response' }, Cmd.none()];
          if (message.handlerTag === 'api-action:history') return [{ ...model, historyOpen: true }, Cmd.none()];
          if (message.handlerTag === 'api-action:reset') return [resetControls(model), Cmd.none()];
          if (message.handlerTag.startsWith('api-history:')) {
            return this.update({ type: 'select-history', index: Number(message.handlerTag.slice('api-history:'.length)) }, model);
          }
          if (model.historyOpen && (message.handlerTag.endsWith(':close') || message.handlerTag.includes(':backdrop:'))) {
            return [{ ...model, historyOpen: false }, Cmd.none()];
          }
          return [model, Cmd.none()];
        }
        case 'resize':
          return [{ ...model, cols: message.cols, rows: message.rows }, Cmd.none()];
        case 'escape':
          return model.historyOpen ? [{ ...model, historyOpen: false }, Cmd.none()] : [withFocus(model, 'method'), Cmd.none()];
        case 'quit':
          return [model, Cmd.quit()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },

    view(model) {
      const methodName = methods[model.method.selected ?? 0]!.label;
      const requestForm = column(
        text('Method', mutedStyle),
        focusable('method', 'HTTP method', methodComponent.view(model.method)),
        text(''),
        text('Path', mutedStyle),
        focusable('path', 'Request path', pathComponent.view(model.path)),
        text(''),
        text('Body', mutedStyle),
        focusable('body', 'JSON request body', bodyComponent.view(model.body)),
        text(''),
        row(action('send', model.loading ? 'Sending...' : 'Send', 'S / Ctrl+Enter'), text(' '), action('reset', 'Reset', 'R')),
      );

      let responseBody: VNode;
      if (model.loading) {
        responseBody = alert({ message: 'Request in flight. Abort timeout: 3 seconds.', variant: 'info', size: 'sm' }).view({ visible: true });
      } else if (model.requestError) {
        responseBody = alert({ title: 'Request failed', message: model.requestError, variant: 'danger', size: 'sm' }).view({ visible: true });
      } else if (model.response) {
        const headerLines = Object.entries(model.response.headers).map(([name, value]) => text(`${name}: ${value}`));
        const selectedContent = model.responseTabs.active === 0 ? text(model.response.body, undefined, { wrap: true }) : column(...headerLines);
        responseBody = column(
          row(
            badge({ label: `${model.response.status} ${model.response.statusText}`, variant: statusVariant(model.response.status), size: 'sm' }).view({ visible: true }),
            text(' '),
            badge({ label: `${Math.round(model.response.durationMs)} ms`, variant: 'info', size: 'sm' }).view({ visible: true }),
          ),
          text(''),
          responseTabsComponent.view(model.responseTabs),
          text(''),
          scroll(selectedContent, { height: Math.max(6, model.rows - 16) }),
        );
      } else {
        responseBody = column(text('No response yet.', mutedStyle), text('Send the default GET /health request to begin.'));
      }

      const requestPanel = panel(`${methodName} request`, requestForm, model.focus !== 'method' || model.method.focused);
      const responsePanel = panel('Response', responseBody);
      const main =
        model.cols >= 100
          ? row(runtime.flex(requestPanel, { flex: 2, minWidth: 42 }), runtime.flex(responsePanel, { flex: 3, minWidth: 50 }))
          : column(
              row(action('request-pane', model.mobilePane === 'request' ? 'Request active' : 'Request'), text(' '), action('response-pane', model.mobilePane === 'response' ? 'Response active' : 'Response')),
              model.mobilePane === 'request' ? requestPanel : responsePanel,
            );
      const header = row(
        text('Celestial API Inspector', headingStyle),
        text('  '),
        badge({ label: model.serverState, variant: model.serverState === 'ready' ? 'success' : model.serverState === 'error' ? 'danger' : 'info', size: 'sm' }).view({
          visible: true,
        }),
        text(` ${model.serverLabel}`, mutedStyle),
      );
      const base = column(
        header,
        text('Local routes: GET /health, /users, /slow?ms=500, /error; POST /echo', mutedStyle),
        text(''),
        main,
        row(action('history', `History ${model.history.length}`, 'H'), text('  Tab focus | S/Ctrl+Enter send | H history | R reset | Esc close | Q quit', mutedStyle)),
      );

      if (!model.historyOpen) return base;
      const historyRows =
        model.history.length === 0
          ? [text('No requests yet.', mutedStyle)]
          : model.history.map((entry, index) => {
              const label = `${entry.request.method} ${entry.request.path}  ${entry.response?.status ?? 'ERR'}`;
              const node = event(
                `api-history:${index}`,
                text(label, entry.error ? errorStyle : undefined),
                { onClick: `api-history:${index}` },
                { label, intent: 'restore', affordances: ['click'], cursor: 'pointer' },
              );
              runtime.setVNodeMeta(node, { a11y: { role: 'button', label } });
              return node;
            });
      const historyDrawerWidth = Math.min(model.cols, Math.min(48, Math.max(34, Math.floor(model.cols * 0.42))));
      const historyDrawerHeight = Math.max(1, Math.min(model.rows - 2, 22));
      const historyDrawer = drawer({
        title: 'Request history',
        content: column(...historyRows),
        position: 'right',
        variant: 'overlay',
        width: historyDrawerWidth,
        height: historyDrawerHeight,
      });
      return runtime.stackedLayers(
        base,
        historyDrawer.view({
          open: true,
          width: historyDrawerWidth,
          height: historyDrawerHeight,
          focusTrapActive: true,
        }),
      );
    },

    subscriptions(model) {
      const persistent = [
        Sub.resize<ApiInspectorMsg>((cols, rows) => ({ type: 'resize', cols, rows })),
        Sub.stream<ApiInspectorMsg>({
          id: 'api-inspector-loopback',
          setup: () => {
            let unsubscribe = () => {};
            return {
              onData(callback) {
                unsubscribe = apiRuntime.subscribe(callback as (event: ApiRuntimeEvent) => void);
              },
              teardown() {
                unsubscribe();
                void apiRuntime.dispose();
              },
            };
          },
          toMsg: (data) => ({ type: 'server-event', event: data as ApiRuntimeEvent }),
        }),
        Sub.map(responseTabsComponent.subscriptions?.(model.responseTabs) ?? Sub.none<TabsMsg>(), (msg) => ({ type: 'response-tabs', msg }) as ApiInspectorMsg),
        Sub.elementMouse<ApiInspectorMsg>((mouse) => ({ type: 'mouse', handlerTag: mouse.handlerTag })),
      ];
      if (model.historyOpen) {
        return Sub.batch(...persistent, Sub.key('escape', { type: 'escape' }));
      }

      const controlSubscription =
        model.focus === 'method'
          ? Sub.map(methodComponent.subscriptions?.(model.method) ?? Sub.none<SelectMsg>(), (msg) => ({ type: 'method', msg }) as ApiInspectorMsg)
          : model.focus === 'path'
            ? Sub.map(pathComponent.subscriptions?.(model.path) ?? Sub.none<TextInputMsg>(), (msg) => ({ type: 'path', msg }) as ApiInspectorMsg)
            : Sub.map(bodyComponent.subscriptions?.(model.body) ?? Sub.none<TextareaMsg>(), (msg) => ({ type: 'body', msg }) as ApiInspectorMsg);
      const shortcuts = [
        Sub.keyEvent<ApiInspectorMsg>((key) => (key.key === 'tab' ? { type: 'focus-next' } : { type: 'noop' })),
        Sub.keyWithModifiers<ApiInspectorMsg>('enter', { ctrl: true }, { type: 'send' }),
        Sub.key<ApiInspectorMsg>('escape', { type: 'escape' }),
      ];
      if (model.focus === 'method' && !model.method.open) {
        shortcuts.push(
          Sub.key('s', { type: 'send' }),
          Sub.key('h', { type: 'toggle-history' }),
          Sub.key('r', { type: 'reset' }),
          Sub.key('q', { type: 'quit' }),
        );
      }
      return Sub.batch(...persistent, controlSubscription, ...shortcuts);
    },
  };
}
