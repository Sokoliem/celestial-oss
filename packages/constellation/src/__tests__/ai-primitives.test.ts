import { describe, expect, it } from 'vitest';
import { diffViewer, parseUnifiedDiff } from '../diff-viewer.js';
import { toolCall } from '../tool-call.js';

describe('AI & Agentic CLI Primitives', () => {
  it('renders toolCall with running status and timings', () => {
    const card = toolCall({
      name: 'bash',
      status: 'running',
      input: { command: 'pnpm test' },
      durationMs: 1250,
    });

    expect(card.kind).toBe('box');
    expect(card.children.length).toBe(1);
    expect(card.children[0].kind).toBe('column');
  });

  it('renders toolCall in collapsed mode', () => {
    const card = toolCall({
      name: 'view_file',
      status: 'success',
      input: { path: '/foo/bar.ts' },
      output: 'const x = 1;',
      collapsed: true,
    });

    expect(card.kind).toBe('box');
    // In collapsed mode, child is the header row
    expect(card.children[0].kind).toBe('row');
  });

  it('parses unified diff patch into structured DiffLine entries', () => {
    const rawDiff = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 const a = 1;
-const b = 2;
+const b = 3;
 const c = 4;`;

    const lines = parseUnifiedDiff(rawDiff);
    expect(lines.length).toBe(7);
    expect(lines[0].type).toBe('header');
    expect(lines[1].type).toBe('header');
    expect(lines[2].type).toBe('header');
    expect(lines[3].type).toBe('context');
    expect(lines[4].type).toBe('delete');
    expect(lines[4].content).toBe('const b = 2;');
    expect(lines[5].type).toBe('add');
    expect(lines[5].content).toBe('const b = 3;');
  });

  it('renders diffViewer component with line numbers and styling', () => {
    const rawDiff = `@@ -1,2 +1,2 @@
-old value
+new value`;

    const diffNode = diffViewer({
      diffText: rawDiff,
      title: 'src/config.ts',
      showLineNumbers: true,
    });

    expect(diffNode.kind).toBe('box');
  });
});
