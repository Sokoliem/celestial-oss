import { Cmd, text, type VNode } from '@celestial/nebula';
import { describe, expect, it, vi } from 'vitest';
import { type WizardModel, type WizardStepConfig, type WizardStepRef, wizard } from '../wizard.js';

function makeStep(name: string, value: unknown = name, overrides: Partial<WizardStepConfig> = {}): WizardStepConfig<unknown, never> {
  return {
    name,
    title: `Step ${name}`,
    component: {
      init(): [unknown, ReturnType<typeof Cmd.none>] {
        return [value, Cmd.none()];
      },
      update(_msg: never, model: unknown): [unknown, ReturnType<typeof Cmd.none>] {
        return [model, Cmd.none()];
      },
      view(model: unknown): VNode {
        return text(String(model));
      },
    },
    ...overrides,
  };
}

describe('wizard branching — nextStep predicate', () => {
  it('routes to the resolved next step by name', () => {
    const sut = wizard({
      steps: [
        makeStep('start', 'user', {
          nextStep: (model) => (model === 'pro' ? 'advanced' : 'beginner'),
        }),
        makeStep('beginner'),
        makeStep('advanced'),
      ],
    });

    const [initial] = sut.init();
    const [afterNext] = sut.update({ type: 'wizard:next' }, initial);
    expect(afterNext.currentStep).toBe(1); // beginner
    expect(afterNext.visited).toEqual([0, 1]);
  });

  it('routes by index when the predicate returns a number', () => {
    const sut = wizard({
      steps: [makeStep('a', 'a', { nextStep: () => 2 }), makeStep('b'), makeStep('c')],
    });
    const [initial] = sut.init();
    const [next] = sut.update({ type: 'wizard:next' }, initial);
    expect(next.currentStep).toBe(2);
  });

  it('finishes the wizard when nextStep returns null', () => {
    const onComplete = vi.fn();
    const sut = wizard({
      steps: [makeStep('a', 'a', { nextStep: () => null }), makeStep('b')],
      onComplete,
    });
    const [initial] = sut.init();
    const [finished] = sut.update({ type: 'wizard:next' }, initial);
    expect(finished.finished).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('treats unknown refs returned from nextStep as a no-op (configuration error)', () => {
    const sut = wizard({
      steps: [makeStep('a', 'a', { nextStep: () => 'does-not-exist' }), makeStep('b')],
    });
    const [initial] = sut.init();
    const [next] = sut.update({ type: 'wizard:next' }, initial);
    expect(next.currentStep).toBe(0);
    expect(next.finished).toBe(false);
  });
});

describe('wizard branching — previousStep predicate + visited history', () => {
  it('pops the visited history on default prev', () => {
    const sut = wizard({
      steps: [makeStep('a'), makeStep('b'), makeStep('c')],
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'wizard:next' }, model);
    [model] = sut.update({ type: 'wizard:next' }, model);
    expect(model.currentStep).toBe(2);
    [model] = sut.update({ type: 'wizard:prev' }, model);
    expect(model.currentStep).toBe(1);
    [model] = sut.update({ type: 'wizard:prev' }, model);
    expect(model.currentStep).toBe(0);
  });

  it('uses a custom previousStep predicate when defined', () => {
    const sut = wizard({
      steps: [makeStep('intro'), makeStep('branch-a', 'branch-a', { previousStep: () => 'intro' }), makeStep('branch-b')],
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'wizard:goto', step: 'branch-a' }, model);
    expect(model.currentStep).toBe(1);
    [model] = sut.update({ type: 'wizard:prev' }, model);
    expect(model.currentStep).toBe(0);
  });

  it('ignores back navigation when previousStep returns null', () => {
    const sut = wizard({
      steps: [makeStep('a'), makeStep('b', 'b', { previousStep: () => null })],
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'wizard:next' }, model);
    expect(model.currentStep).toBe(1);
    [model] = sut.update({ type: 'wizard:prev' }, model);
    expect(model.currentStep).toBe(1);
  });
});

describe('wizard goto by name and index', () => {
  it('accepts a step name', () => {
    const sut = wizard({
      steps: [makeStep('intro'), makeStep('config'), makeStep('done')],
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'wizard:goto', step: 'done' }, model);
    expect(model.currentStep).toBe(2);
  });

  it('accepts a step index', () => {
    const sut = wizard({
      steps: [makeStep('intro'), makeStep('config'), makeStep('done')],
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'wizard:goto', step: 2 }, model);
    expect(model.currentStep).toBe(2);
  });

  it('ignores unknown names', () => {
    const sut = wizard({
      steps: [makeStep('intro'), makeStep('done')],
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'wizard:goto', step: 'nope' }, model);
    expect(model.currentStep).toBe(0);
  });
});

describe('getGraph()', () => {
  it('records edges as numeric, dynamic, or end', () => {
    const sut = wizard({
      steps: [makeStep('a', 'a', { nextStep: () => 'c' }), makeStep('b'), makeStep('c')],
    });
    const graph = sut.getGraph();
    expect(graph.edges).toEqual([
      { from: 0, to: 'dynamic' },
      { from: 1, to: 2 },
      { from: 2, to: 'end' },
    ]);
  });

  it('exposes a name→index lookup', () => {
    const sut = wizard({
      steps: [makeStep('start'), makeStep('end-step')],
    });
    const graph = sut.getGraph();
    expect(graph.nameToIndex.get('start')).toBe(0);
    expect(graph.nameToIndex.get('end-step')).toBe(1);
    expect(graph.stepOrder).toEqual(['start', 'end-step']);
  });

  it('returns defensive graph snapshots', () => {
    const sut = wizard({ steps: [makeStep('start'), makeStep('end-step')] });
    const graph = sut.getGraph();
    (graph.nameToIndex as Map<string, number>).set('injected', 99);
    expect(() => (graph.stepOrder as WizardStepRef[]).push('injected')).toThrow();
    const fresh = sut.getGraph();
    expect(fresh.nameToIndex.has('injected')).toBe(false);
    expect(fresh.stepOrder).toEqual(['start', 'end-step']);
  });

  it('refuses duplicate step names at construction time', () => {
    expect(() => wizard({ steps: [makeStep('dupe'), makeStep('dupe')] })).toThrow(/duplicate step name/);
  });
});

describe('wizard model carries visited history from init', () => {
  it('starts with the entry step recorded as visited', () => {
    const sut = wizard({ steps: [makeStep('start')] });
    const [model] = sut.init();
    expect(model.visited).toEqual([0]);
  });

  it('records branch hops in visited order', () => {
    const sut = wizard({
      steps: [makeStep('a', 'a', { nextStep: () => 'c' }), makeStep('b'), makeStep('c')],
    });
    let [model] = sut.init();
    [model] = sut.update({ type: 'wizard:next' }, model);
    expect(model.visited).toEqual([0, 2]);
  });
});

// Ensure validation still blocks `wizard:next` when the predicate also
// resolves to a target step.
describe('wizard validation interacts cleanly with branching', () => {
  it('blocks branching when validate returns invalid', () => {
    const sut = wizard({
      steps: [
        makeStep('start', 'incomplete', {
          validate: () => ({ valid: false, message: 'fill it in' }),
          nextStep: () => 'done',
        }),
        makeStep('done'),
      ],
    });
    const [initial] = sut.init();
    const [next] = sut.update({ type: 'wizard:next' }, initial);
    expect(next.currentStep).toBe(0);
    expect(next.finished).toBe(false);
  });
});

describe('reset returns to the entry step with a fresh visited history', () => {
  it('clears visited on reset', () => {
    const sut = wizard({ steps: [makeStep('a'), makeStep('b'), makeStep('c')] });
    let [model] = sut.init();
    [model] = sut.update({ type: 'wizard:next' }, model);
    [model] = sut.update({ type: 'wizard:next' }, model);
    [model] = sut.update({ type: 'wizard:reset' }, model);
    expect(model.visited).toEqual([0]);
    expect(model.currentStep).toBe(0);
    expect((model as WizardModel).finished).toBe(false);
  });
});
