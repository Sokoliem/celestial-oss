/**
 * Canonical event-driven button.
 *
 * Pointer geometry belongs to Nebula/Nexus. UI controls declare semantic
 * events and accessibility metadata so hosts do not have to wrap a visual in
 * a second, inconsistent event node.
 */
import type { ThemeInput, Tone } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { actionControl, type ActionControlVariant } from './primitives.js';

export type ButtonVariant = ActionControlVariant;

export interface ButtonConfig {
  readonly id: string;
  readonly label: string;
  readonly onClick: string;
  readonly onRightClick?: string;
  readonly onMouseEnter?: string;
  readonly onMouseLeave?: string;
  readonly onScroll?: string;
  readonly buttonVariant?: ButtonVariant;
  readonly tone?: Tone;
  readonly hovered?: boolean;
  readonly focused?: boolean;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly keyboardHint?: string;
  readonly intent?: string;
  readonly theme?: ThemeInput;
  readonly themeCtx?: ThemeContext;
}

/** Create a complete themed and accessible button VNode. */
export function button(config: ButtonConfig): VNode {
  return actionControl({
    ...config,
    variant: config.buttonVariant,
  });
}
