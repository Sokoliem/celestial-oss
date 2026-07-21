import type { VNode } from '@celestial/nebula';
import { Cmd, text } from '@celestial/nebula';
import { describe, expect, it, vi } from 'vitest';
import { wizard } from '../wizard.js';

// ─── Test helpers ───────────────────────────────────────────────────────────

interface StepModel {
  value: string;
}

type StepMsg = { type: 'set-value'; value: string };

function makeStepComponent(title: string) {
  return {
    init(): [StepModel, Cmd<StepMsg>] {
      return [{ value: '' }, Cmd.none()];
    },
    update(msg: StepMsg, model: StepModel): [StepModel, Cmd<StepMsg>] {
      if (msg.type === 'set-value') {
        return [{ ...model, value: msg.value }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },
    view(model: StepModel): VNode {
      return text(`${title}: ${model.value}`);
    },
  };
}

function vnodeToText(node: { kind: string; content?: string; children?: unknown[]; child?: unknown }): string {
  if (node.kind === 'text') return node.content ?? '';
  if (node.kind === 'event' && node.child) return vnodeToText(node.child as { kind: string; content?: string; children?: unknown[]; child?: unknown });
  if (node.kind === 'column' || node.kind === 'row') {
    return (node.children as { kind: string; content?: string; children?: unknown[]; child?: unknown }[]).map(vnodeToText).join('\n');
  }
  return '';
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('wizard', () => {
  // ── init ─────────────────────────────────────────────────────────────

  describe('init', () => {
    it('initializes at step 0 with per-step models', () => {
      const w = wizard({
        steps: [
          { title: 'Step A', component: makeStepComponent('A') },
          { title: 'Step B', component: makeStepComponent('B') },
        ],
      });
      const [model] = w.init();
      expect(model.currentStep).toBe(0);
      expect(model.stepModels).toHaveLength(2);
      expect(model.completed).toEqual([false, false]);
      expect(model.finished).toBe(false);
    });

    it('rejects empty and unreasonably large step lists', () => {
      expect(() => wizard({ steps: [] })).toThrow(/at least one step/);
      const component = makeStepComponent('step');
      expect(() => wizard({ steps: Array.from({ length: 1001 }, (_, index) => ({ title: String(index), component })) })).toThrow(/cannot exceed/);
    });

    it('snapshots the step array and step metadata', () => {
      const steps = [{ title: 'Original', component: makeStepComponent('A') }];
      const w = wizard({ steps });
      steps[0]!.title = 'Changed';
      steps.length = 0;
      const [model] = w.init();
      expect(vnodeToText(w.view(model) as never)).toContain('Original');
      expect(vnodeToText(w.view(model) as never)).not.toContain('Changed');
    });

    it('initializes each step model via step component init', () => {
      const w = wizard({
        steps: [{ title: 'Step A', component: makeStepComponent('A') }],
      });
      const [model] = w.init();
      expect(model.stepModels[0]).toEqual({ value: '' });
    });
  });

  // ── navigation ──────────────────────────────────────────────────────

  describe('navigation', () => {
    it('wizard:next advances to the next step', () => {
      const w = wizard({
        steps: [
          { title: 'Step A', component: makeStepComponent('A') },
          { title: 'Step B', component: makeStepComponent('B') },
          { title: 'Step C', component: makeStepComponent('C') },
        ],
      });
      const [model] = w.init();
      const [m1] = w.update({ type: 'wizard:next' }, model);
      expect(m1.currentStep).toBe(1);
      expect(m1.completed[0]).toBe(true);
    });

    it('wizard:prev goes back', () => {
      const w = wizard({
        steps: [
          { title: 'Step A', component: makeStepComponent('A') },
          { title: 'Step B', component: makeStepComponent('B') },
        ],
      });
      const [model] = w.init();
      const [m1] = w.update({ type: 'wizard:next' }, model);
      expect(m1.currentStep).toBe(1);
      const [m2] = w.update({ type: 'wizard:prev' }, m1);
      expect(m2.currentStep).toBe(0);
    });

    it('wizard:prev clamped at 0', () => {
      const w = wizard({
        steps: [
          { title: 'Step A', component: makeStepComponent('A') },
          { title: 'Step B', component: makeStepComponent('B') },
        ],
      });
      const [model] = w.init();
      const [m1] = w.update({ type: 'wizard:prev' }, model);
      expect(m1.currentStep).toBe(0);
    });

    it('wizard:prev is blocked when allowBack is false', () => {
      const w = wizard({
        steps: [
          { title: 'Step A', component: makeStepComponent('A') },
          { title: 'Step B', component: makeStepComponent('B') },
        ],
        allowBack: false,
      });
      const [model] = w.init();
      const [m1] = w.update({ type: 'wizard:next' }, model);
      expect(m1.currentStep).toBe(1);
      const [m2] = w.update({ type: 'wizard:prev' }, m1);
      expect(m2.currentStep).toBe(1); // Should NOT go back
    });

    it('wizard:goto navigates to a specific step', () => {
      const w = wizard({
        steps: [
          { title: 'Step A', component: makeStepComponent('A') },
          { title: 'Step B', component: makeStepComponent('B') },
          { title: 'Step C', component: makeStepComponent('C') },
        ],
      });
      const [model] = w.init();
      const [m1] = w.update({ type: 'wizard:goto', step: 2 }, model);
      expect(m1.currentStep).toBe(2);
    });

    it('wizard:goto ignores out-of-bounds step', () => {
      const w = wizard({
        steps: [{ title: 'Step A', component: makeStepComponent('A') }],
      });
      const [model] = w.init();
      const [m1] = w.update({ type: 'wizard:goto', step: 5 }, model);
      expect(m1.currentStep).toBe(0);
    });

    it('wizard:goto ignores fractional and non-finite indices', () => {
      const w = wizard({
        steps: [
          { title: 'A', component: makeStepComponent('A') },
          { title: 'B', component: makeStepComponent('B') },
        ],
      });
      const [model] = w.init();
      expect(w.update({ type: 'wizard:goto', step: 0.5 }, model)[0]).toBe(model);
      expect(w.update({ type: 'wizard:goto', step: Number.NaN }, model)[0]).toBe(model);
    });
  });

  // ── validation ──────────────────────────────────────────────────────

  describe('validation', () => {
    it('wizard:next blocks when step validation fails', () => {
      const w = wizard({
        steps: [
          {
            title: 'Step A',
            component: makeStepComponent('A'),
            validate: (model: unknown) => {
              const m = model as StepModel;
              return m.value.length > 0 ? { valid: true as const } : { valid: false as const, message: 'Required' };
            },
          },
          { title: 'Step B', component: makeStepComponent('B') },
        ],
      });
      const [model] = w.init();
      // Step A has empty value, validation should fail
      const [m1] = w.update({ type: 'wizard:next' }, model);
      expect(m1.currentStep).toBe(0); // Should NOT advance
    });

    it('wizard:next allows progression when step validation passes', () => {
      const w = wizard({
        steps: [
          {
            title: 'Step A',
            component: makeStepComponent('A'),
            validate: (model: unknown) => {
              const m = model as StepModel;
              return m.value.length > 0 ? { valid: true as const } : { valid: false as const, message: 'Required' };
            },
          },
          { title: 'Step B', component: makeStepComponent('B') },
        ],
      });
      const [model] = w.init();
      // Set a value first
      const [m1] = w.update({ type: 'wizard:step-msg', msg: { type: 'set-value', value: 'hello' } }, model);
      const [m2] = w.update({ type: 'wizard:next' }, m1);
      expect(m2.currentStep).toBe(1);
    });

    it('optional steps can be skipped without validation', () => {
      const w = wizard({
        steps: [
          {
            title: 'Step A',
            component: makeStepComponent('A'),
            optional: true,
            validate: () => ({ valid: false as const, message: 'always fails' }),
          },
          { title: 'Step B', component: makeStepComponent('B') },
        ],
      });
      const [model] = w.init();
      const [m1] = w.update({ type: 'wizard:next' }, model);
      expect(m1.currentStep).toBe(1); // Should skip optional step's validation
    });
  });

  // ── completion ──────────────────────────────────────────────────────

  describe('completion', () => {
    it('wizard:next on last step marks finished', () => {
      const w = wizard({
        steps: [{ title: 'Step A', component: makeStepComponent('A') }],
      });
      const [model] = w.init();
      const [m1] = w.update({ type: 'wizard:next' }, model);
      expect(m1.finished).toBe(true);
      expect(m1.completed[0]).toBe(true);
    });

    it('onComplete callback receives step models', () => {
      const onComplete = vi.fn().mockReturnValue({ type: 'done' });
      const w = wizard({
        steps: [
          { title: 'Step A', component: makeStepComponent('A') },
          { title: 'Step B', component: makeStepComponent('B') },
        ],
        onComplete,
      });
      const [model] = w.init();
      const [m1] = w.update({ type: 'wizard:next' }, model);
      w.update({ type: 'wizard:next' }, m1);
      expect(onComplete).toHaveBeenCalled();
    });
  });

  // ── step-msg delegation ─────────────────────────────────────────────

  describe('step-msg', () => {
    it('delegates messages to the current step component', () => {
      const w = wizard({
        steps: [{ title: 'Step A', component: makeStepComponent('A') }],
      });
      const [model] = w.init();
      const [m1] = w.update({ type: 'wizard:step-msg', msg: { type: 'set-value', value: 'hello' } }, model);
      expect((m1.stepModels[0] as StepModel).value).toBe('hello');
    });

    it('ignores step-msg for out-of-bounds step', () => {
      const w = wizard({
        steps: [{ title: 'Step A', component: makeStepComponent('A') }],
      });
      const [model] = w.init();
      // Force currentStep out of range (shouldn't happen normally)
      const badModel = { ...model, currentStep: 5 };
      const [m1] = w.update({ type: 'wizard:step-msg', msg: { type: 'set-value', value: 'nope' } }, badModel);
      expect(m1.currentStep).toBe(5); // unchanged
    });
  });

  // ── view ────────────────────────────────────────────────────────────

  describe('view', () => {
    it('shows step progress indicator', () => {
      const w = wizard({
        steps: [
          { title: 'First', component: makeStepComponent('1') },
          { title: 'Second', component: makeStepComponent('2') },
          { title: 'Third', component: makeStepComponent('3') },
        ],
      });
      const [model] = w.init();
      const output = vnodeToText(w.view(model) as never);
      expect(output).toContain('Step 1 of 3');
      expect(output).toContain('First');
    });

    it('renders the current step component view', () => {
      const w = wizard({
        steps: [{ title: 'First', component: makeStepComponent('StepA') }],
      });
      const [model] = w.init();
      const output = vnodeToText(w.view(model) as never);
      expect(output).toContain('StepA');
    });

    it('shows navigation hints', () => {
      const w = wizard({
        steps: [
          { title: 'A', component: makeStepComponent('A') },
          { title: 'B', component: makeStepComponent('B') },
        ],
      });
      const [model] = w.init();
      const output0 = vnodeToText(w.view(model) as never);
      expect(output0).toContain('[Next]');
      expect(output0).not.toContain('[Prev]');

      const [m1] = w.update({ type: 'wizard:next' }, model);
      const output1 = vnodeToText(w.view(m1) as never);
      expect(output1).toContain('[Prev]');
      expect(output1).toContain('[Finish]');
    });

    it('provides pointer navigation and disables all input after completion', () => {
      const onComplete = vi.fn();
      const w = wizard({ steps: [{ title: 'Only', component: makeStepComponent('A') }], onComplete });
      let [model] = w.init();
      expect(JSON.stringify(w.subscriptions!(model))).toContain('elementMouse');
      [model] = w.update({ type: 'wizard:next' }, model);
      expect(model.finished).toBe(true);
      expect(w.subscriptions!(model)._kind.kind).toBe('none');
      const [unchanged] = w.update({ type: 'wizard:next' }, model);
      expect(unchanged).toBe(model);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  // ── subscriptions ──────────────────────────────────────────────────

  describe('subscriptions', () => {
    it('returns subscriptions', () => {
      const w = wizard({
        steps: [{ title: 'A', component: makeStepComponent('A') }],
      });
      const [model] = w.init();
      if (w.subscriptions) {
        const sub = w.subscriptions(model);
        expect(sub).toBeDefined();
      }
    });
  });
});
