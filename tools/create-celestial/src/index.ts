#!/usr/bin/env node

/**
 * create-celestial
 * Interactive project generator for Celestial applications.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';

const PACKAGE_VERSION: string = (() => {
  // Lazy and defensive: the CJS bundle may lack a usable import.meta.url, and
  // merely requiring this module must never throw.
  try {
    return (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version as string) ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

export interface TemplateDefinition {
  name: string;
  description: string;
  files: Record<string, string>;
}

export const TEMPLATES: Record<string, TemplateDefinition> = {
  'counter-tea': {
    name: 'Counter (Classic Elm Architecture)',
    description: 'Clean TEA starter with model, update, view, and keyboard subscriptions',
    files: {
      'src/app.ts': `import { type AppConfig, Cmd, color, column, style, Sub, text } from '@celestial/core';

export interface Model {
  count: number;
}

export type CounterMsg = { type: 'increment' } | { type: 'decrement' } | { type: 'quit' };

const countStyle = style({ color: color.brightCyan, bold: true });

export const config: AppConfig<Model, CounterMsg> = {
  init: () => [{ count: 0 }, Cmd.none()],

  update(message, model) {
    switch (message.type) {
      case 'increment':
        return [{ count: model.count + 1 }, Cmd.none()];
      case 'decrement':
        return [{ count: model.count - 1 }, Cmd.none()];
      case 'quit':
        return [model, Cmd.quit()];
    }
  },

  view: (model) =>
    column(
      text(\`Count: \${model.count}\`, countStyle),
      text('[+] increment  [-] decrement  [q] quit', style({ dim: true })),
    ),

  subscriptions: () =>
    Sub.batch<CounterMsg>(
      Sub.key('+', { type: 'increment' }),
      Sub.key('-', { type: 'decrement' }),
      Sub.key('q', { type: 'quit' }),
    ),
};
`,
      'src/index.ts': `import { app } from '@celestial/core';
import { config } from './app.js';

app(config);
`,
      'src/app.test.ts': `import { createTestApp } from '@celestial/test';
import { describe, expect, it } from 'vitest';
import { config } from './app.js';

describe('counter app', () => {
  it('increments and decrements through real key input', () => {
    const handle = createTestApp(config, { cols: 40, rows: 10 });

    handle.pressKey('+');
    expect(handle.model.count).toBe(1);
    handle.pressKey('+');
    handle.pressKey('-');
    expect(handle.model.count).toBe(1);
    expect(handle.lastFrame()).toContain('Count: 1');

    handle.stop();
  });
});
`,
      '.github/workflows/ci.yml': `name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install
      - run: pnpm run typecheck
      - run: pnpm test
`,
    },
  },

  'tsx-app': {
    name: 'Declarative TSX / JSX App',
    description: 'Modern TSX starter with <Box>, <Text>, <Button>, and clickable buttons',
    files: {
      'src/app.tsx': `import { type AppConfig, Cmd, color, Sub } from '@celestial/core';
import { Box, Button, Divider, Row, Text } from '@celestial/core/jsx';

export interface Model {
  count: number;
}

export type AppMsg = { type: 'inc' } | { type: 'dec' } | { type: 'quit' } | { type: 'noop' };

export const config: AppConfig<Model, AppMsg> = {
  init: () => [{ count: 0 }, Cmd.none()],

  update(msg, model) {
    switch (msg.type) {
      case 'inc':
        return [{ count: model.count + 1 }, Cmd.none()];
      case 'dec':
        return [{ count: model.count - 1 }, Cmd.none()];
      case 'quit':
        return [model, Cmd.quit()];
      case 'noop':
        return [model, Cmd.none()];
    }
  },

  view: (model) => (
    <Box border="rounded" padding={1} width={60} borderColor={color.brightCyan}>
      <Text bold color={color.brightWhite}>🚀 Celestial TSX Application</Text>
      <Divider label="Status" />
      <Text color={color.brightCyan}>Current Count: {model.count}</Text>
      <Row gap={2}>
        <Button label="[+] Add" onClick="inc" />
        <Button label="[-] Subtract" onClick="dec" />
        <Button label="[Q] Quit" onClick="quit" />
      </Row>
    </Box>
  ),

  subscriptions: () =>
    Sub.batch<AppMsg>(
      Sub.key('+', { type: 'inc' }),
      Sub.key('-', { type: 'dec' }),
      Sub.key('q', { type: 'quit' }),
      // Button onClick tags arrive as element-mouse handler tags.
      Sub.elementMouse((event): AppMsg => {
        switch (event.handlerTag) {
          case 'inc':
            return { type: 'inc' };
          case 'dec':
            return { type: 'dec' };
          case 'quit':
            return { type: 'quit' };
          default:
            return { type: 'noop' };
        }
      }),
    ),
};
`,
      'src/index.tsx': `import { app } from '@celestial/core';
import { config } from './app.js';

app(config);
`,
      'src/app.test.tsx': `import { createTestApp } from '@celestial/test';
import { describe, expect, it } from 'vitest';
import { config } from './app.js';

describe('tsx app', () => {
  it('increments via keyboard and the button element-mouse tag', () => {
    const handle = createTestApp(config, { cols: 64, rows: 12 });

    handle.pressKey('+');
    expect(handle.model.count).toBe(1);

    handle.dispatch({ type: 'inc' });
    expect(handle.model.count).toBe(2);
    expect(handle.lastFrame()).toContain('Current Count: 2');

    handle.stop();
  });
});
`,
      '.github/workflows/ci.yml': `name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install
      - run: pnpm run typecheck
      - run: pnpm test
`,
    },
  },

  'ai-assistant': {
    name: 'AI Coding Assistant TUI',
    description: 'AI chat interface with a tool execution card and syntax-highlighted diff viewer',
    files: {
      'src/app.ts': `import { type AppConfig, Cmd, color, column, style, Sub, text } from '@celestial/core';
import { diffViewer, toolCall, type ToolCallModel, type ToolCallMsg } from '@celestial/ui';

// Interactive components are constructed once; the host app threads their
// model and messages through its own update loop.
const readFileCall = toolCall({
  name: 'read_file',
  status: 'success',
  input: { path: 'src/db.ts' },
  output: 'export const db = new Client();',
  durationMs: 420,
});

const DIFFS = [
  \`@@ -1,2 +1,2 @@
-const client = new LegacyDB();
+const client = new ModernPool({ max: 20 });\`,
  \`@@ -1,2 +1,2 @@
-const client = new ModernPool({ max: 20 });
+const client = new ModernPool({ max: 20, telemetry: true });\`,
  \`@@ -1,2 +1,2 @@
-const client = new ModernPool({ max: 20, telemetry: true });
+const client = await ModernPool.connect({ max: 20, telemetry: true });\`,
];

export interface Model {
  step: number;
  call: ToolCallModel;
}

export type AgentMsg = { type: 'next' } | { type: 'quit' } | { type: 'call'; msg: ToolCallMsg };

export const config: AppConfig<Model, AgentMsg> = {
  init: () => {
    const [call, callCmd] = readFileCall.init();
    return [{ step: 0, call }, Cmd.map(callCmd, (msg): AgentMsg => ({ type: 'call', msg }))];
  },

  update(msg, model) {
    switch (msg.type) {
      case 'next':
        return [{ ...model, step: (model.step + 1) % DIFFS.length }, Cmd.none()];
      case 'quit':
        return [model, Cmd.quit()];
      case 'call': {
        const [call, callCmd] = readFileCall.update(msg.msg, model.call);
        return [{ ...model, call }, Cmd.map(callCmd, (inner): AgentMsg => ({ type: 'call', msg: inner }))];
      }
    }
  },

  view: (model) =>
    column(
      text('🤖 Celestial AI Assistant', style({ bold: true, color: color.brightCyan })),
      text('User Query: "Refactor the database client"', style({ dim: true })),
      text(''),
      readFileCall.view(model.call),
      text(''),
      diffViewer({ title: 'src/db.ts', diffText: DIFFS[model.step] ?? DIFFS[0] ?? '' }),
      text(''),
      text('[Space/Enter] Next diff   [Tab then Space] Toggle tool card   [Q] Quit', style({ dim: true })),
    ),

  subscriptions: (model) =>
    Sub.batch<AgentMsg>(
      Sub.key('space', { type: 'next' }),
      Sub.key('enter', { type: 'next' }),
      Sub.key('q', { type: 'quit' }),
      Sub.map(readFileCall.subscriptions?.(model.call) ?? Sub.none<ToolCallMsg>(), (msg): AgentMsg => ({ type: 'call', msg })),
    ),
};
`,
      'src/index.ts': `import { app } from '@celestial/core';
import { config } from './app.js';

app(config);
`,
      'src/app.test.ts': `import { createTestApp } from '@celestial/test';
import { describe, expect, it } from 'vitest';
import { config } from './app.js';

describe('ai assistant app', () => {
  it('cycles diffs and renders the tool card', () => {
    const handle = createTestApp(config, { cols: 80, rows: 30 });

    expect(handle.lastFrame()).toContain('read_file');
    expect(handle.lastFrame()).toContain('LegacyDB');

    handle.pressKey(' ');
    expect(handle.model.step).toBe(1);
    expect(handle.lastFrame()).toContain('telemetry: true');

    handle.stop();
  });
});
`,
      '.github/workflows/ci.yml': `name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install
      - run: pnpm run typecheck
      - run: pnpm test
`,
    },
  },

  'minimal-prompt': {
    name: 'Minimal Prompt CLI (Clack / Inquirer style)',
    description: 'Interactive CLI that prompts the user and cleanly exits to stdout',
    files: {
      'src/index.ts': `import { inlinePrompt, PromptCancelledError } from '@celestial/ui';

async function main() {
  console.log('\\x1b[1m\\x1b[36m┌  Welcome to your CLI Tool\\x1b[0m\\n');

  try {
    const projectName = await inlinePrompt.text({
      message: 'What is your project name?',
      initial: 'my-celestial-app',
      validate: (value) => (value.length >= 3 ? true : 'Please enter at least 3 characters'),
    });

    const language = await inlinePrompt.select({
      message: 'Select language',
      options: [
        { label: 'TypeScript', value: 'ts', hint: 'recommended' },
        { label: 'JavaScript', value: 'js' },
      ],
    });

    const gitInit = await inlinePrompt.confirm({
      message: 'Initialize a new git repository?',
      initial: true,
    });

    console.log(\`\\n\\x1b[32m✔ Project configured successfully!\x1b[0m\`);
    console.log(\`  name: \${projectName}  language: \${language}  git: \${gitInit ? 'yes' : 'no'}\\n\`);
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      console.log('\\nCancelled.');
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      'src/index.test.ts': `import { inlinePrompt, PromptCancelledError } from '@celestial/ui';
import { describe, expect, it } from 'vitest';

describe('inlinePrompt in non-interactive environments (CI, pipes)', () => {
  it('resolves documented defaults instead of prompting', async () => {
    await expect(inlinePrompt.text({ message: 'Name', initial: 'fallback' })).resolves.toBe('fallback');
    await expect(inlinePrompt.confirm({ message: 'Ok?', initial: false })).resolves.toBe(false);
    await expect(inlinePrompt.select({ message: 'Pick', options: [{ label: 'A', value: 'a' }] })).resolves.toBe('a');
  });

  it('exports a typed cancellation error', () => {
    expect(new PromptCancelledError().name).toBe('PromptCancelledError');
  });
});
`,
      '.github/workflows/ci.yml': `name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install
      - run: pnpm run typecheck
      - run: pnpm test
`,
    },
  },
};

export const TEMPLATE_KEYS = Object.freeze(Object.keys(TEMPLATES));

export interface ScaffoldOptions {
  /** Absolute directory to create. Must not already exist. */
  root: string;
  /** Package name written into the generated package.json. */
  name: string;
  templateKey: string;
}

/**
 * Write a scaffolded project to disk. Pure file generation — prompting lives
 * in run(). Returns the relative paths written.
 */
export function scaffoldProject(options: ScaffoldOptions): string[] {
  const template = TEMPLATES[options.templateKey];
  if (!template) {
    throw new RangeError(`Unknown template "${options.templateKey}". Known templates: ${TEMPLATE_KEYS.join(', ')}`);
  }
  if (existsSync(options.root)) {
    throw new Error(`Target directory "${options.root}" already exists.`);
  }

  mkdirSync(join(options.root, 'src'), { recursive: true });
  mkdirSync(join(options.root, '.github', 'workflows'), { recursive: true });

  const packageJson: Record<string, unknown> = {
    name: options.name,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'tsx src/index.ts',
      build: 'tsup src/index.ts --format esm --clean',
      start: 'node dist/index.js',
      typecheck: 'tsc --noEmit',
      test: 'vitest run',
    },
    dependencies: {
      '@celestial/core': '^0.1.0-preview.1',
      '@celestial/ui': '^0.1.0-preview.1',
    },
    devDependencies: {
      '@celestial/test': '^0.1.0-preview.1',
      tsup: '^8.3.0',
      tsx: '^4.19.0',
      typescript: '^5.9.3',
      vitest: '^2.1.0',
      '@types/node': '^25.5.0',
    },
  };

  if (options.templateKey === 'tsx-app') {
    (packageJson.scripts as Record<string, string>).dev = 'tsx src/index.tsx';
    (packageJson.scripts as Record<string, string>).build = 'tsup src/index.tsx --format esm --clean';
  }

  const tsconfigJson = {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      jsx: 'react-jsx',
      jsxImportSource: '@celestial/core',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: 'dist',
    },
    include: ['src'],
  };

  const written: string[] = [];
  const write = (relativePath: string, content: string): void => {
    writeFileSync(join(options.root, relativePath), content, 'utf8');
    written.push(relativePath);
  };

  write('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
  write('tsconfig.json', `${JSON.stringify(tsconfigJson, null, 2)}\n`);
  write(
    'README.md',
    `# ${options.name}\n\nBuilt with [Celestial](https://github.com/Sokoliem/celestial-oss).\n\n## Getting Started\n\n\`\`\`bash\npnpm install\npnpm dev\n\`\`\`\n`,
  );

  for (const [fileRel, content] of Object.entries(template.files)) {
    write(fileRel, content);
  }

  return written;
}

const HELP = `
  create-celestial — Scaffold a modern TypeScript TUI app powered by Celestial

  Usage
    npm create celestial [directory] [template]
    create-celestial [directory] [--template <key>]

  Templates
${TEMPLATE_KEYS.map((key) => `    ${key.padEnd(16)} ${TEMPLATES[key]!.name} — ${TEMPLATES[key]!.description}`).join('\n')}

  Options
    -t, --template <key>  Template to use (skips the interactive picker)
    -h, --help            Show this help
    -v, --version         Show the version

  With no directory or template you will be prompted for both.
`;

interface CliArgs {
  directory?: string;
  templateKey?: string;
  help: boolean;
  version: boolean;
  error?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { help: false, version: false };
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '-h' || arg === '--help') {
      out.help = true;
    } else if (arg === '-v' || arg === '--version') {
      out.version = true;
    } else if (arg === '-t' || arg === '--template') {
      const value = argv[++i];
      if (!value) return { ...out, error: '--template requires a value' };
      out.templateKey = value;
    } else if (arg.startsWith('--template=')) {
      out.templateKey = arg.slice('--template='.length);
    } else if (arg.startsWith('-')) {
      return { ...out, error: `Unknown option: ${arg}` };
    } else {
      positionals.push(arg);
    }
  }
  out.directory = positionals[0];
  if (!out.templateKey && positionals[1]) out.templateKey = positionals[1];
  if (positionals.length > 2) return { ...out, error: `Unexpected argument: ${positionals[2]}` };
  if (out.templateKey && !TEMPLATES[out.templateKey]) {
    return { ...out, error: `Unknown template "${out.templateKey}". Known templates: ${TEMPLATE_KEYS.join(', ')}` };
  }
  return out;
}

async function prompt(question: string, defaultValue = ''): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolvePromise) => {
    rl.question(`${question}${defaultValue ? ` (${defaultValue})` : ''}: `, (ans) => {
      rl.close();
      resolvePromise(ans.trim() || defaultValue);
    });
  });
}

export async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }
  if (args.version) {
    console.log(PACKAGE_VERSION);
    return;
  }
  if (args.error) {
    console.error(`\x1b[31m${args.error}\x1b[0m`);
    console.log(HELP);
    process.exitCode = 1;
    return;
  }

  console.log('\x1b[1m\x1b[36m✨ create-celestial - Scaffold a modern TypeScript TUI app\x1b[0m\n');

  const targetDir = (args.directory || (await prompt('Project directory', 'my-celestial-app'))).trim();
  const root = resolve(process.cwd(), targetDir);

  let templateKey = args.templateKey;
  if (!templateKey) {
    console.log('\nSelect a project template:');
    for (let i = 0; i < TEMPLATE_KEYS.length; i++) {
      const key = TEMPLATE_KEYS[i]!;
      console.log(`  \x1b[36m${i + 1}\x1b[0m) \x1b[1m${TEMPLATES[key]!.name}\x1b[0m - ${TEMPLATES[key]!.description}`);
    }
    const choice = await prompt(`\nChoice (1-${TEMPLATE_KEYS.length})`, '1');
    const selectedIdx = Math.max(0, Math.min(TEMPLATE_KEYS.length - 1, parseInt(choice, 10) - 1 || 0));
    templateKey = TEMPLATE_KEYS[selectedIdx]!;
  }

  console.log(`\nScaffolding project in \x1b[32m${root}\x1b[0m using template \x1b[36m${TEMPLATES[templateKey]!.name}\x1b[0m...`);

  let written: string[];
  try {
    written = scaffoldProject({ root, name: targetDir, templateKey });
  } catch (error) {
    console.error(`\x1b[31m${error instanceof Error ? error.message : String(error)}\x1b[0m`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n\x1b[32m✔ Created ${targetDir}\x1b[0m — ${written.length} files:`);
  for (const file of written) console.log(`  ${file}`);
  console.log('\nNext steps:');
  console.log(`  cd ${targetDir}`);
  console.log('  pnpm install');
  console.log('  pnpm dev\n');
}

/** True only when this module is the process entry point (never on import/require). */
function isDirectExecution(): boolean {
  try {
    const entry = process.argv[1];
    if (!entry) return false;
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
