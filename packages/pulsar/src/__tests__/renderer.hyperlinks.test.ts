import { describe, expect, it, vi } from 'vitest';
import { renderMarkdown } from '../renderer.js';

vi.mock('@celestial/nexus', () => ({
  hyperlink: (text: string, url: string) => `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`,
}));

function stripTerminalControls(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

describe('renderMarkdown with OSC 8 hyperlinks', () => {
  it('wraps using visible link text width and preserves hyperlinks across wrapped lines', () => {
    const result = renderMarkdown('Prefix [linked text that should wrap cleanly](https://example.com/docs) suffix', {
      hyperlinks: true,
      width: 18,
    });

    const lines = result.split('\n');
    expect(lines.length).toBeGreaterThan(1);

    for (const line of lines) {
      expect(stripTerminalControls(line).length).toBeLessThanOrEqual(18);
    }

    const hyperlinkLines = lines.filter(
      (line) => stripTerminalControls(line).includes('linked') || stripTerminalControls(line).includes('text') || stripTerminalControls(line).includes('wrap'),
    );
    expect(hyperlinkLines.length).toBeGreaterThan(0);
    for (const line of hyperlinkLines) {
      expect(line).toContain('\x1b]8;;https://example.com/docs\x07');
      expect(line).toContain('\x1b]8;;\x07');
    }
  });

  it('renders hyperlinks inside table cells', () => {
    const result = renderMarkdown('| Name | Link |\n| --- | --- |\n| Docs | [guide](https://example.com/guide) |', {
      hyperlinks: true,
    });

    expect(stripTerminalControls(result)).toContain('guide');
    expect(result).toContain('\x1b]8;;https://example.com/guide\x07');
    expect(result).toContain('\x1b]8;;\x07');
  });

  it('composes theme styling with the OSC 8 payload via linkText', () => {
    const result = renderMarkdown('see [docs](https://example.com/docs)', {
      hyperlinks: true,
    });
    // The OSC 8 wrap must contain SGR codes from the theme (underline/color)
    // so that the clickable text is also visibly styled.
    // eslint-disable-next-line no-control-regex
    const inside = result.match(/\x1b\]8;;https:\/\/example\.com\/docs\x07(.*?)\x1b\]8;;\x07/s);
    expect(inside).not.toBeNull();
    expect(inside![1]).toMatch(/\x1b\[[0-9;]+m/); // contains at least one SGR sequence
    expect(inside![1]).toContain('docs');
    // And it must NOT contain the visible "(url)" suffix we would get from theme.link
    expect(inside![1]).not.toContain('(https://example.com/docs)');
  });
});
