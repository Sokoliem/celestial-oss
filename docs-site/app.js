const COMPONENTS = {
  'tool-call': {
    title: 'Tool Call Execution Card',
    filename: 'tool-call-example.ts',
    screen: `<span style="color:#58a6ff">╭─────────────────────────────────────────────────────────────╮</span>
<span style="color:#58a6ff">│</span>  <span style="color:#3fb950;font-weight:bold">✔</span>  <span style="font-weight:bold;color:#fff">bash</span> <span style="color:#8b949e">(0.84s)</span>                                <span style="color:#8b949e">▼ collapse</span> <span style="color:#58a6ff">│</span>
<span style="color:#58a6ff">│</span>                                                             <span style="color:#58a6ff">│</span>
<span style="color:#58a6ff">│</span>  <span style="font-weight:bold;color:#8b949e">Input:</span>                                                     <span style="color:#58a6ff">│</span>
<span style="color:#58a6ff">│</span>  <span style="color:#8b949e">  { command: "pnpm run test:pty" }</span>                         <span style="color:#58a6ff">│</span>
<span style="color:#58a6ff">│</span>                                                             <span style="color:#58a6ff">│</span>
<span style="color:#58a6ff">│</span>  <span style="font-weight:bold;color:#8b949e">Output:</span>                                                    <span style="color:#58a6ff">│</span>
<span style="color:#58a6ff">│</span>    <span style="color:#3fb950">✓ 68 tests passed (0 failures) [2.1s]</span>                    <span style="color:#58a6ff">│</span>
<span style="color:#58a6ff">╰─────────────────────────────────────────────────────────────╯</span>`,
    code: `import { toolCall } from '@celestial/ui';

const card = toolCall({
  name: 'bash',
  status: 'success',
  input: { command: 'pnpm run test:pty' },
  output: '✓ 68 tests passed (0 failures) [2.1s]',
  durationMs: 840,
  collapsed: false,
  onToggle: () => ({ type: 'toggle-tool' }),
});`,
  },

  'diff-viewer': {
    title: 'Git Diff Viewer',
    filename: 'diff-viewer-example.ts',
    screen: `<span style="color:#8b949e">╭─────────────────────────────────────────────────────────────╮</span>
<span style="color:#8b949e">│</span> <span style="color:#8b949e">diff</span> <span style="color:#58a6ff;font-weight:bold">src/server.ts</span>                                          <span style="color:#8b949e">│</span>
<span style="color:#8b949e">│</span> ─────────────────────────────────────────────────────────── <span style="color:#8b949e">│</span>
<span style="color:#8b949e">│</span> <span style="color:#58a6ff;opacity:0.8">@@ -12,4 +12,4 @@</span>                                           <span style="color:#8b949e">│</span>
<span style="color:#8b949e">│</span> <span style="color:#8b949e">  12   12</span>   export function start() {                       <span style="color:#8b949e">│</span>
<span style="color:#8b949e">│</span> <span style="color:#8b949e">  13     </span> <span style="color:#f85149;font-weight:bold">-</span> <span style="color:#f85149;background:rgba(248,81,73,0.15)">  const server = http.createServer(app);     </span> <span style="color:#8b949e">│</span>
<span style="color:#8b949e">│</span> <span style="color:#8b949e">       13</span> <span style="color:#3fb950;font-weight:bold">+</span> <span style="color:#3fb950;background:rgba(63,185,80,0.15)">  const server = createSecureServer(app);    </span> <span style="color:#8b949e">│</span>
<span style="color:#8b949e">│</span> <span style="color:#8b949e">  14   14</span>     server.listen(port);                          <span style="color:#8b949e">│</span>
<span style="color:#8b949e">╰─────────────────────────────────────────────────────────────╯</span>`,
    code: `import { diffViewer } from '@celestial/ui';

const diff = diffViewer({
  title: 'src/server.ts',
  diffText: \`@@ -12,4 +12,4 @@
   export function start() {
-  const server = http.createServer(app);
+  const server = createSecureServer(app);
     server.listen(port);\`,
  showLineNumbers: true,
});`,
  },

  'streaming-md': {
    title: 'Streaming Markdown Parser',
    filename: 'streaming-md-example.ts',
    screen: `<span style="font-weight:bold;color:#58a6ff;font-size:1.1em"># Refactoring Architecture</span>

Here is the revised state management pipeline:

  <span style="color:#d29922">1.</span> Actions are dispatched to the <span style="color:#bc8cff;font-weight:bold">Elm runtime</span>
  <span style="color:#d29922">2.</span> Pure reducers return <span style="color:#58a6ff">[Model, Cmd]</span> tuples
  <span style="color:#d29922">3.</span> Virtual terminal tree renders without tearing

\`\`\`typescript
const [model, cmd] = update(message, currentModel);
\`\`\`
<span style="color:#58a6ff">█</span> <span style="color:#8b949e;font-size:0.85em">(streaming tokens... 240 wpm)</span>`,
    code: `import { createMarkdownStream } from '@celestial/pulsar';

const stream = createMarkdownStream({
  theme: 'dark',
  wrap: true,
});

// Append incoming LLM token chunks
stream.append('Here is the revised **pipeline**...');
const renderedVNode = stream.render();`,
  },

  'inline-prompt': {
    title: 'Inline CLI Prompt (Clack/Inquirer style)',
    filename: 'inline-prompt-example.ts',
    screen: `<span style="color:#58a6ff;font-weight:bold">?</span> <span style="font-weight:bold;color:#fff">Select deployment environment</span> <span style="color:#8b949e">(Use arrow keys)</span>
    <span style="color:#8b949e">Production (us-east-1)</span>
  <span style="color:#58a6ff;font-weight:bold">❯ <span style="color:#58a6ff;text-decoration:underline">Staging (eu-central-1)</span></span> <span style="color:#8b949e">(active canary)</span>
    <span style="color:#8b949e">Local Development (localhost:8080)</span>

<span style="color:#3fb950;font-weight:bold">✔</span> <span style="font-weight:bold;color:#fff">Authentication</span> <span style="color:#58a6ff">token verified (admin)</span>`,
    code: `import { inlinePrompt } from '@celestial/ui';

const env = await inlinePrompt.select({
  message: 'Select deployment environment',
  options: [
    { label: 'Production', value: 'prod' },
    { label: 'Staging', value: 'stage', hint: 'active canary' },
    { label: 'Local Dev', value: 'dev' },
  ],
});`,
  },

  'progress': {
    title: 'ProgressBar & Animated Spinners',
    filename: 'progress-example.ts',
    screen: `<span style="color:#8b949e">Compiling packages...</span>
<span style="color:#58a6ff">████████████████████████</span><span style="color:#30363d">░░░░░░░░</span> <span style="color:#8b949e">75%</span>

<span style="color:#58a6ff;font-weight:bold">⠋</span> Bundling tree with esbuild...
<span style="color:#3fb950;font-weight:bold">✔</span> Grapheme segmentation verified`,
    code: `import { progressBar, spinnerEl, row, column, text } from '@celestial/core';

const progress = row(
  progressBar({ value: 75, max: 100, width: 24 }),
);

const spinner = spinnerEl({ frame: 3, label: 'Bundling tree...' });`,
  },

  'card': {
    title: 'Card & Semantic Badges',
    filename: 'card-example.ts',
    screen: `<span style="color:#58a6ff">╭── System Health ────────────────────────────────────────────╮</span>
<span style="color:#58a6ff">│</span>                                                             <span style="color:#58a6ff">│</span>
<span style="color:#58a6ff">│</span>  Status:     <span style="color:#3fb950;font-weight:bold">[ OPERATIONAL ]</span>                                <span style="color:#58a6ff">│</span>
<span style="color:#58a6ff">│</span>  Workers:    <span style="color:#58a6ff">8 active</span>                                       <span style="color:#58a6ff">│</span>
<span style="color:#58a6ff">│</span>  Memory:     <span style="color:#d29922">420 MB / 1024 MB</span>                               <span style="color:#58a6ff">│</span>
<span style="color:#58a6ff">│</span>                                                             <span style="color:#58a6ff">│</span>
<span style="color:#58a6ff">╰─────────────────────────────────────────────────────────────╯</span>`,
    code: `import { badge, card } from '@celestial/ui';
import { row, text, column } from '@celestial/core';

const healthCard = card({
  title: 'System Health',
  tone: 'info',
  content: column(
    row(text('Status:  '), badge({ label: 'OPERATIONAL', tone: 'success' })),
    text('Workers: 8 active'),
    text('Memory:  420 MB / 1024 MB'),
  ),
});`,
  },

  'table': {
    title: 'DataTable with Keyboard Navigation',
    filename: 'table-example.ts',
    screen: `<span style="color:#58a6ff;font-weight:bold">ID     PACKAGE             VERSION           STATUS</span>
─────────────────────────────────────────────────────────────
01     @celestial/core     0.1.0-preview.1   <span style="color:#3fb950">✔ stable</span>
<span style="background:rgba(88,166,255,0.2)">02     @celestial/horizon  0.1.0-beta.1      <span style="color:#d29922">✦ beta</span>    </span>
03     @celestial/pulsar   0.1.0-preview.1   <span style="color:#3fb950">✔ stable</span>
04     @celestial/stellar  0.1.0-preview.1   <span style="color:#3fb950">✔ stable</span>`,
    code: `import { dataTable } from '@celestial/ui';

const table = dataTable({
  columns: [
    { key: 'id', header: 'ID', width: 6 },
    { key: 'pkg', header: 'PACKAGE', width: 20 },
    { key: 'ver', header: 'VERSION', width: 18 },
    { key: 'status', header: 'STATUS', width: 12 },
  ],
  data: [
    { id: '01', pkg: '@celestial/core', ver: '0.1.0-preview.1', status: '✔ stable' },
    { id: '02', pkg: '@celestial/horizon', ver: '0.1.0-beta.1', status: '✦ beta' },
  ],
  selectedIndex: 1,
});`,
  },

  'horizon': {
    title: 'Horizon Beta Multi-Window Tiling',
    filename: 'horizon-example.ts',
    screen: `<span style="color:#30363d">┌─ [1] Logs ─────────────────┐┌─ [2] Metrics ───────────────┐</span>
<span style="color:#30363d">│</span> [14:02:11] Node started    <span style="color:#30363d">││</span> CPU:  <span style="color:#3fb950">■■■■░░░░░░</span> 40%      <span style="color:#30363d">│</span>
<span style="color:#30363d">│</span> [14:02:12] Subscribed TEA  <span style="color:#30363d">││</span> MEM:  <span style="color:#58a6ff">■■■■■■░░░░</span> 60%      <span style="color:#30363d">│</span>
<span style="color:#30363d">└────────────────────────────┘└───────────────────────────┘</span>
<span style="background:#161b22;color:#8b949e"> [Workspace 1: Default]  [Workspace 2: Monitoring]          </span>`,
    code: `import { createWorkspaceManager } from '@celestial/horizon';

const manager = createWorkspaceManager({
  workspaces: ['Default', 'Monitoring'],
  activeWorkspace: 0,
});

manager.splitHorizontal({
  left: logsPane,
  right: metricsPane,
  ratio: 0.5,
});`,
  },

  'tsx-box': {
    title: 'Declarative TSX / JSX Syntax',
    filename: 'tsx-example.tsx',
    screen: `<span style="color:#58a6ff">╭─────────────────────────────────────────────────────────────╮</span>
<span style="color:#58a6ff">│</span>  <span style="font-weight:bold;color:#fff">🚀 Launch Mission Control</span>                                  <span style="color:#58a6ff">│</span>
<span style="color:#58a6ff">│</span>  ─────────────────────────────────────────────────────────  <span style="color:#58a6ff">│</span>
<span style="color:#58a6ff">│</span>  Current Count: <span style="color:#58a6ff">42</span>                                           <span style="color:#58a6ff">│</span>
<span style="color:#58a6ff">│</span>  <span style="background:rgba(88,166,255,0.2);color:#58a6ff">[ + Increment ]</span>  [ - Decrement ]  [ Q Quit ]              <span style="color:#58a6ff">│</span>
<span style="color:#58a6ff">╰─────────────────────────────────────────────────────────────╯</span>`,
    code: `import { Box, Text, Button, Row, Divider } from '@celestial/core/jsx';
import { color } from '@celestial/core';

export const view = (model) => (
  <Box border="rounded" padding={1} borderColor={color.brightCyan}>
    <Text bold color={color.brightWhite}>🚀 Launch Mission Control</Text>
    <Divider />
    <Text color={color.brightCyan}>Current Count: {model.count}</Text>
    <Row gap={2}>
      <Button label="[ + Increment ]" focused={true} onClick={() => ({ type: 'inc' })} />
      <Button label="[ - Decrement ]" onClick={() => ({ type: 'dec' })} />
      <Button label="[ Q Quit ]" onClick={() => ({ type: 'quit' })} />
    </Row>
  </Box>
);`,
  },
};

let currentKey = 'tool-call';

function selectComponent(key) {
  currentKey = key;
  const comp = COMPONENTS[key];
  if (!comp) return;

  // Update Nav
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.remove('active');
    if (btn.getAttribute('onclick')?.includes(`'${key}'`)) {
      btn.classList.add('active');
    }
  });

  // Update Terminal Output
  document.getElementById('terminal-screen').innerHTML = comp.screen;
  document.getElementById('code-snippet').textContent = comp.code;
  document.getElementById('code-filename').textContent = comp.filename;
}

function copyCode() {
  const comp = COMPONENTS[currentKey];
  if (comp) {
    navigator.clipboard.writeText(comp.code);
    const btn = document.querySelector('.code-header .copy-btn');
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }
}

function copyCommand(text) {
  navigator.clipboard.writeText(text);
  const btn = document.querySelector('.code-pill .copy-btn');
  const orig = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => { btn.textContent = orig; }, 1500);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  selectComponent('tool-call');
});
