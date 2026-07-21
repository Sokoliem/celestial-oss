import type { AppConfig } from '../app.js';
import { Cmd, Sub } from '../types.js';

/** Check if a value is a proper Sub (has _tag: 'sub') vs a plain object */
export function isProperSub(val: unknown): boolean {
  return typeof val === 'object' && val !== null && (val as any)._tag === 'sub';
}

/** Check if a value is a proper Cmd (has _tag: 'cmd') vs a plain object */
export function isProperCmd(val: unknown): boolean {
  return typeof val === 'object' && val !== null && (val as any)._tag === 'cmd';
}

export function convertSub(raw: any): Sub<any> {
  if (raw == null) return Sub.none();
  if (isProperSub(raw)) return raw;

  const kind = raw.kind;
  switch (kind) {
    case 'none':
      return Sub.none();
    case 'key':
      return Sub.key(raw.key, raw.msg);
    case 'keyWithModifiers':
      return Sub.keyWithModifiers(raw.key, raw.modifiers, raw.msg);
    case 'keyEvent':
      return Sub.keyEvent(raw.toMsg);
    case 'timer':
      return Sub.timer(raw.ms, raw.toMsg);
    case 'resize':
      return Sub.resize(raw.toMsg);
    case 'mouse':
      return Sub.mouse(raw.toMsg);
    case 'elementMouse':
      return Sub.elementMouse(raw.toMsg);
    case 'focus':
      return Sub.focus(raw.toMsg);
    case 'layout':
      return Sub.layout(raw.ids, raw.toMsg);
    case 'paste':
      return Sub.paste(raw.toMsg);
    case 'agent':
      return Sub.agent({ id: raw.id, transport: raw.transport, toMsg: raw.toMsg, retryPolicy: raw.retryPolicy });
    case 'animationFrame':
      return Sub.animationFrame(raw.toMsg);
    case 'phase':
      return Sub.phase({ id: raw.id, registry: raw.registry, machineRef: raw.machineRef, toMsg: raw.toMsg, filter: raw.filter });
    case 'stream':
      return Sub.stream({ id: raw.id, setup: raw.setup, toMsg: raw.toMsg, restartKey: raw.restartKey });
    case 'batch':
      return Sub.batch(...(raw.subs ?? []).map(convertSub));
    case 'map':
      return Sub.map(convertSub(raw.sub), raw.fn);
    case 'debounce':
      return Sub.debounce(convertSub(raw.sub), raw.ms);
    case 'throttle':
      return Sub.throttle(convertSub(raw.sub), raw.ms);
    case 'filter':
      return Sub.filter(convertSub(raw.sub), raw.predicate);
    case 'distinct':
      return Sub.distinct(convertSub(raw.sub), raw.equals);
    default:
      if (kind != null && typeof process !== 'undefined' && process.stderr?.write) {
        process.stderr.write(`[nebula/hot] convertSub: unknown sub kind "${kind}", falling back to Sub.none()\n`);
      }
      return Sub.none();
  }
}

export function wrapRawConfig(raw: any): AppConfig<any, any> {
  return {
    init: () => {
      const [model, cmd] = raw.init();
      return [model, isProperCmd(cmd) ? cmd : Cmd.none()];
    },
    update: (msg: any, model: any) => {
      const [newModel, cmd] = raw.update(msg, model);
      return [newModel, isProperCmd(cmd) ? cmd : Cmd.none()];
    },
    view: raw.view,
    subscriptions: (model: any) => {
      const subs = raw.subscriptions(model);
      return isProperSub(subs) ? subs : convertSub(subs);
    },
    shaders: raw.shaders,
  };
}
