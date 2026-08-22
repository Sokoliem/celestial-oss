import { cmdKind } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import { diffViewer, parseUnifiedDiff } from '../diff-viewer.js';
import { toolCall } from '../tool-call.js';

describe('toolCall component', () => {
  it('initializes from config and owns collapsed state', () => {
    const component = toolCall({ name: 'bash', status: 'running', input: { command: 'pnpm test' }, durationMs: 1250 });
    const [model, cmd] = component.init();
    expect(model).toEqual({ collapsed: false, hovered: false, focused: false });
    expect(cmdKind(cmd).kind).toBe('none');
  });

  it('toggles collapsed via update and notifies the host callback', () => {
    const states: boolean[] = [];
    const component = toolCall({ name: 'bash', status: 'success', collapsed: true, onToggle: (c) => states.push(c) });
    const [initial] = component.init();
    expect(initial.collapsed).toBe(true);

    const [expanded] = component.update({ type: 'toggle' }, initial);
    expect(expanded.collapsed).toBe(false);
    expect(states).toEqual([false]);

    const [reCollapsed] = component.update({ type: 'toggle' }, expanded);
    expect(reCollapsed.collapsed).toBe(true);
    expect(states).toEqual([false, true]);
  });

  it('derives one deterministic interaction id across view calls', () => {
    const component = toolCall({ name: 'bash', status: 'success' });
    const [model] = component.init();
    const a = component.view(model);
    const b = component.view(model);
    expect(a.kind).toBe('event');
    expect(b.kind).toBe('event');
    if (a.kind === 'event' && b.kind === 'event') {
      expect(a.id).toBe(b.id);
      expect(a.id).toContain('tool-call-bash');
    }
  });

  it('gates the keyboard toggle behind focus and maps mouse regions', () => {
    const component = toolCall({ name: 'bash', status: 'success' });
    const [base] = component.init();

    // Unfocused: no key subscriptions.
    const unfocused = component.subscriptions?.(base);
    expect(unfocused).toBeDefined();

    const [focused] = component.update({ type: 'focus' }, base);
    const withKeys = component.subscriptions?.(focused);
    expect(withKeys).toBeDefined();
    expect(withKeys).not.toEqual(unfocused);
  });

  it('renders expanded content with truncation indicators for long input/output', () => {
    const component = toolCall({
      name: 'bash',
      status: 'success',
      input: Array.from({ length: 12 }, (_, i) => `in-${i}`).join('\n'),
      output: Array.from({ length: 20 }, (_, i) => `out-${i}`).join('\n'),
      maxInputLines: 5,
      maxOutputLines: 8,
    });
    const [model] = component.init();
    const view = component.view(model);

    const texts: string[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const v = node as { kind?: string; content?: string; children?: unknown[]; child?: unknown };
      if (v.kind === 'text' && typeof v.content === 'string') texts.push(v.content);
      if (Array.isArray(v.children)) v.children.forEach(walk);
      if (v.child) walk(v.child);
    };
    walk(view);

    expect(texts.some((t) => t.includes('7 more lines'))).toBe(true); // input: 12 - 5
    expect(texts.some((t) => t.includes('12 more lines'))).toBe(true); // output: 20 - 8
  });
});

describe('parseUnifiedDiff', () => {
  it('parses a standard patch with correct line numbers', () => {
    const rawDiff = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 const a = 1;
-const b = 2;
+const b = 3;
 const c = 4;`;

    const lines = parseUnifiedDiff(rawDiff);
    expect(lines).toHaveLength(7);
    expect(lines[3]).toMatchObject({ type: 'context', oldLineNumber: 1, newLineNumber: 1, content: 'const a = 1;' });
    expect(lines[4]).toMatchObject({ type: 'delete', oldLineNumber: 2, content: 'const b = 2;' });
    expect(lines[5]).toMatchObject({ type: 'add', newLineNumber: 2, content: 'const b = 3;' });
    expect(lines[6]).toMatchObject({ type: 'context', oldLineNumber: 3, newLineNumber: 3 });
  });

  it('returns [] for empty input instead of a phantom context line', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
  });

  it('does not emit a phantom line for a trailing newline', () => {
    const lines = parseUnifiedDiff('@@ -1 +1 @@\n-a\n+b\n');
    expect(lines).toHaveLength(3);
  });

  it('attaches "\\ No newline at end of file" to the previous line without corrupting counters', () => {
    const rawDiff = `@@ -1,2 +1,2 @@
-old
\\ No newline at end of file
+new
\\ No newline at end of file`;
    const lines = parseUnifiedDiff(rawDiff);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatchObject({ type: 'delete', oldLineNumber: 1, eofNoNewline: true });
    expect(lines[2]).toMatchObject({ type: 'add', newLineNumber: 1, eofNoNewline: true });
  });

  it('treats deleted content starting with --- as content, not a file header', () => {
    const rawDiff = `--- a/schema.sql
+++ b/schema.sql
@@ -1,2 +1,2 @@
--- comment line
+-- updated comment`;
    const lines = parseUnifiedDiff(rawDiff);
    const deleted = lines.find((l) => l.type === 'delete');
    expect(deleted).toMatchObject({ content: '-- comment line', oldLineNumber: 1 });
    // The file headers are exactly the first two lines.
    expect(lines[0]).toMatchObject({ type: 'header', content: '--- a/schema.sql' });
    expect(lines[1]).toMatchObject({ type: 'header', content: '+++ b/schema.sql' });
  });

  it('keeps metadata and binary notices unnumbered', () => {
    const rawDiff = `diff --git a/logo.png b/logo.png
new file mode 100644
index 0000000..8f3a2c1
Binary files a/logo.png and b/logo.png differ`;
    const lines = parseUnifiedDiff(rawDiff);
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      expect(line.type).toBe('header');
      expect(line.oldLineNumber).toBeUndefined();
      expect(line.newLineNumber).toBeUndefined();
    }
  });

  it('handles multiple hunks with counter resets', () => {
    const rawDiff = `@@ -1,1 +1,1 @@
-a
+b
@@ -10,1 +10,1 @@
-c
+d`;
    const lines = parseUnifiedDiff(rawDiff);
    expect(lines[4]).toMatchObject({ type: 'delete', oldLineNumber: 10 });
    expect(lines[5]).toMatchObject({ type: 'add', newLineNumber: 10 });
  });

  it('preserves combined-diff hunk content as unnumbered context', () => {
    const rawDiff = `diff --cc merged.ts
@@@ -1,2 -1,2 +1,2 @@@
  context
++added`;
    const lines = parseUnifiedDiff(rawDiff);
    expect(lines[1]).toMatchObject({ type: 'header' });
    const body = lines.slice(2);
    for (const line of body) {
      expect(line.type).toBe('context');
      expect(line.oldLineNumber).toBeUndefined();
      expect(line.newLineNumber).toBeUndefined();
    }
  });
});

describe('diffViewer component', () => {
  it('renders a titled diff as a bordered box', () => {
    const node = diffViewer({ diffText: '@@ -1,2 +1,2 @@\n-old value\n+new value', title: 'src/config.ts' });
    expect(node.kind).toBe('box');
  });

  it('sizes the title divider to the configured width', () => {
    const narrow = diffViewer({ diffText: '@@ -1 +1 @@\n-a\n+b', title: 't', width: 30 });
    const wide = diffViewer({ diffText: '@@ -1 +1 @@\n-a\n+b', title: 't', width: 60 });
    const dividerOf = (node: unknown): string | undefined => {
      const texts: string[] = [];
      const walk = (n: unknown): void => {
        if (!n || typeof n !== 'object') return;
        const v = n as { kind?: string; content?: string; children?: unknown[]; child?: unknown };
        if (v.kind === 'text' && typeof v.content === 'string' && v.content.startsWith('─')) texts.push(v.content);
        if (Array.isArray(v.children)) v.children.forEach(walk);
        if (v.child) walk(v.child);
      };
      walk(node);
      return texts[0];
    };
    expect(dividerOf(narrow)).toHaveLength(28);
    expect(dividerOf(wide)).toHaveLength(58);
  });
});
