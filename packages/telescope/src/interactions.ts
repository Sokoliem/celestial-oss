import type { TestAppHandle } from './test-app.js';
import type { InteractionRecording, InteractionStep, KeyModifiers } from './types.js';

export interface InteractionRecorder<Model, M> {
  recordKey(key: string, modifiers?: KeyModifiers): InteractionStep<Model, M>;
  recordDispatch(msg: M): InteractionStep<Model, M>;
  replay(target?: TestAppHandle<Model, M>): InteractionRecording<Model, M>;
  snapshot(): InteractionRecording<Model, M>;
  clear(): void;
}

export function createInteractionRecorder<Model, M>(handle: TestAppHandle<Model, M>): InteractionRecorder<Model, M> {
  const initialModel = cloneValue(handle.model, 'initial model');
  const steps: InteractionStep<Model, M>[] = [];

  return {
    recordKey(key: string, modifiers?: KeyModifiers): InteractionStep<Model, M> {
      handle.pressKey(key, modifiers);
      return pushStep({
        kind: 'key',
        key,
        modifiers,
      });
    },
    recordDispatch(msg: M): InteractionStep<Model, M> {
      handle.dispatch(msg);
      return pushStep({
        kind: 'dispatch',
        msg: cloneValue(msg, 'dispatched message'),
      });
    },
    replay(target = handle): InteractionRecording<Model, M> {
      for (const step of steps) {
        if (step.kind === 'key') {
          target.pressKey(step.key, step.modifiers);
        } else {
          target.dispatch(cloneValue(step.msg, `message for interaction step ${step.index}`));
        }
      }
      return buildRecording(target.model);
    },
    snapshot(): InteractionRecording<Model, M> {
      return buildRecording(handle.model);
    },
    clear(): void {
      steps.length = 0;
    },
  };

  function pushStep(step: { kind: 'key'; key: string; modifiers?: KeyModifiers } | { kind: 'dispatch'; msg: M }): InteractionStep<Model, M> {
    const base = {
      index: steps.length,
      modelSnapshot: cloneValue(handle.model, 'model snapshot'),
      frameSnapshot: handle.lastFrame(),
    };
    const next: InteractionStep<Model, M> = step.kind === 'key' ? { ...step, ...base } : { ...step, ...base };
    steps.push(next);
    return next;
  }

  function buildRecording(finalModel: Model): InteractionRecording<Model, M> {
    return {
      initialModel: cloneValue(initialModel, 'initial model'),
      finalModel: cloneValue(finalModel, 'final model'),
      steps: steps.map((step) => cloneValue(step, `interaction step ${step.index}`)),
    };
  }
}

function cloneValue<T>(value: T, label: string): T {
  try {
    if (typeof globalThis.structuredClone === 'function') {
      return globalThis.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
  } catch (error) {
    throw new TypeError(`Interaction recorder could not clone the ${label}. Models and messages must be structured-cloneable.`, { cause: error });
  }
}
