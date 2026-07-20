import { type AppConfig, Cmd, Sub, text } from '@celestial/core/nebula';
import { afterEach, describe, expect, it } from 'vitest';
import { createInteractionRecorder } from '../interactions.js';
import { createTestApp, type TestAppHandle } from '../test-app.js';

type Msg = { type: 'increment'; amount: number };
interface Model {
  count: number;
}

const counter: AppConfig<Model, Msg> = {
  init: () => [{ count: 0 }, Cmd.none()],
  update: (message, model) => [{ count: model.count + message.amount }, Cmd.none()],
  view: (model) => text(`Count ${model.count}`),
  subscriptions: () => Sub.key('up', { type: 'increment', amount: 1 }),
};

describe('interaction recorder', () => {
  const handles: Array<TestAppHandle<Model, Msg>> = [];

  afterEach(() => {
    for (const handle of handles.splice(0)) handle.stop();
  });

  function app(): TestAppHandle<Model, Msg> {
    const handle = createTestApp(counter, { cols: 20, rows: 3 });
    handles.push(handle);
    return handle;
  }

  it('records post-action model and frame snapshots in order', () => {
    const handle = app();
    const recorder = createInteractionRecorder(handle);

    recorder.recordKey('up');
    recorder.recordDispatch({ type: 'increment', amount: 2 });
    const recording = recorder.snapshot();

    expect(recording.initialModel).toEqual({ count: 0 });
    expect(recording.finalModel).toEqual({ count: 3 });
    expect(recording.steps.map((step) => step.index)).toEqual([0, 1]);
    expect(recording.steps.map((step) => step.modelSnapshot.count)).toEqual([1, 3]);
    expect(recording.steps[1]?.frameSnapshot).toContain('Count 3');
  });

  it('replays into a fresh app and returns defensive recording copies', () => {
    const source = app();
    const recorder = createInteractionRecorder(source);
    recorder.recordKey('up');
    recorder.recordDispatch({ type: 'increment', amount: 2 });
    const target = app();

    const replayed = recorder.replay(target);
    replayed.finalModel.count = 999;

    expect(target.model).toEqual({ count: 3 });
    expect(recorder.snapshot().finalModel).toEqual({ count: 3 });
  });

  it('clears recorded steps without changing the captured initial model', () => {
    const handle = app();
    const recorder = createInteractionRecorder(handle);
    recorder.recordKey('up');
    recorder.clear();

    expect(recorder.snapshot()).toMatchObject({ initialModel: { count: 0 }, finalModel: { count: 1 }, steps: [] });
  });

  it('explains when a model cannot be cloned safely', () => {
    const handle = app() as TestAppHandle<Model & { callback?: () => void }, Msg>;
    Object.assign(handle.model, { callback: () => undefined });

    expect(() => createInteractionRecorder(handle)).toThrow(/initial model.*structured-cloneable/i);
  });
});
