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

function toAvailability<Model, Msg>(action: ActionDescriptor<Model, Msg>, model: Model): ActionAvailability {
  const value = action.when?.(model);
  if (value === false) {
    return 'hidden';
  }
  if (value === 'disabled') {
    return 'disabled';
  }
  return 'enabled';
}

export function createActionRegistry<Model, Msg>(actions: readonly ActionDescriptor<Model, Msg>[]): ActionRegistry<Model, Msg> {
  const byId = new Map<string, ActionDescriptor<Model, Msg>>();

  for (const action of actions) {
    if (byId.has(action.id)) {
      throw new Error(`Duplicate action id: ${action.id}`);
    }
    byId.set(action.id, action);
  }

  return {
    actions: [...actions],
    byId,
  };
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

  return Array.isArray(result) ? [...result] : ([result] as readonly Msg[]);
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
