/**
 * Pulsar Performance Micro-benchmarks
 *
 * Budgets defined in the PRD §6.6. Run via `pnpm vitest run --reporter=verbose`
 * or `pnpm test` (bench tests are skipped in standard runs because they use
 * `bench()` instead of `test()`).
 */

import { bench, describe } from 'vitest';
import { parseMarkdown, renderMarkdown } from '../index.js';
import { createMarkdownStream } from '../stream.js';
import { defaultTheme } from '../theme.js';

const KB = 1024;

function generateMarkdown(sizeBytes: number): string {
  const paragraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
  const block = `# Heading\n\n${paragraph.repeat(5)}\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n\n`;
  let out = '';
  while (out.length < sizeBytes) {
    out += block;
  }
  return out.slice(0, sizeBytes);
}

describe('parseMarkdown 100 KB', () => {
  const input = generateMarkdown(100 * KB);
  bench(
    'parse',
    () => {
      parseMarkdown(input);
    },
    { time: 500 },
  );
});

describe('renderMarkdown (string) 100 KB', () => {
  const input = generateMarkdown(100 * KB);
  bench(
    'render',
    () => {
      renderMarkdown(input, { width: 80 });
    },
    { time: 500 },
  );
});

describe('createMarkdownStream per 1 KB chunk', () => {
  const stream = createMarkdownStream({ width: 80, theme: defaultTheme() });
  const chunk = generateMarkdown(1 * KB);
  bench(
    'append',
    () => {
      stream.append(chunk);
    },
    { time: 500 },
  );
});
