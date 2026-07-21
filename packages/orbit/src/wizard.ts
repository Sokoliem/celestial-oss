import type { GlyphLevel, ThemeInput } from '@celestial/corona';
import { DEFAULT_GLYPH_TOKENS, resolveGlyph, style } from '@celestial/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/nebula';
import { Cmd, column, event, row, Sub, text } from '@celestial/nebula';
import type { LocaleLike } from '@celestial/rosetta';
import { type OrbitMessages, tr } from './i18n.js';
import { MAX_COLLECTION_ITEMS, MAX_WIZARD_STEPS, nextInteractionId } from './internal.js';
import { emitLedgerEvent, type OrbitLedger } from './ledger.js';
import { formColor, orbitToneColor } from './theme.js';
import type { ValidationResult } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Minimal ComponentDescriptor shape (inlined to avoid build-order dependency). */
interface StepComponent<Model, StepMsg> {
  init(): [Model, Cmd<StepMsg>];
  update(msg: StepMsg, model: Model): [Model, Cmd<StepMsg>];
  view(model: Model): VNode;
  subscriptions?(model: Model): Sub<StepMsg>;
}

/** Identifier for a wizard step. */
export type WizardStepRef = number | string;

/**
 * Outcome of a `nextStep` / `previousStep` predicate. Returning `null` (or
 * `'__end__'`) signals that the wizard should treat the current step as the
 * final step in this branch and run `onComplete`.
 */
export type WizardStepDecision = WizardStepRef | null;

/** A single step in the wizard. */
export interface WizardStepConfig<Model = unknown, StepMsg = unknown> {
  /** Stable identifier for cross-step references (`goto`, `nextStep`, etc.). */
  name?: string;
  /** Title displayed in the step indicator. */
  title: string;
  /** Optional description shown below the title. */
  description?: string;
  /** The step's component (usually a form engine instance). */
  component: StepComponent<Model, StepMsg>;
  /** Validate before allowing navigation to the next step. */
  validate?: (model: Model) => ValidationResult;
  /** Whether this step can be skipped. */
  optional?: boolean;
  /**
   * Override forward navigation. Receives the step's current model and the
   * full wizard model snapshot. Returning a step reference (name or index)
   * routes the wizard there; returning `null` terminates the branch (the
   * wizard finishes). Omitting the predicate uses the next sequential step.
   */
  nextStep?: (model: Model, wizard: WizardModel) => WizardStepDecision;
  /**
   * Override backward navigation. Same shape as `nextStep` but resolved when
   * `wizard:prev` fires. The returned ref must already be in the visited
   * history; otherwise the back nav is ignored.
   */
  previousStep?: (model: Model, wizard: WizardModel) => WizardStepDecision;
}

/** Static description of the wizard's step graph. Populated by `wizard()`. */
export interface WizardGraph {
  /** Step refs in declaration order. */
  readonly stepOrder: readonly WizardStepRef[];
  /** name → index lookup for ref resolution. */
  readonly nameToIndex: ReadonlyMap<string, number>;
  /** Static branch edges discoverable without evaluating predicates. */
  readonly edges: ReadonlyArray<{ readonly from: number; readonly to: number | 'dynamic' | 'end' }>;
}

/** Configuration for the wizard. */
export interface WizardConfig {
  /** Ordered array of step definitions. */
  steps: WizardStepConfig[];
  /** Callback when all steps are completed. */
  onComplete?: (stepModels: unknown[]) => unknown;
  /** Whether to allow backward navigation. Default true. */
  allowBack?: boolean;
  /** Focus group name. Defaults to 'orbit-wizard'. */
  focusGroup?: string;
  /** Theme override applied when rendering progress indicator and nav hints. */
  theme?: ThemeInput;
  themeCtx?: ThemeContext;
  /**
   * Optional event ledger. When supplied, the wizard emits
   * `wizard:step-advanced`, `wizard:step-completed`, and `wizard:finished`
   * events with structured payloads so chronos can replay runs.
   */
  ledger?: OrbitLedger;
  /** Identifier appended to every emitted event payload. Defaults to `focusGroup`. */
  ledgerWizardId?: string;
  /** Translation overrides for progress + navigation strings. */
  messages?: OrbitMessages;
  /** Locale hint forwarded to rosetta. */
  locale?: LocaleLike;
  /** Terminal glyph capability used by the progress indicator. Defaults to `wide`. */
  glyphLevel?: GlyphLevel;
}

/** Runtime state for the wizard. */
export interface WizardModel {
  /** Current step index (0-based). */
  currentStep: number;
  /** Per-step models. */
  stepModels: unknown[];
  /** Per-step completion status. */
  completed: boolean[];
  /** True when all steps are completed and onComplete has been called. */
  finished: boolean;
  /**
   * Ordered history of visited step indices. Drives backward navigation
   * across branches — `wizard:prev` always pops the last entry, even when
   * the static index is not `current - 1`.
   */
  visited: number[];
}

// ─── Messages ───────────────────────────────────────────────────────────────

export type WizardMsg =
  | Msg<'wizard:next'>
  | Msg<'wizard:prev'>
  | Msg<'wizard:goto', { readonly step: WizardStepRef }>
  | Msg<'wizard:step-msg', { readonly msg: unknown }>
  | Msg<'wizard:reset'>
  | Msg<'wizard:noop'>;

// ─── Descriptor ─────────────────────────────────────────────────────────────

export interface WizardDescriptor {
  init(): [WizardModel, Cmd<WizardMsg>];
  update(msg: WizardMsg, model: WizardModel): [WizardModel, Cmd<WizardMsg>];
  view(model: WizardModel): VNode;
  subscriptions?(model: WizardModel): Sub<WizardMsg>;
  /** Read the static step graph. */
  getGraph(): WizardGraph;
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Create a multi-step wizard.
 *
 * Each step owns a `ComponentDescriptor` whose model is stored in
 * `stepModels[i]`. Messages for the current step are wrapped in
 * `wizard:step-msg`. Navigation validates before advancing.
 *
 * Branching is opt-in: declare `nextStep` (and optionally `previousStep`) on
 * a step config to override the default linear flow. Returning `null` from
 * either predicate ends the wizard on that branch.
 */
export function wizard(config: WizardConfig): WizardDescriptor {
  if (config.steps.length === 0) throw new RangeError('orbit/wizard: at least one step is required');
  if (config.steps.length > MAX_WIZARD_STEPS) throw new RangeError(`orbit/wizard: steps cannot exceed ${MAX_WIZARD_STEPS}`);
  const steps = config.steps.map((step) => ({ ...step }));
  const totalSteps = steps.length;
  const allowBack = config.allowBack ?? true;
  const focusGroup = config.focusGroup ?? 'orbit-wizard';
  const ledgerWizardId = config.ledgerWizardId ?? focusGroup;
  const interactionId = nextInteractionId('wizard');
  const prevId = `${interactionId}:previous`;
  const nextId = `${interactionId}:next`;
  const activateTag = `${interactionId}:activate`;
  const emit = (kind: string, payload: Record<string, unknown>): void => {
    if (!config.ledger) return;
    void emitLedgerEvent(config.ledger, {
      kind,
      payload: { wizardId: ledgerWizardId, ...payload },
    });
  };

  const nameToIndex = new Map<string, number>();
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (step.name) {
      if (nameToIndex.has(step.name)) {
        throw new Error(`orbit/wizard: duplicate step name "${step.name}"`);
      }
      nameToIndex.set(step.name, i);
    }
  }

  const stepOrder: WizardStepRef[] = steps.map((step, index) => step.name ?? index);

  const edges: { from: number; to: number | 'dynamic' | 'end' }[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (step.nextStep) {
      edges.push({ from: i, to: 'dynamic' });
    } else if (i >= totalSteps - 1) {
      edges.push({ from: i, to: 'end' });
    } else {
      edges.push({ from: i, to: i + 1 });
    }
  }

  function graphSnapshot(): WizardGraph {
    return Object.freeze({
      stepOrder: Object.freeze([...stepOrder]),
      nameToIndex: new Map(nameToIndex),
      edges: Object.freeze(edges.map((edge) => Object.freeze({ ...edge }))),
    });
  }

  function resolveRef(ref: WizardStepRef): number | null {
    if (typeof ref === 'number') {
      return Number.isInteger(ref) && ref >= 0 && ref < totalSteps ? ref : null;
    }
    const idx = nameToIndex.get(ref);
    return idx === undefined ? null : idx;
  }

  function resolveDecision(decision: WizardStepDecision): number | null {
    if (decision === null) return null;
    return resolveRef(decision);
  }

  function initModel(): WizardModel {
    const stepModels: unknown[] = [];
    for (const step of steps) {
      const [model] = step.component.init();
      stepModels.push(model);
    }
    return {
      currentStep: 0,
      stepModels,
      completed: steps.map(() => false),
      finished: false,
      visited: [0],
    };
  }

  return {
    init(): [WizardModel, Cmd<WizardMsg>] {
      return [initModel(), Cmd.pushFocusGroup(focusGroup)];
    },

    update(msg: WizardMsg, model: WizardModel): [WizardModel, Cmd<WizardMsg>] {
      if (model.finished && msg.type !== 'wizard:reset') return [model, Cmd.none()];
      switch (msg.type) {
        case 'wizard:next': {
          const step = steps[model.currentStep];
          if (!step) return [model, Cmd.none()];

          // Validate (skip for optional steps)
          if (step.validate && !step.optional) {
            const result = step.validate(model.stepModels[model.currentStep]);
            if (!result.valid) return [model, Cmd.none()];
          }

          // Mark current step as completed
          const completed = [...model.completed];
          completed[model.currentStep] = true;

          // Resolve the next step. A `nextStep` predicate returning `null`
          // ends the wizard. Predicates that resolve to an unknown ref are
          // treated as a no-op so misconfigured branches surface fast.
          let nextIndex: number | null;
          if (step.nextStep) {
            const decision = step.nextStep(model.stepModels[model.currentStep], { ...model, completed });
            if (decision === null) {
              nextIndex = null;
            } else {
              const resolved = resolveDecision(decision);
              if (resolved === null) return [{ ...model, completed }, Cmd.none()];
              nextIndex = resolved;
            }
          } else if (model.currentStep >= totalSteps - 1) {
            nextIndex = null;
          } else {
            nextIndex = model.currentStep + 1;
          }

          const stepName = step.name ?? model.currentStep;
          emit('wizard:step-completed', { step: stepName, index: model.currentStep });

          if (nextIndex === null) {
            const finishedModel: WizardModel = {
              ...model,
              completed,
              finished: true,
            };
            config.onComplete?.([...model.stepModels]);
            emit('wizard:finished', { steps: model.visited.length });
            return [finishedModel, Cmd.none()];
          }

          const nextStepName = steps[nextIndex]?.name ?? nextIndex;
          emit('wizard:step-advanced', { from: stepName, to: nextStepName, index: nextIndex });

          return [
            {
              ...model,
              currentStep: nextIndex,
              completed,
              visited: appendVisited(model.visited, nextIndex),
            },
            Cmd.none(),
          ];
        }

        case 'wizard:prev': {
          if (!allowBack) return [model, Cmd.none()];

          const step = steps[model.currentStep];
          // Custom previousStep wins when declared.
          if (step?.previousStep) {
            const decision = step.previousStep(model.stepModels[model.currentStep], model);
            if (decision === null) return [model, Cmd.none()];
            const resolved = resolveDecision(decision);
            if (resolved === null) return [model, Cmd.none()];
            // Drop entries newer than the target so a re-forward retracks
            // the branch. If the target was never visited, the predicate
            // pointed at an unreachable step — refuse the back-nav.
            const visited = trimVisitedTo(model.visited, resolved);
            if (visited === null) return [model, Cmd.none()];
            return [{ ...model, currentStep: resolved, visited }, Cmd.none()];
          }

          // Default: pop the last visited step.
          if (model.visited.length <= 1) {
            return [model, Cmd.none()];
          }
          const visited = model.visited.slice(0, -1);
          const prev = visited[visited.length - 1] ?? 0;
          return [{ ...model, currentStep: prev, visited }, Cmd.none()];
        }

        case 'wizard:goto': {
          const target = resolveRef(msg.step);
          if (target === null) return [model, Cmd.none()];
          return [
            {
              ...model,
              currentStep: target,
              visited: appendVisited(model.visited, target),
            },
            Cmd.none(),
          ];
        }

        case 'wizard:step-msg': {
          const idx = model.currentStep;
          const step = steps[idx];
          if (!step || idx >= model.stepModels.length) return [model, Cmd.none()];

          const [newStepModel, stepCmd] = step.component.update(msg.msg as any, model.stepModels[idx] as any);

          const newStepModels = [...model.stepModels];
          newStepModels[idx] = newStepModel;

          const cmd = Cmd.map(stepCmd, (stepMsg: unknown) => ({
            type: 'wizard:step-msg' as const,
            msg: stepMsg,
          }));

          return [{ ...model, stepModels: newStepModels }, cmd];
        }

        case 'wizard:reset': {
          return [initModel(), Cmd.none()];
        }

        default:
          return [model, Cmd.none()];
      }
    },

    view(model: WizardModel): VNode {
      const children: VNode[] = [];

      // Progress indicator — renders one dot per *visited* step plus the
      // remaining static order to give consumers a sense of depth without
      // exposing branch internals.
      const visitedSet = new Set(model.visited);
      const selectedGlyph = resolveGlyph(DEFAULT_GLYPH_TOKENS.selected, config.glyphLevel ?? 'wide');
      const unselectedGlyph = resolveGlyph(DEFAULT_GLYPH_TOKENS.unselected, config.glyphLevel ?? 'wide');
      const dots = steps.map((_, i) => (visitedSet.has(i) || i <= model.currentStep ? selectedGlyph : unselectedGlyph)).join(' ');
      const step = steps[model.currentStep];
      const title = step?.title ?? '';
      const progressStyle = style({ color: orbitToneColor(config, 'accent') });
      const stepLabel = tr(
        config.messages,
        'wizard.step_label',
        {
          current: model.visited.length,
          total: branchEstimate(model, totalSteps),
          title,
        },
        config.locale,
      );
      children.push(text(`${stepLabel}  [${dots}]`, progressStyle));

      if (step?.description) {
        const descStyle = style({ dim: true, color: formColor(config, 'muted') });
        children.push(text(`  ${step.description}`, descStyle));
      }

      if (step) {
        const stepModel = model.stepModels[model.currentStep];
        children.push(step.component.view(stepModel as any));
      }

      const navStyle = style({ color: formColor(config, 'muted'), dim: true });
      if (!model.finished) {
        const navNodes: VNode[] = [];
        if (model.visited.length > 1 && allowBack) {
          const previousLabel = tr(config.messages, 'wizard.btn.prev', undefined, config.locale);
          navNodes.push(
            event(
              prevId,
              text(`  ${previousLabel}`, navStyle),
              { onClick: activateTag },
              { label: previousLabel, intent: 'navigate-back', affordances: ['click'], cursor: 'pointer', keyboardHint: 'Escape' },
            ),
          );
        }
        const nextLabel = isLastStaticStep(model, totalSteps, step)
          ? tr(config.messages, 'wizard.btn.finish', undefined, config.locale)
          : tr(config.messages, 'wizard.btn.next', undefined, config.locale);
        navNodes.push(
          event(
            nextId,
            text(`  ${nextLabel}`, navStyle),
            { onClick: activateTag },
            { label: nextLabel, intent: 'navigate-forward', affordances: ['click'], cursor: 'pointer', keyboardHint: 'Enter' },
          ),
        );
        children.push(row(...navNodes));
      }

      return column(...children);
    },

    subscriptions(model: WizardModel): Sub<WizardMsg> {
      if (model.finished) return Sub.none();
      const subs: Sub<WizardMsg>[] = [
        Sub.elementMouse<WizardMsg>((mouseEvent) => {
          if (mouseEvent.handlerTag !== activateTag) return { type: 'wizard:noop' };
          if (mouseEvent.elementId === prevId) return { type: 'wizard:prev' };
          if (mouseEvent.elementId === nextId) return { type: 'wizard:next' };
          return { type: 'wizard:noop' };
        }),
        Sub.key('enter', { type: 'wizard:next' }),
      ];

      if (allowBack) {
        subs.push(Sub.key('escape', { type: 'wizard:prev' }));
      }

      const step = steps[model.currentStep];
      if (step?.component.subscriptions) {
        const stepModel = model.stepModels[model.currentStep];
        const stepSub = step.component.subscriptions(stepModel as any);
        subs.push(
          Sub.map(stepSub, (stepMsg: unknown) => ({
            type: 'wizard:step-msg' as const,
            msg: stepMsg,
          })),
        );
      }

      return Sub.batch(...subs);
    },

    getGraph(): WizardGraph {
      return graphSnapshot();
    },
  };
}

function trimVisitedTo(visited: readonly number[], target: number): number[] | null {
  const index = visited.lastIndexOf(target);
  if (index >= 0) return visited.slice(0, index + 1);
  // Target was never visited. Returning null signals the caller to treat
  // the back-nav as a no-op rather than growing `visited` on what is
  // semantically a backward move. Authoring a `previousStep` that points
  // outside history is a configuration error — we refuse to silently
  // navigate forward through the "back" door.
  return null;
}

function appendVisited(visited: readonly number[], target: number): number[] {
  const next = [...visited, target];
  if (next.length <= MAX_COLLECTION_ITEMS) return next;
  return [next[0] ?? target, ...next.slice(-(MAX_COLLECTION_ITEMS - 1))];
}

function isLastStaticStep(model: WizardModel, totalSteps: number, step: WizardStepConfig | undefined): boolean {
  if (!step) return true;
  if (step.nextStep) {
    // Cannot tell from the static config alone; treat as "Next" until the
    // predicate confirms branch termination.
    return false;
  }
  return model.currentStep >= totalSteps - 1;
}

function branchEstimate(model: WizardModel, totalSteps: number): number {
  // Branching wizards have no static "total" beyond the unique steps in
  // declaration order. For the progress indicator we show
  // max(totalSteps, visited.length) so the label never reads "Step 4 of 3".
  return Math.max(totalSteps, model.visited.length);
}
