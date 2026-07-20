/**
 * Core types for the spinner engine used by @celestial/corona.
 *
 * A spinner is defined by its frames and interval. Frames can be static strings
 * or dynamically generated via a function of the current tick. The engine
 * renders spinners by cycling through frames at the specified interval.
 */

/** A single frame — either a plain string or a styled string with ANSI codes. */
export type Frame = string;

/**
 * A spinner definition — the fundamental building block.
 *
 * Static spinners have a `frames` array. Procedural spinners have a `render`
 * function that receives the tick count and returns a frame.
 */
export interface SpinnerDefinition {
  /** Unique name for this spinner. */
  readonly name: string;
  /** Frames to cycle through. Mutually exclusive with `render`. */
  readonly frames?: readonly Frame[];
  /** Procedural frame generator. Receives tick index, returns a frame string. */
  readonly render?: (tick: number) => Frame;
  /** Milliseconds between frame advances. Default: 80. */
  readonly interval?: number;
}

/** Resolved spinner ready for rendering — always has a way to get a frame. */
export interface ResolvedSpinner {
  readonly name: string;
  readonly interval: number;
  /** Get the frame string for a given tick index. */
  frame(tick: number): Frame;
  /** Total number of frames (Infinity for procedural spinners). */
  readonly length: number;
}

/** Options for the high-level runner. */
export interface RunnerOptions {
  /** Spinner name or definition. Default: 'dots'. */
  spinner?: string | SpinnerDefinition;
  /** Text to display after the spinner. */
  text?: string;
  /** Text color (ANSI code). */
  color?: string;
  /** Stream to write to. Default: process.stderr. */
  stream?: NodeJS.WritableStream;
  /** Whether to hide the cursor. Default: true. */
  hideCursor?: boolean;
  /** Prefix text before the spinner. */
  prefix?: string;
  /** Indent level (spaces). Default: 0. */
  indent?: number;
}

/** Symbols for terminal status indicators. */
export const symbols = {
  success: process.platform === 'win32' ? '√' : '✔',
  error: process.platform === 'win32' ? '×' : '✖',
  warning: process.platform === 'win32' ? '‼' : '⚠',
  info: process.platform === 'win32' ? 'i' : 'ℹ',
} as const;

/** A transform function that maps one spinner definition into another. */
export type SpinnerTransform = (spinner: SpinnerDefinition) => SpinnerDefinition;
