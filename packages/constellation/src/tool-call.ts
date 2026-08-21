import { border, style } from '@celestial/core/corona';
import type { Color, SemanticTheme, ThemeInput, TokenContract } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { box, Cmd, column, event, row, setVNodeMeta, Sub, text } from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { nonNegativeInteger, positiveInteger } from './internal.js';
import { useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface ToolCallTokens {
  name: Color;
  duration: Color;
  sectionLabel: Color;
  input: Color;
  output: Color;
  outputError: Color;
  toggleHint: Color;
  bg: Color;
  toneWarning: Color;
  toneInfo: Color;
  toneSuccess: Color;
  toneDanger: Color;
  focusRing: Color;
}

export const toolCallContract: TokenContract<ToolCallTokens> = {
  name: (t: SemanticTheme) => t.colors.text,
  duration: (t: SemanticTheme) => t.colors.muted,
  sectionLabel: (t: SemanticTheme) => t.colors.muted,
  input: (t: SemanticTheme) => t.colors.textSoft,
  output: (t: SemanticTheme) => t.colors.textSoft,
  outputError: (t: SemanticTheme) => t.colors.tones.danger,
  toggleHint: (t: SemanticTheme) => t.colors.muted,
  bg: (t: SemanticTheme) => t.colors.surfaceRaised,
  toneWarning: (t: SemanticTheme) => t.colors.tones.warning,
  toneInfo: (t: SemanticTheme) => t.colors.tones.info,
  toneSuccess: (t: SemanticTheme) => t.colors.tones.success,
  toneDanger: (t: SemanticTheme) => t.colors.tones.danger,
  focusRing: (t: SemanticTheme) => t.colors.focusRing,
};

// ─── Component ───────────────────────────────────────────────────────────────

export type ToolStatus = 'pending' | 'running' | 'success' | 'error';

const STATUS_GLYPHS: Record<ToolStatus, string> = {
  pending: '⏳',
  running: '⠋',
  success: '✔',
  error: '✖',
};

const STATUS_TONE_TOKENS: Record<ToolStatus, 'toneWarning' | 'toneInfo' | 'toneSuccess' | 'toneDanger'> = {
  pending: 'toneWarning',
  running: 'toneInfo',
  success: 'toneSuccess',
  error: 'toneDanger',
};

export interface ToolCallConfig {
  name: string;
  status: ToolStatus;
  input?: string | Record<string, unknown>;
  output?: string;
  durationMs?: number;
  /** Initial collapsed state. Default false (expanded). */
  collapsed?: boolean;
  /** Called with the next collapsed state when the user toggles via mouse or keyboard. */
  onToggle?: (collapsed: boolean) => void;
  width?: number;
  /** Maximum input lines shown before truncating. Default 10. */
  maxInputLines?: number;
  /** Maximum output lines shown before truncating. Default 15. */
  maxOutputLines?: number;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface ToolCallModel {
  collapsed: boolean;
  hovered: boolean;
  focused: boolean;
}

export type ToolCallMsg = Msg<'toggle' | 'hover' | 'leave' | 'focus' | 'blur' | 'noop'>;

/**
 * AI tool execution card: status glyph, execution timing, and collapsible
 * input/output sections. A full component descriptor — owns collapsed/hover/
 * focus state, mouse toggle, and a focus-gated keyboard toggle (Space/Enter).
 */
export function toolCall(config: ToolCallConfig): ComponentDescriptor<ToolCallModel, ToolCallMsg> {
  const width = config.width === undefined ? undefined : positiveInteger(config.width, 1);
  const maxInputLines = nonNegativeInteger(config.maxInputLines, 10);
  const maxOutputLines = nonNegativeInteger(config.maxOutputLines, 15);
  const interactionId = generateFocusGroupId(`tool-call-${config.name}`);
  const toggleTag = `${interactionId}:toggle`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;

  return {
    init(): [ToolCallModel, Cmd<ToolCallMsg>] {
      return [{ collapsed: config.collapsed ?? false, hovered: false, focused: false }, Cmd.none()];
    },

    update(msg: ToolCallMsg, model: ToolCallModel): [ToolCallModel, Cmd<ToolCallMsg>] {
      switch (msg.type) {
        case 'toggle': {
          const collapsed = !model.collapsed;
          config.onToggle?.(collapsed);
          return [{ ...model, collapsed }, Cmd.none()];
        }
        case 'hover':
          return [{ ...model, hovered: true }, Cmd.none()];
        case 'leave':
          return [{ ...model, hovered: false }, Cmd.none()];
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false }, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },

    view(model: ToolCallModel): VNode {
      const tokens = useTokens(toolCallContract, config, 'ToolCall');
      const tone = tokens[STATUS_TONE_TOKENS[config.status]];
      const glyph = STATUS_GLYPHS[config.status];
      const durationText = config.durationMs !== undefined ? ` (${(config.durationMs / 1000).toFixed(2)}s)` : '';

      const headerLeft = row(
        text(`${glyph} `, style({ color: tone, bold: true })),
        text(config.name, style({ bold: true, color: tokens.name })),
        text(durationText, style({ dim: true, color: tokens.duration })),
      );
      const toggleText = model.collapsed ? '▶ expand' : '▼ collapse';
      const headerRow = row(headerLeft, text('  '), text(toggleText, style({ dim: true, color: tokens.toggleHint })));

      const items: VNode[] = [headerRow];

      if (!model.collapsed) {
        if (config.input !== undefined) {
          const formattedInput = typeof config.input === 'string' ? config.input : JSON.stringify(config.input, null, 2);
          const inputLines = formattedInput.split('\n');
          items.push(text(''));
          items.push(text('Input:', style({ bold: true, dim: true, color: tokens.sectionLabel })));
          for (const line of inputLines.slice(0, maxInputLines)) {
            items.push(text(`  ${line}`, style({ color: tokens.input })));
          }
          if (inputLines.length > maxInputLines) {
            items.push(text(`  … (${inputLines.length - maxInputLines} more lines)`, style({ dim: true, color: tokens.toggleHint })));
          }
        }

        if (config.output !== undefined) {
          const outputLines = config.output.split('\n');
          items.push(text(''));
          items.push(text('Output:', style({ bold: true, dim: true, color: tokens.sectionLabel })));
          for (const line of outputLines.slice(0, maxOutputLines)) {
            items.push(
              text(`  ${line}`, style({ color: config.status === 'error' ? tokens.outputError : tokens.output })),
            );
          }
          if (outputLines.length > maxOutputLines) {
            items.push(text(`  … (${outputLines.length - maxOutputLines} more lines)`, style({ dim: true, color: tokens.toggleHint })));
          }
        }
      }

      const card = box(
        column(...items),
        style({
          border: border.rounded,
          borderColor: model.focused ? tokens.focusRing : tone,
          background: tokens.bg,
          padding: 1,
        }),
        { width, fit: width !== undefined ? 'fill' : 'content', overflow: 'hidden' },
      );
      setVNodeMeta(card, {
        testId: `tool-call-${config.name}`,
        a11y: { role: 'region', label: `Tool call ${config.name}`, expanded: !model.collapsed },
      });

      return event(
        interactionId,
        card,
        { onClick: toggleTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
        { label: `Tool call ${config.name}`, intent: 'toggle', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Space' },
      );
    },

    subscriptions(model: ToolCallModel): Sub<ToolCallMsg> {
      const mouse = Sub.elementMouse<ToolCallMsg>((mouseEvent) => {
        if (mouseEvent.elementId !== interactionId) return { type: 'noop' };
        if (mouseEvent.handlerTag === toggleTag) return { type: 'toggle' };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover' };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        return { type: 'noop' };
      });
      if (!model.focused) return mouse;
      return Sub.batch<ToolCallMsg>(mouse, Sub.key('space', { type: 'toggle' }), Sub.key('enter', { type: 'toggle' }));
    },
  };
}
