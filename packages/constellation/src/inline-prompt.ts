import readline from 'node:readline';
import process from 'node:process';

export interface PromptTextOptions {
  message: string;
  placeholder?: string;
  initial?: string;
  validate?: (val: string) => boolean | string;
}

export interface PromptConfirmOptions {
  message: string;
  initial?: boolean;
}

export interface PromptSelectOption<T = string> {
  label: string;
  value: T;
  hint?: string;
}

export interface PromptSelectOptions<T = string> {
  message: string;
  options: PromptSelectOption<T>[];
  initialIndex?: number;
}

/**
 * Inline prompt runner that operates directly in standard stdout / stdin,
 * preserving scrollback history upon completion (like Clack / Inquirer).
 */
export const inlinePrompt = {
  /** Prompt for text input */
  async text(options: PromptTextOptions): Promise<string> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const promptLabel = `? \x1b[1m${options.message}\x1b[22m${options.placeholder ? ` \x1b[2m(${options.placeholder})\x1b[22m` : ''}: `;

      rl.question(promptLabel, (answer) => {
        rl.close();
        const value = answer.trim() || options.initial || '';
        process.stdout.write(`\x1b[32m✔\x1b[0m \x1b[1m${options.message}\x1b[22m \x1b[36m${value}\x1b[0m\n`);
        resolve(value);
      });
    });
  },

  /** Prompt for yes/no confirmation */
  async confirm(options: PromptConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const initial = options.initial ?? true;
      const hint = initial ? 'Y/n' : 'y/N';
      const promptLabel = `? \x1b[1m${options.message}\x1b[22m \x1b[2m(${hint})\x1b[22m: `;

      rl.question(promptLabel, (answer) => {
        rl.close();
        const trimmed = answer.trim().toLowerCase();
        let value = initial;
        if (trimmed === 'y' || trimmed === 'yes') value = true;
        else if (trimmed === 'n' || trimmed === 'no') value = false;

        const icon = value ? '\x1b[32m✔\x1b[0m' : '\x1b[33m✖\x1b[0m';
        const display = value ? 'Yes' : 'No';
        process.stdout.write(`${icon} \x1b[1m${options.message}\x1b[22m \x1b[36m${display}\x1b[0m\n`);
        resolve(value);
      });
    });
  },

  /** Prompt to select an option from a list */
  async select<T = string>(options: PromptSelectOptions<T>): Promise<T> {
    if (options.options.length === 0) {
      throw new Error('options cannot be empty');
    }

    if (!process.stdin.isTTY) {
      const first = options.options[options.initialIndex ?? 0] ?? options.options[0];
      if (!first) throw new Error('No option available');
      return first.value;
    }

    return new Promise((resolve) => {
      let selectedIndex = options.initialIndex ?? 0;
      const count = options.options.length;

      const wasRaw = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.resume();

      function render(firstTime = false) {
        if (!firstTime) {
          process.stdout.write(`\x1b[${count + 1}A\r`);
        }

        let out = `? \x1b[1m${options.message}\x1b[22m \x1b[2m(Use arrow keys)\x1b[22m\n`;
        for (let i = 0; i < count; i++) {
          const opt = options.options[i];
          if (!opt) continue;
          const isSelected = i === selectedIndex;
          const pointer = isSelected ? '\x1b[36m❯\x1b[0m' : ' ';
          const label = isSelected ? `\x1b[36m\x1b[1m${opt.label}\x1b[22m\x1b[0m` : opt.label;
          const hint = opt.hint ? ` \x1b[2m(${opt.hint})\x1b[22m` : '';
          out += `  ${pointer} ${label}${hint}\n`;
        }
        process.stdout.write(out);
      }

      function cleanup() {
        process.stdin.removeListener('data', onKey);
        process.stdin.setRawMode(wasRaw ?? false);
        process.stdin.pause();
      }

      function onKey(data: Buffer) {
        const s = data.toString();
        if (s === '\u0003') {
          cleanup();
          process.exit(130);
        } else if (s === '\r' || s === '\n') {
          cleanup();
          process.stdout.write(`\x1b[${count + 1}A\r\x1b[0J`);
          const chosen = options.options[selectedIndex] ?? options.options[0];
          if (!chosen) return;
          process.stdout.write(`\x1b[32m✔\x1b[0m \x1b[1m${options.message}\x1b[22m \x1b[36m${chosen.label}\x1b[0m\n`);
          resolve(chosen.value);
        } else if (s === '\u001b[A' || s === 'k') {
          selectedIndex = (selectedIndex - 1 + count) % count;
          render();
        } else if (s === '\u001b[B' || s === 'j') {
          selectedIndex = (selectedIndex + 1) % count;
          render();
        }
      }

      process.stdin.on('data', onKey);
      render(true);
    });
  },
};
