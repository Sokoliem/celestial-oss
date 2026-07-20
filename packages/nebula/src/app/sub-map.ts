import { Sub, subKind } from '../types.js';

/**
 * Flatten a 'map' subscription by reconstructing the inner sub tree
 * with the mapping function applied to all message-producing leaves.
 * Handles nested maps by composing functions.
 */
export function applySubMap<M>(sub: Sub<unknown>, fn: (a: unknown) => M): Sub<M> {
  const kind = subKind(sub);
  switch (kind.kind) {
    case 'none':
      return Sub.none();
    case 'key':
      return Sub.key(kind.key, fn(kind.msg));
    case 'keyWithModifiers':
      return Sub.keyWithModifiers(kind.key, kind.modifiers, fn(kind.msg));
    case 'keyEvent':
      return Sub.keyEvent((event) => fn(kind.toMsg(event)));
    case 'timer':
      return Sub.timer(kind.ms, () => fn(kind.toMsg()));
    case 'idle':
      return Sub.idle(kind.ms, fn(kind.msg));
    case 'resize':
      return Sub.resize((c, r) => fn(kind.toMsg(c, r)));
    case 'mouse':
      return Sub.mouse((ev) => fn(kind.toMsg(ev)));
    case 'elementMouse':
      return Sub.elementMouse((ev) => fn(kind.toMsg(ev)));
    case 'focus':
      return Sub.focus((id) => fn(kind.toMsg(id)));
    case 'windowFocus':
      return Sub.windowFocus((focused) => fn(kind.toMsg(focused)));
    case 'layout':
      return Sub.layout(kind.ids, (rects) => fn(kind.toMsg(rects)));
    case 'paste':
      return Sub.paste((text) => fn(kind.toMsg(text)));
    case 'agent':
      return Sub.agent({ id: kind.id, transport: kind.transport, toMsg: (e) => fn(kind.toMsg(e)), retryPolicy: kind.retryPolicy });
    case 'animationFrame':
      return Sub.animationFrame((info) => fn(kind.toMsg(info)));
    case 'phase':
      return Sub.phase({ id: kind.id, registry: kind.registry, machineRef: kind.machineRef, toMsg: (s, p) => fn(kind.toMsg(s, p)), filter: kind.filter });
    case 'stream':
      return Sub.stream({ id: kind.id, setup: kind.setup, toMsg: (data) => fn(kind.toMsg(data)) });
    case 'batch':
      return Sub.batch(...kind.subs.map((s) => applySubMap(s, fn)));
    case 'map':
      return applySubMap(kind.sub, (a: unknown) => fn(kind.fn(a)));
    case 'debounce':
      return Sub.debounce(applySubMap(kind.sub, fn), kind.ms);
    case 'throttle':
      return Sub.throttle(applySubMap(kind.sub, fn), kind.ms);
    case 'filter':
      // The predicate was written for the pre-map message type. After flattening
      // through map, messages are the post-map type M and the original predicate
      // cannot safely test them. We preserve the filter node (so dispatch walkers
      // see it and install the dispatch override) but use a pass-through predicate.
      // The common case — Sub.filter(inner, pred) without a wrapping Sub.map — is
      // handled correctly by the dispatch override mechanism in the walker functions.
      return Sub.filter(applySubMap(kind.sub, fn) as Sub<M>, () => true as boolean);
    case 'distinct':
      // Same issue as filter: the equals function was typed for the pre-map type.
      // Fall back to default identity equality on post-map values.
      return Sub.distinct(applySubMap(kind.sub, fn) as Sub<M>);
  }
}

/** Serialize a subscription tree into a comparable string key */
export function serializeTimerSubs<M>(sub: Sub<M>): string {
  const kind = subKind(sub);
  switch (kind.kind) {
    case 'timer':
      return `timer:${kind.ms}`;
    case 'idle':
      return `idle:${kind.ms}`;
    case 'animationFrame':
      return 'animationFrame';
    case 'phase':
      return `phase:${kind.id}`;
    case 'batch':
      return kind.subs
        .map((s) => serializeTimerSubs(s))
        .filter(Boolean)
        .sort()
        .join('|');
    case 'map':
      return serializeTimerSubs(applySubMap(kind.sub, kind.fn));
    case 'debounce':
    case 'throttle':
    case 'filter':
    case 'distinct':
      return serializeTimerSubs((kind as { sub: Sub<unknown> }).sub as Sub<M>);
    default:
      return '';
  }
}
