/**
 * High-level convenience runner — manages timers, cursor, and stdout.
 *
 * Usage:
 *   const s = createSpinner('dots', { text: 'Loading...' });
 *   s.start();
 *   // ... do work ...
 *   s.succeed('Done!');
 */

import { lookup, resolve } from './engine.js';
import type { ResolvedSpinner, RunnerOptions, SpinnerDefinition } from './types.js';
import { symbols } from './types.js';

export interface SpinnerInstance {
  /** Start the spinner animation. */
  start(text?: string): SpinnerInstance;
  /** Stop the spinner (clears the line). */
  stop(): SpinnerInstance;
  /** Stop with a success symbol and message. */
  succeed(text?: string): SpinnerInstance;
  /** Stop with an error symbol and message. */
  fail(text?: string): SpinnerInstance;
  /** Stop with a warning symbol and message. */
  warn(text?: string): SpinnerInstance;
  /** Stop with an info symbol and message. */
  info(text?: string): SpinnerInstance;
  /** Update the spinner text without stopping. */
  update(text: string): SpinnerInstance;
  /** Change the spinner animation. */
  setSpinner(spinner: string | SpinnerDefinition): SpinnerInstance;
  /** Whether the spinner is currently animating. */
  readonly isSpinning: boolean;
  /** The current text. */
  text: string;
}

export function createSpinner(spinner?: string | SpinnerDefinition, options?: RunnerOptions): SpinnerInstance {
  const opts: RunnerOptions = { ...options };
  const stream = opts.stream ?? process.stderr;
  const hideCursor = opts.hideCursor ?? true;
  const indent = opts.indent ?? 0;
  const indentStr = ' '.repeat(indent);
  const prefixStr = opts.prefix ? opts.prefix + ' ' : '';

  let resolved: ResolvedSpinner;
  let timer: ReturnType<typeof setInterval> | null = null;
  let tick = 0;
  let currentText = opts.text ?? '';
  let spinning = false;
  let cursorHidden = false;

  // Resolve the spinner definition
  function resolveSpinner(s?: string | SpinnerDefinition): ResolvedSpinner {
    if (!s) s = 'dots';
    if (typeof s === 'string') {
      const def = lookup(s);
      if (!def) throw new Error(`Unknown spinner: "${s}". Use listSpinners() to see available names.`);
      return resolve(def);
    }
    return resolve(s);
  }

  resolved = resolveSpinner(spinner ?? opts.spinner);

  function clearLine(): void {
    stream.write('\x1b[2K\x1b[G');
  }

  function writeLine(): void {
    const frame = resolved.frame(tick);
    const colorStart = opts.color ?? '';
    const colorEnd = opts.color ? '\x1b[39m' : '';
    const line = `${indentStr}${prefixStr}${colorStart}${frame}${colorEnd} ${currentText}`;
    clearLine();
    stream.write(line);
  }

  function stopSymbol(symbol: string, text?: string): SpinnerInstance {
    if (text !== undefined) currentText = text;
    stopTimer();
    clearLine();
    stream.write(`${indentStr}${prefixStr}${symbol} ${currentText}\n`);
    return instance;
  }

  function stopTimer(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    spinning = false;
    if (cursorHidden) {
      stream.write('\x1b[?25h');
      cursorHidden = false;
    }
  }

  const instance: SpinnerInstance = {
    get isSpinning(): boolean {
      return spinning;
    },

    get text(): string {
      return currentText;
    },
    set text(value: string) {
      currentText = value;
    },

    start(text?: string): SpinnerInstance {
      if (text !== undefined) currentText = text;
      if (spinning) return instance;
      spinning = true;
      tick = 0;
      if (hideCursor && !cursorHidden) {
        stream.write('\x1b[?25l');
        cursorHidden = true;
      }
      writeLine();
      timer = setInterval(() => {
        tick++;
        writeLine();
      }, resolved.interval);
      return instance;
    },

    stop(): SpinnerInstance {
      stopTimer();
      clearLine();
      return instance;
    },

    succeed(text?: string): SpinnerInstance {
      return stopSymbol(`\x1b[32m${symbols.success}\x1b[39m`, text);
    },

    fail(text?: string): SpinnerInstance {
      return stopSymbol(`\x1b[31m${symbols.error}\x1b[39m`, text);
    },

    warn(text?: string): SpinnerInstance {
      return stopSymbol(`\x1b[33m${symbols.warning}\x1b[39m`, text);
    },

    info(text?: string): SpinnerInstance {
      return stopSymbol(`\x1b[34m${symbols.info}\x1b[39m`, text);
    },

    update(text: string): SpinnerInstance {
      currentText = text;
      if (spinning) writeLine();
      return instance;
    },

    setSpinner(s: string | SpinnerDefinition): SpinnerInstance {
      resolved = resolveSpinner(s);
      tick = 0;
      if (spinning) {
        if (timer) clearInterval(timer);
        writeLine(); // Immediately show first frame of new spinner
        timer = setInterval(() => {
          tick++;
          writeLine();
        }, resolved.interval);
      }
      return instance;
    },
  };

  return instance;
}
