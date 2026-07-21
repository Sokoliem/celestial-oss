import type { Color, SemanticTheme, Style, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { Cmd, Sub, text } from '@celestial/core/nebula';
import { measureTextWidth, segmentGraphemes } from '@celestial/rosetta';
import { boundedInteger, clampRange, nonNegativeInteger, timerInterval } from './internal.js';
import { resolveTheme, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface ProgressTokens {
  bar: Color;
  track: Color;
  text: Color;
  textSoft: Color;
  labelStyle: TypographyToken;
}

export const progressContract: TokenContract<ProgressTokens> = {
  bar: (t: SemanticTheme) => t.colors.trackFill,
  track: (t: SemanticTheme) => t.colors.muted,
  text: (t: SemanticTheme) => t.colors.text,
  textSoft: (t: SemanticTheme) => t.colors.textSoft,
  labelStyle: (t: SemanticTheme) => t.typography.label,
};

export interface ProgressBarConfig {
  value: number;
  width?: number;
  filled?: string;
  empty?: string;
  label?: string;
  showPercentage?: boolean;
  style?: Style;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

function singleCellGlyph(value: string | undefined, fallback: string): string {
  const candidate = segmentGraphemes(value ?? '')[0];
  return candidate && measureTextWidth(candidate) === 1 ? candidate : fallback;
}

export function progressBar(config: ProgressBarConfig): VNode {
  const tokens = useTokens(progressContract, config, 'ProgressBar');
  const w = nonNegativeInteger(config.width, 20);
  const f = singleCellGlyph(config.filled, '█');
  const e = singleCellGlyph(config.empty, '░');
  const clamped = clampRange(config.value, 0, 1, 0);
  const filled = Math.round(clamped * w);
  const showPct = config.showPercentage ?? true;
  const pctStr = showPct ? ` ${Math.round(clamped * 100)}%` : '';
  const labelStr = config.label ? `${config.label} ` : '';
  return text(`${labelStr}[${f.repeat(filled)}${e.repeat(w - filled)}]${pctStr}`, config.style ?? style({ color: tokens.bar }));
}

export interface IndeterminateProgressConfig {
  width?: number;
  speed?: number;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}
export interface IndeterminateProgressModel {
  position: number;
}
export type IndeterminateProgressMsg = Msg<'tick'>;

export function indeterminateProgress(config: IndeterminateProgressConfig): ComponentDescriptor<IndeterminateProgressModel, IndeterminateProgressMsg> {
  const w = nonNegativeInteger(config.width, 20);
  const speed = timerInterval(config.speed, 100);
  const bounceLen = 3;
  const cycleLength = Math.max(1, w * 2);
  return {
    init(): [IndeterminateProgressModel, Cmd<IndeterminateProgressMsg>] {
      return [{ position: 0 }, Cmd.none()];
    },
    update(msg: IndeterminateProgressMsg, model: IndeterminateProgressModel): [IndeterminateProgressModel, Cmd<IndeterminateProgressMsg>] {
      if (msg.type === 'tick') {
        const position = boundedInteger(model.position, 0, 0, cycleLength - 1);
        return [{ position: (position + 1) % cycleLength }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },
    view(model: IndeterminateProgressModel): VNode {
      const tokens = useTokens(progressContract, config, 'IndeterminateProgress');
      const configuredPosition = boundedInteger(model.position, 0, 0, cycleLength - 1);
      const position = resolveTheme(config).motion.reduceMotion ? 0 : configuredPosition;
      const pos = position < w ? position : w * 2 - position;
      const before = Math.max(0, Math.min(pos, w - bounceLen));
      const blockLen = Math.min(bounceLen, w - before);
      const after = w - before - blockLen;
      return text(`[${' '.repeat(before)}${'█'.repeat(blockLen)}${' '.repeat(after)}]`, style({ color: tokens.bar }));
    },
    subscriptions(): Sub<IndeterminateProgressMsg> {
      return w === 0 || resolveTheme(config).motion.reduceMotion ? Sub.none() : Sub.timer(speed, () => ({ type: 'tick' }));
    },
  };
}

export type SpinnerStyle = 'dots' | 'line' | 'arc' | 'bounce';
const FRAMES: Record<SpinnerStyle, string[]> = {
  dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  line: ['|', '/', '-', '\\'],
  arc: ['◜', '◠', '◝', '◞', '◡', '◟'],
  bounce: ['⠁', '⠂', '⠄', '⠂'],
};
export interface SpinnerConfig {
  style?: SpinnerStyle;
  speed?: number;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}
export interface SpinnerModel {
  frame: number;
}
export type SpinnerMsg = Msg<'tick'>;

export function spinner(config: SpinnerConfig): ComponentDescriptor<SpinnerModel, SpinnerMsg> {
  const requestedStyle = config.style ?? 'dots';
  const frames = FRAMES[requestedStyle] ?? FRAMES.dots;
  const speed = timerInterval(config.speed, 80);
  return {
    init(): [SpinnerModel, Cmd<SpinnerMsg>] {
      return [{ frame: 0 }, Cmd.none()];
    },
    update(msg: SpinnerMsg, model: SpinnerModel): [SpinnerModel, Cmd<SpinnerMsg>] {
      if (msg.type === 'tick') {
        const frame = boundedInteger(model.frame, 0, 0, frames.length - 1);
        return [{ frame: (frame + 1) % frames.length }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },
    view(model: SpinnerModel): VNode {
      const tokens = useTokens(progressContract, config, 'Spinner');
      const frame = resolveTheme(config).motion.reduceMotion ? 0 : boundedInteger(model.frame, 0, 0, frames.length - 1);
      return text(frames[frame]!, style({ color: tokens.bar, bold: true }));
    },
    subscriptions(): Sub<SpinnerMsg> {
      return resolveTheme(config).motion.reduceMotion ? Sub.none() : Sub.timer(speed, () => ({ type: 'tick' }));
    },
  };
}
