#!/usr/bin/env node

/**
 * create-celestial
 * Interactive project generator for Celestial applications.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import readline from 'node:readline';

const TEMPLATES: Record<string, { name: string; description: string; files: Record<string, string> }> = {
  'counter-tea': {
    name: 'Counter (Classic Elm Architecture)',
    description: 'Clean TEA starter with model, update, view, and keyboard subscriptions',
    files: {
      'src/index.ts': `import { app, Cmd, color, column, type Msg, style, Sub, text } from '@celestial/core';

interface Model {
  count: number;
}

type CounterMsg = { type: 'increment' } | { type: 'decrement' } | { type: 'quit' };

const countStyle = style({ color: color.brightCyan, bold: true });

app<Model, CounterMsg>({
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
});
`,
    },
  },

  'tsx-app': {
    name: 'Declarative TSX / JSX App',
    description: 'Modern TSX starter with <Box>, <Text>, <Button>, and flex layouts',
    files: {
      'src/index.tsx': `import { app, Cmd, color, type Msg, Sub } from '@celestial/core';
import { Box, Text, Button, Row, Divider } from '@celestial/core/jsx';

interface Model {
  count: number;
}

type AppMsg = { type: 'inc' } | { type: 'dec' } | { type: 'quit' };

app<Model, AppMsg>({
  init: () => [{ count: 0 }, Cmd.none()],

  update(msg, model) {
    switch (msg.type) {
      case 'inc':
        return [{ count: model.count + 1 }, Cmd.none()];
      case 'dec':
        return [{ count: model.count - 1 }, Cmd.none()];
      case 'quit':
        return [model, Cmd.quit()];
    }
  },

  view: (model) => (
    <Box border="rounded" padding={1} width={60} borderColor={color.brightCyan}>
      <Text bold color={color.brightWhite}>🚀 Celestial TSX Application</Text>
      <Divider label="Status" />
      <Text color={color.brightCyan}>Current Count: {model.count}</Text>
      <Row gap={2}>
        <Button label="[+] Add" onClick={() => ({ type: 'inc' })} />
        <Button label="[-] Subtract" onClick={() => ({ type: 'dec' })} />
        <Button label="[Q] Quit" onClick={() => ({ type: 'quit' })} />
      </Row>
    </Box>
  ),

  subscriptions: () =>
    Sub.batch<AppMsg>(
      Sub.key('+', { type: 'inc' }),
      Sub.key('-', { type: 'dec' }),
      Sub.key('q', { type: 'quit' }),
    ),
});
`,
    },
  },

  'ai-assistant': {
    name: 'AI Coding Assistant TUI',
    description: 'AI chat interface with streaming Markdown, tool execution cards, and diff viewer',
    files: {
      'src/index.ts': `import { app, Cmd, color, column, type Msg, row, style, Sub, text } from '@celestial/core';
import { diffViewer, toolCall } from '@celestial/ui';

interface Model {
  query: string;
  step: number;
}

type AgentMsg = { type: 'next' } | { type: 'quit' };

app<Model, AgentMsg>({
  init: () => [{ query: 'Refactor database client', step: 1 }, Cmd.none()],

  update(msg, model) {
    switch (msg.type) {
      case 'next':
        return [{ ...model, step: (model.step % 3) + 1 }, Cmd.none()];
      case 'quit':
        return [model, Cmd.quit()];
    }
  },

  view: (model) =>
    column(
      text('🤖 Celestial AI Assistant', style({ bold: true, color: color.brightCyan })),
      text(\`User Query: "\${model.query}"\`, style({ dim: true })),
      text(''),
      toolCall({
        name: 'read_file',
        status: model.step >= 2 ? 'success' : 'running',
        input: { path: 'src/db.ts' },
        output: 'export const db = new Client();',
        durationMs: 420,
      }),
      text(''),
      diffViewer({
        title: 'src/db.ts',
        diffText: \`@@ -1,2 +1,2 @@
-const client = new LegacyDB();
+const client = new ModernPool({ max: 20 });\`,
      }),
      text(''),
      text('[Space/Enter] Next step   [Q] Quit', style({ dim: true })),
    ),

  subscriptions: () =>
    Sub.batch<AgentMsg>(
      Sub.key(' ', { type: 'next' }),
      Sub.key('enter', { type: 'next' }),
      Sub.key('q', { type: 'quit' }),
    ),
});
`,
    },
  },

  'minimal-prompt': {
    name: 'Minimal Prompt CLI (Clack / Inquirer style)',
    description: 'Interactive CLI that prompts the user and cleanly exits to stdout',
    files: {
      'src/index.ts': `import { inlinePrompt } from '@celestial/ui';

async function main() {
  console.log('\\x1b[1m\\x1b[36m┌  Welcome to your CLI Tool\\x1b[0m\\n');

  const projectName = await inlinePrompt.text({
    message: 'What is your project name?',
    initial: 'my-celestial-app',
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

  console.log('\\n\\x1b[32m✔ Project configured successfully!\\x1b[0m\\n');
}

main().catch(console.error);
`,
    },
  },
};

async function prompt(question: string, defaultValue = ''): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question}${defaultValue ? ` (${defaultValue})` : ''}: `, (ans) => {
      rl.close();
      resolve(ans.trim() || defaultValue);
    });
  });
}

export async function run() {
  console.log('\x1b[1m\x1b[36m✨ create-celestial - Scaffold a modern TypeScript TUI app\x1b[0m\n');

  const targetDir = (process.argv[2] || (await prompt('Project directory', 'my-celestial-app'))).trim();
  const root = resolve(process.cwd(), targetDir);

  if (existsSync(root)) {
    console.error(`\x1b[31mError: Target directory "${targetDir}" already exists.\x1b[0m`);
    process.exit(1);
  }

  console.log('\nSelect a project template:');
  const templateKeys = Object.keys(TEMPLATES);
  for (let i = 0; i < templateKeys.length; i++) {
    const k = templateKeys[i];
    console.log(`  \x1b[36m${i + 1}\x1b[0m) \x1b[1m${TEMPLATES[k].name}\x1b[0m - ${TEMPLATES[k].description}`);
  }

  const choice = await prompt('\nChoice (1-4)', '1');
  const selectedIdx = Math.max(0, Math.min(templateKeys.length - 1, parseInt(choice, 10) - 1 || 0));
  const templateKey = templateKeys[selectedIdx];
  const template = TEMPLATES[templateKey];

  console.log(`\nScaffolding project in \x1b[32m${root}\x1b[0m using template \x1b[36m${template.name}\x1b[0m...`);
  mkdirSync(join(root, 'src'), { recursive: true });

  const packageJson = {
    name: targetDir,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'tsx src/index.ts',
      build: 'tsup src/index.ts --format esm --clean',
      start: 'node dist/index.js',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      '@celestial/core': '^0.1.0-preview.1',
      '@celestial/ui': '^0.1.0-preview.1',
    },
    devDependencies: {
      tsup: '^8.3.0',
      tsx: '^4.19.0',
      typescript: '^5.7.0',
      '@types/node': '^22.0.0',
    },
  };

  if (templateKey === 'tsx-app') {
    (packageJson.scripts as any).dev = 'tsx src/index.tsx';
    (packageJson.scripts as any).build = 'tsup src/index.tsx --format esm --clean';
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

  writeFileSync(join(root, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify(tsconfigJson, null, 2), 'utf8');
  writeFileSync(
    join(root, 'README.md'),
    `# ${targetDir}\n\nBuilt with [Celestial](https://github.com/Sokoliem/celestial-oss).\n\n## Getting Started\n\n\`\`\`bash\npnpm install\npnpm dev\n\`\`\`\n`,
    'utf8',
  );

  for (const [fileRel, content] of Object.entries(template.files)) {
    writeFileSync(join(root, fileRel), content, 'utf8');
  }

  console.log(`\n\x1b[32m✔ Created ${targetDir}\x1b[0m\n`);
  console.log('Next steps:');
  console.log(`  cd ${targetDir}`);
  console.log('  pnpm install');
  console.log('  pnpm dev\n');
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  run().catch(console.error);
}
