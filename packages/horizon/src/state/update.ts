export interface StateUpdateResult<Model, Effect = never, Diagnostic = never> {
  readonly model: Model;
  readonly effects: readonly Effect[];
  readonly diagnostics: readonly Diagnostic[];
}

const EMPTY_EFFECTS: readonly never[] = [];
const EMPTY_DIAGNOSTICS: readonly never[] = [];

export function stateUpdateResult<Model, Effect = never, Diagnostic = never>(
  model: Model,
  effects?: readonly Effect[],
  diagnostics?: readonly Diagnostic[],
): StateUpdateResult<Model, Effect, Diagnostic> {
  return {
    model,
    effects: effects ?? EMPTY_EFFECTS,
    diagnostics: diagnostics ?? EMPTY_DIAGNOSTICS,
  };
}
