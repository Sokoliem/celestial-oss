import { Cmd, type Cmd as Command, cmdKind } from './types.js';

export type ActionScope = 'app' | 'screen' | 'focused' | 'workspace';

export type ActionAvailability = 'enabled' | 'disabled' | 'hidden';

export type ActionResult<Msg> = Msg | readonly Msg[] | null;

export interface ActionDescriptor<Model, Msg> {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly category?: string;
  readonly scope?: ActionScope;
  readonly shortcuts?: readonly string[];
  readonly discoverable?: boolean;
  readonly when?: (model: Model) => boolean | 'disabled';
  readonly run: (model: Model) => ActionResult<Msg>;
}

export interface ActionRegistry<Model, Msg> {
  readonly actions: readonly ActionDescriptor<Model, Msg>[];
  readonly byId: ReadonlyMap<string, ActionDescriptor<Model, Msg>>;
}

export interface ResolvedAction<Model, Msg> {
  readonly descriptor: ActionDescriptor<Model, Msg>;
  readonly availability: Exclude<ActionAvailability, 'hidden'>;
}

export type ActionUpdate<Model, Msg> = (msg: Msg, model: Model) => [Model, Command<Msg>];

const ACTION_REGISTRIES = new WeakSet<object>();
const ACTION_SCOPES = new Set<ActionScope>(['app', 'screen', 'focused', 'workspace']);
const MAX_REGISTRY_ACTIONS = 100_000;
const MAX_ACTION_SHORTCUTS = 1_000;
const MAX_ACTION_RESULT_MESSAGES = 100_000;
const MAX_ACTION_ID_LENGTH = 256;
const MAX_ACTION_TITLE_LENGTH = 256;
const MAX_ACTION_DESCRIPTION_LENGTH = 4_096;
const MAX_ACTION_CATEGORY_LENGTH = 256;
const MAX_ACTION_SHORTCUT_LENGTH = 4_096;
const UNSAFE_ACTION_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069\uD800-\uDFFF]/u;

function ownDataValue(value: object, key: string, label: string, required: boolean): { readonly present: boolean; readonly value?: unknown } {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    if (required) throw new TypeError(`${label} must define own data property "${key}"`);
    return { present: false };
  }
  if (!('value' in descriptor)) {
    throw new TypeError(`${label} property "${key}" must be an own data property`);
  }
  return { present: true, value: descriptor.value };
}

function denseArrayValues(value: unknown, label: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  const length = lengthDescriptor !== undefined && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > maximum) {
    throw new RangeError(`${label} length must be a non-negative safe integer no greater than ${maximum}`);
  }

  const values: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined) {
      throw new TypeError(`${label} must be dense; index ${index} is missing`);
    }
    if (!('value' in descriptor)) {
      throw new TypeError(`${label} index ${index} must be an own data property`);
    }
    values.push(descriptor.value);
  }
  return values;
}

function requiredText(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== 'string' || value.length > maximumLength) {
    throw new TypeError(`${label} must be a non-empty, well-formed string of at most ${maximumLength} characters without terminal controls`);
  }
  if (value.trim().length === 0 || UNSAFE_ACTION_TEXT.test(value)) {
    throw new TypeError(`${label} must be a non-empty, well-formed string of at most ${maximumLength} characters without terminal controls`);
  }
  return value;
}

function optionalText(value: unknown, label: string, maximumLength: number): string | undefined {
  if (value === undefined) return undefined;
  return requiredText(value, label, maximumLength);
}

function snapshotAction<Model, Msg>(value: unknown, index: number): ActionDescriptor<Model, Msg> {
  const label = `Action registry action ${index}`;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }

  const id = requiredText(ownDataValue(value, 'id', label, true).value, `${label} id`, MAX_ACTION_ID_LENGTH);
  const title = requiredText(ownDataValue(value, 'title', label, true).value, `${label} title`, MAX_ACTION_TITLE_LENGTH);
  const run = ownDataValue(value, 'run', label, true).value;
  if (typeof run !== 'function') throw new TypeError(`${label} run must be a function`);

  const description = optionalText(ownDataValue(value, 'description', label, false).value, `${label} description`, MAX_ACTION_DESCRIPTION_LENGTH);
  const category = optionalText(ownDataValue(value, 'category', label, false).value, `${label} category`, MAX_ACTION_CATEGORY_LENGTH);
  const scope = ownDataValue(value, 'scope', label, false).value;
  if (scope !== undefined && !ACTION_SCOPES.has(scope as ActionScope)) {
    throw new TypeError(`${label} scope is not supported`);
  }
  const shortcutsValue = ownDataValue(value, 'shortcuts', label, false).value;
  let shortcuts: readonly string[] | undefined;
  if (shortcutsValue !== undefined) {
    shortcuts = Object.freeze(
      denseArrayValues(shortcutsValue, `${label} shortcuts`, MAX_ACTION_SHORTCUTS).map((shortcut, shortcutIndex) =>
        requiredText(shortcut, `${label} shortcut ${shortcutIndex}`, MAX_ACTION_SHORTCUT_LENGTH),
      ),
    );
  }
  const discoverable = ownDataValue(value, 'discoverable', label, false).value;
  if (discoverable !== undefined && typeof discoverable !== 'boolean') {
    throw new TypeError(`${label} discoverable must be a boolean`);
  }
  const when = ownDataValue(value, 'when', label, false).value;
  if (when !== undefined && typeof when !== 'function') {
    throw new TypeError(`${label} when must be a function`);
  }

  return Object.freeze({
    id,
    title,
    ...(description === undefined ? {} : { description }),
    ...(category === undefined ? {} : { category }),
    ...(scope === undefined ? {} : { scope: scope as ActionScope }),
    ...(shortcuts === undefined ? {} : { shortcuts }),
    ...(discoverable === undefined ? {} : { discoverable }),
    ...(when === undefined ? {} : { when: when as (model: Model) => boolean | 'disabled' }),
    run: run as (model: Model) => ActionResult<Msg>,
  });
}

function readonlyMapView<K, V>(source: Map<K, V>): ReadonlyMap<K, V> {
  let view: ReadonlyMap<K, V>;
  view = Object.freeze({
    get size() {
      return source.size;
    },
    entries: () => source.entries(),
    forEach: (callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown) => {
      source.forEach((value, key) => {
        Reflect.apply(callback, thisArg, [value, key, view]);
      });
    },
    get: (key: K) => source.get(key),
    has: (key: K) => source.has(key),
    keys: () => source.keys(),
    values: () => source.values(),
    [Symbol.iterator]: () => source.entries(),
  });
  return view;
}

function toAvailability<Model, Msg>(action: ActionDescriptor<Model, Msg>, model: Model): ActionAvailability {
  if (action.when === undefined) return 'enabled';
  const value = action.when(model);
  if (value === true) {
    return 'enabled';
  }
  if (value === false) {
    return 'hidden';
  }
  if (value === 'disabled') {
    return 'disabled';
  }
  throw new TypeError(`Action ${JSON.stringify(action.id)} when must return true, false, or "disabled".`);
}

export function createActionRegistry<Model, Msg>(actions: readonly ActionDescriptor<Model, Msg>[]): ActionRegistry<Model, Msg> {
  const actionValues = denseArrayValues(actions, 'Action registry actions', MAX_REGISTRY_ACTIONS);
  const byId = new Map<string, ActionDescriptor<Model, Msg>>();
  const snapshots: ActionDescriptor<Model, Msg>[] = [];

  for (let index = 0; index < actionValues.length; index += 1) {
    const action = snapshotAction<Model, Msg>(actionValues[index], index);
    if (byId.has(action.id)) {
      throw new Error(`Duplicate action id: ${action.id}`);
    }
    byId.set(action.id, action);
    snapshots.push(action);
  }

  const registry = Object.freeze({
    actions: Object.freeze(snapshots),
    byId: readonlyMapView(byId),
  });
  ACTION_REGISTRIES.add(registry);
  return registry;
}

/** Return true only for an immutable registry created by `createActionRegistry`. */
export function isActionRegistry(value: unknown): value is ActionRegistry<unknown, unknown> {
  return (typeof value === 'object' && value !== null) || typeof value === 'function' ? ACTION_REGISTRIES.has(value) : false;
}

export function getAction<Model, Msg>(registry: ActionRegistry<Model, Msg>, id: string): ActionDescriptor<Model, Msg> | undefined {
  return registry.byId.get(id);
}

export function resolveAction<Model, Msg>(registry: ActionRegistry<Model, Msg>, id: string, model: Model): ResolvedAction<Model, Msg> | undefined {
  const descriptor = getAction(registry, id);
  if (!descriptor) {
    return undefined;
  }

  const availability = toAvailability(descriptor, model);
  if (availability === 'hidden') {
    return undefined;
  }

  return {
    descriptor,
    availability,
  };
}

export function getAvailableActions<Model, Msg>(registry: ActionRegistry<Model, Msg>, model: Model): readonly ResolvedAction<Model, Msg>[] {
  const resolved: ResolvedAction<Model, Msg>[] = [];

  for (const descriptor of registry.actions) {
    const availability = toAvailability(descriptor, model);
    if (availability === 'hidden') {
      continue;
    }

    resolved.push({
      descriptor,
      availability,
    });
  }

  return resolved;
}

export function invokeAction<Model, Msg>(registry: ActionRegistry<Model, Msg>, id: string, model: Model): readonly Msg[] | null {
  const resolved = resolveAction(registry, id, model);
  if (!resolved || resolved.availability === 'disabled') {
    return null;
  }

  const result = resolved.descriptor.run(model);
  if (result === null) {
    return null;
  }

  return Array.isArray(result)
    ? Object.freeze(denseArrayValues(result, 'Action result messages', MAX_ACTION_RESULT_MESSAGES) as Msg[])
    : Object.freeze([result] as Msg[]);
}

export function applyAction<Model, Msg>(
  registry: ActionRegistry<Model, Msg>,
  id: string,
  model: Model,
  update: ActionUpdate<Model, Msg>,
): [Model, Command<Msg>] {
  const messages = invokeAction(registry, id, model);
  if (!messages || messages.length === 0) {
    return [model, Cmd.none()];
  }

  let nextModel = model;
  const commands: Command<Msg>[] = [];

  for (const message of messages) {
    const [updatedModel, command] = update(message, nextModel);
    nextModel = updatedModel;

    if (cmdKind(command).kind !== 'none') {
      commands.push(command);
    }
  }

  if (commands.length === 0) {
    return [nextModel, Cmd.none()];
  }

  if (commands.length === 1) {
    return [nextModel, commands[0]!];
  }

  return [nextModel, Cmd.batch(...commands)];
}
