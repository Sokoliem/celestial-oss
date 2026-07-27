import {
  createSplitterController,
  splitter,
  type SplitterController,
  type SplitterDirection,
  type SplitterPaneSpec,
  type SplitterSnapshot,
} from '@celestial/core/gravity';
import type { ComponentNode } from '@celestial/core/nebula';

export type {
  SplitterController,
  SplitterDirection,
  SplitterPaneSpec,
  SplitterSnapshot,
};
export type { SplitterPaneSnapshot } from '@celestial/core/gravity';

export interface HorizonSplitControllerOptions<TId extends string = string> {
  direction: SplitterDirection;
  panes: readonly SplitterPaneSpec<TId>[];
  controller?: SplitterController<TId>;
  handleSize?: number;
  idPrefix?: string;
}

export interface HorizonSplitController<TId extends string = string> {
  controller: SplitterController<TId>;
  render(options?: Partial<Pick<HorizonSplitControllerOptions<TId>, 'handleSize' | 'idPrefix'>>): ComponentNode;
  serialize(): SplitterSnapshot<TId>;
  hydrate(snapshot: SplitterSnapshot<TId>): void;
}

/**
 * Horizon compatibility adapter over Gravity's canonical splitter. Keeping one
 * controller means pane validation, persistence, constraints, metadata, and
 * resize behavior cannot drift between layout and desktop packages.
 */
export function createHorizonSplitController<TId extends string = string>(
  options: HorizonSplitControllerOptions<TId>,
): HorizonSplitController<TId> {
  const panes = options.panes.map((pane) => ({ ...pane }));
  const controller = options.controller ?? createSplitterController({ panes });
  return {
    controller,
    render: (overrides = {}) =>
      splitter({
        direction: options.direction,
        panes,
        controller,
        handleSize: overrides.handleSize ?? options.handleSize,
        idPrefix: overrides.idPrefix ?? options.idPrefix,
      }),
    serialize: () => controller.serialize(),
    hydrate: (snapshot) => controller.hydrate(snapshot),
  };
}

export function splitPaneFromController<TId extends string = string>(
  options: HorizonSplitControllerOptions<TId>,
): ComponentNode {
  return createHorizonSplitController(options).render();
}
